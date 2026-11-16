-- ACH-4: wynik odblokowań dostaje wyłącznie żądanie zapisujące partię.
-- Osobny RPC zachowuje kontrakt i walidację save_play (również dla starszych klientów).
-- Potwierdzenie w private przeżywa utratę odpowiedzi. Inny identyfikator żądania/autor
-- dostaje pustą listę; nie ma kolejki do odczytu po odświeżeniu ani subskrypcji Realtime.
create table private.play_save_notifications (
  play_id uuid primary key references public.plays(id) on delete cascade,
  request_id uuid not null,
  requested_by uuid not null,
  unlocks jsonb not null default '[]'::jsonb
);
revoke all on private.play_save_notifications from public, anon, authenticated;

-- AFTER INSERT obejmuje tylko nowe pary gracz/odznaka. Przesunięcie daty/partii istniejącej
-- odznaki przez ON CONFLICT DO UPDATE w przeliczeniu nie tworzy powiadomienia.
create function private.capture_achievement_notification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update private.play_save_notifications n
     set unlocks = n.unlocks || jsonb_build_array(jsonb_build_object(
       'profile_id', new.profile_id, 'achievement_id', new.achievement_id))
   where n.play_id = nullif(current_setting('bg_club.notification_play', true), '')::uuid;
  return null;
end;
$$;
revoke execute on function private.capture_achievement_notification() from public, anon, authenticated;

create trigger achievement_unlocks_notify_insert
  after insert on public.achievement_unlocks
  for each row execute function private.capture_achievement_notification();

create function public.save_play_with_achievements(
  play_id uuid, scorepad_version_id uuid, sheet jsonb, results jsonb, request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.plays;
  receipt private.play_save_notifications;
  previous_context text := current_setting('bg_club.notification_play', true);
begin
  perform private.require_meeting_runner(private.play_meeting(save_play_with_achievements.play_id));
  if request_id is null then
    raise exception 'request_id is required' using errcode = '22023';
  end if;

  -- Klucz partii szereguje wywołania wrappera przed save_play. Nie dodajemy blokady
  -- przeliczania przed blokadami spotkania/partii, co odwróciłoby ich kolejność.
  insert into private.play_save_notifications (play_id, request_id, requested_by)
  values (play_id, request_id, auth.uid())
  on conflict on constraint play_save_notifications_pkey do nothing;

  select n.* into receipt from private.play_save_notifications n
   where n.play_id = save_play_with_achievements.play_id for update;

  perform set_config('bg_club.notification_play', play_id::text, true);
  saved := public.save_play(play_id, scorepad_version_id, sheet, results);
  perform set_config('bg_club.notification_play', coalesce(previous_context, ''), true);

  -- save_play zawsze waliduje treść i uprawnienia, także przy ponowieniu i po zakończeniu.
  -- Błąd wycofuje też potwierdzenie i odblokowania w tej samej transakcji.
  if receipt.request_id = request_id and receipt.requested_by = auth.uid() then
    select n.* into receipt from private.play_save_notifications n where n.play_id = saved.id;
    return jsonb_build_object('id', saved.id, 'unlocks', receipt.unlocks);
  end if;
  return jsonb_build_object('id', saved.id, 'unlocks', '[]'::jsonb);
end;
$$;

comment on function public.save_play_with_achievements(uuid, uuid, jsonb, jsonb, uuid) is
  'ACH-4: save_play i nowe odblokowania w jednej transakcji. Ponowienie tego samego żądania odzyskuje wynik; inne żądanie/urządzenie dostaje pustą listę.';
revoke execute on function public.save_play_with_achievements(uuid, uuid, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.save_play_with_achievements(uuid, uuid, jsonb, jsonb, uuid) to authenticated;
