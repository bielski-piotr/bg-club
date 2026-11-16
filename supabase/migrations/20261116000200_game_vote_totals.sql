-- GAME-12: suma istniejących głosów ze wszystkich spotkań, także po publikacji.
-- Cofnięcie głosu i kaskady usuwania zmniejszają wynik przy kolejnym odczycie.
-- private.meeting_voters to migawka uczestnictwa w głosowaniu dla voter-10, bez game_id.
-- Nie doliczamy jej i nie udostępniamy klientowi. Publikacja zachowuje game_votes.
create function public.game_vote_total(game_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select (select count(*) from public.game_votes v where v.game_id = g.id)
    from public.games g
   where g.id = game_vote_total.game_id;
$$;

comment on function public.game_vote_total(uuid) is
  'GAME-12: liczba istniejących głosów na grę we wszystkich spotkaniach. RLS aktywnego członka; NULL bez gry lub dostępu. Migawki voter-10 nie są głosami na grę.';

revoke execute on function public.game_vote_total(uuid) from public, anon;
grant execute on function public.game_vote_total(uuid) to authenticated;
