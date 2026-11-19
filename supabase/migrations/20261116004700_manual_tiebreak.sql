-- Manual resolves only ties left by earlier category rules.
-- Keep save_play and its ACL/idempotency contract intact.
create or replace function private.scorepad_ranking(template jsonb, out dir text, out tiebreak boolean)
language plpgsql
immutable
set search_path = ''
as $$
declare
  ranking jsonb := template -> 'ranking';
  numeric_lines text[];
  valid boolean;
begin
  dir := 'desc';
  tiebreak := false;
  if jsonb_typeof(ranking) is distinct from 'object' or jsonb_typeof(template -> 'lines') is distinct from 'array' then
    return;
  end if;
  numeric_lines := array(
    select l ->> 'id' from jsonb_array_elements(template -> 'lines') l
     where jsonb_typeof(l) = 'object' and l ->> 'kind' in ('input', 'sum', 'bonus', 'total')
  );
  valid := jsonb_typeof(ranking -> 'line') = 'string'
    and (ranking ->> 'line') = any (numeric_lines)
    and jsonb_typeof(ranking -> 'dir') = 'string'
    and (ranking ->> 'dir') in ('asc', 'desc')
    and jsonb_typeof(ranking -> 'tiebreak') = 'array'
    and not exists (
      select 1 from jsonb_array_elements(ranking -> 'tiebreak') r
       where jsonb_typeof(r) is distinct from 'object'
          or not (
            (r ->> 'type') in ('shared', 'manual')
            or ((r ->> 'type') = 'line'
                and jsonb_typeof(r -> 'line') = 'string' and (r ->> 'line') = any (numeric_lines)
                and jsonb_typeof(r -> 'dir') = 'string' and (r ->> 'dir') in ('asc', 'desc'))
          )
    );
  if valid then
    dir := ranking ->> 'dir';
    tiebreak := coalesce((ranking -> 'tiebreak' -> 0 ->> 'type') in ('line', 'manual'), false);
  end if;
end;
$$;

-- CREATE OR REPLACE preserves the existing ACL, including authenticated reads for stats.

-- Same dependencies as effectiveOf in packages/scoring/src/totals.ts.
create function private.manual_score_of(template jsonb, line_id text)
returns text[] language plpgsql immutable set search_path = '' as $$
declare
  line jsonb;
  idx int;
  previous_sum int;
begin
  select l.value, l.ordinality::int into line, idx
    from jsonb_array_elements(template -> 'lines') with ordinality l
    where l.value ->> 'id' = line_id;
  if jsonb_typeof(line -> 'of') = 'array' then
    return array(select v from jsonb_array_elements_text(line -> 'of') v
      where v <> line_id and exists (
        select 1 from jsonb_array_elements(template -> 'lines') l where l ->> 'id' = v));
  end if;
  if line ->> 'kind' = 'total' then
    return array(select l ->> 'id' from jsonb_array_elements(template -> 'lines') l
      where l ->> 'kind' in ('input', 'bonus'));
  end if;
  select max(l.ordinality)::int into previous_sum
    from jsonb_array_elements(template -> 'lines') with ordinality l
    where l.ordinality < idx and l.value ->> 'kind' = 'sum';
  if previous_sum is not null and line ->> 'kind' = 'bonus' then
    return private.manual_score_of(template, template -> 'lines' -> (previous_sum - 1) ->> 'id');
  end if;
  return array(select l.value ->> 'id'
    from jsonb_array_elements(template -> 'lines') with ordinality l
    where l.ordinality > coalesce(previous_sum, 0) and l.ordinality < idx
      and l.value ->> 'kind' = 'input');
end;
$$;

-- Input leaves for the completion condition of legacy bonus categories.
create function private.manual_score_leaves(template jsonb, ids text[], seen text[] default '{}')
returns text[] language plpgsql immutable set search_path = '' as $$
declare
  id text;
  kind text;
  leaves text[] := array[]::text[];
begin
  foreach id in array ids loop
    if id = any(seen) then continue; end if;
    seen := array_append(seen, id);
    select l ->> 'kind' into kind from jsonb_array_elements(template -> 'lines') l where l ->> 'id' = id;
    if kind = 'input' then leaves := array_append(leaves, id);
    elsif kind in ('sum', 'total') then
      leaves := leaves || private.manual_score_leaves(template, private.manual_score_of(template, id), seen);
    end if;
  end loop;
  return leaves;
end;
$$;

-- Compute the category from scores, never from a client-supplied total.
create function private.manual_score_value(template jsonb, scores jsonb, line_id text, seen text[] default '{}')
returns numeric language plpgsql immutable set search_path = '' as $$
declare
  line jsonb;
  ids text[];
  leaves text[];
  value numeric;
begin
  if line_id = any(seen) then return null; end if;
  select l into line from jsonb_array_elements(template -> 'lines') l where l ->> 'id' = line_id;
  if line ->> 'kind' = 'input' then return (scores ->> line_id)::numeric; end if;
  if line ->> 'kind' not in ('sum', 'total', 'bonus') or line is null then return null; end if;
  ids := private.manual_score_of(template, line_id);
  select sum(private.manual_score_value(template, scores, id, array_append(seen, line_id))) into value
    from unnest(ids) id;
  if line ->> 'kind' = 'bonus' then
    if value >= coalesce((line ->> 'threshold')::numeric, 0) then
      return coalesce((line ->> 'bonus')::numeric, 0);
    end if;
    leaves := private.manual_score_leaves(template, ids);
    return case when cardinality(leaves) > 0 and not exists (
      select 1 from unnest(leaves) id where scores ->> id is null) then 0 else null end;
  end if;
  return value;
end;
$$;

-- Validate all results together before marking the play saved. This does not replace
-- save_play, so existing runner authorization, locks, points and retry handling still apply.
create function private.guard_manual_tiebreak()
returns trigger language plpgsql set search_path = '' as $$
declare
  template jsonb;
  rule jsonb;
  a record;
  b record;
  av numeric;
  bv numeric;
  compared int;
  rules jsonb := '[]';
  manual boolean := false;
begin
  select v.template into template from public.scorepad_versions v where v.id = new.scorepad_version_id;
  if not (select r.tiebreak from private.scorepad_ranking(template) r) then return new; end if;
  for rule in select value from jsonb_array_elements(coalesce(template -> 'ranking' -> 'tiebreak', '[]')) loop
    if rule ->> 'type' <> 'line' then
      manual := rule ->> 'type' = 'manual';
      exit;
    end if;
    rules := rules || jsonb_build_array(rule);
  end loop;
  if not manual then return new; end if;
  for a in select * from public.play_results where play_id = new.id loop
    for b in select * from public.play_results where play_id = new.id and seat > a.seat loop
      -- Primary category ordering is already checked by save_play.
      if a.ranking_value is distinct from b.ranking_value then continue; end if;
      for rule in select value from jsonb_array_elements(rules) loop
        av := private.manual_score_value(template, a.scores, rule ->> 'line');
        bv := private.manual_score_value(template, b.scores, rule ->> 'line');
        compared := case when av is not distinct from bv then 0
          when av is null then 1 when bv is null then -1
          when rule ->> 'dir' = 'asc' then case when av < bv then -1 else 1 end
          else case when av > bv then -1 else 1 end end;
        if compared = 0 then continue; end if;
        if (compared < 0 and a.place >= b.place) or (compared > 0 and a.place <= b.place) then
          raise exception 'manual decision changes an already resolved group'
            using errcode = '23514', hint = 'plays_results_ranking';
        end if;
        exit;
      end loop;
    end loop;
  end loop;
  return new;
end;
$$;

create trigger plays_manual_tiebreak
  before update of status on public.plays
  for each row when (old.status = 'draft' and new.status = 'saved')
  execute function private.guard_manual_tiebreak();

revoke execute on function private.manual_score_of(jsonb, text),
  private.manual_score_leaves(jsonb, text[], text[]),
  private.manual_score_value(jsonb, jsonb, text, text[]),
  private.guard_manual_tiebreak() from public, anon, authenticated;
