-- RUN-5, Q10: tylko admin cofa zakończenie, bez zmiany historii spotkania i partii.
-- Indeks meetings_single_in_progress szereguje także równoległe starty i otwarcia.
-- meetings_after_change przelicza osiągnięcia przy wyjściu z / powrocie do finished.
-- Podsumowania i serie są liczone z zapisanych partii przy odczycie.
create function public.reopen_meeting(meeting_id uuid)
returns public.meetings
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_meeting public.meetings;
  saved public.meetings;
begin
  perform private.require_admin();

  select m.* into current_meeting from public.meetings m
   where m.id = reopen_meeting.meeting_id for update;
  if not found then
    raise exception 'meeting does not exist'
      using errcode = 'P0002', hint = 'meetings_not_found';
  end if;
  if current_meeting.status <> 'finished' then
    raise exception 'meeting is not finished'
      using errcode = '23514', hint = 'meetings_reopen_finished';
  end if;

  begin
    update public.meetings m
       set status = 'in_progress', finished_at = null
     where m.id = current_meeting.id
    returning * into saved;
  exception when unique_violation then
    raise exception 'another meeting is in progress'
      using errcode = '23505', constraint = 'meetings_single_in_progress',
            hint = 'meetings_single_in_progress';
  end;
  return saved;
end;
$$;

comment on function public.reopen_meeting(uuid) is
  'Cofa zakończenie spotkania (RUN-5, Q10). Tylko admin; bez usuwania partii, wyników i snapshotów. Jedno spotkanie w trakcie (MTG-2).';

revoke execute on function public.reopen_meeting(uuid) from public, anon;
grant execute on function public.reopen_meeting(uuid) to authenticated;
