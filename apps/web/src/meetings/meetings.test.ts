import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import {
  deleteMeeting,
  finishMeeting,
  MeetingError,
  meetingFailure,
  saveMeeting,
  startMeeting,
  type MeetingFailure,
} from './meetings';

describe('błędy spotkań (reguły bazy [023])', () => {
  it('czyta nazwę reguły z HINT', () => {
    const cases: [string, string, MeetingFailure][] = [
      ['23505', 'meetings_single_in_progress', 'otherInProgress'],
      ['23514', 'meetings_no_drafts_when_finished', 'drafts'],
      ['23514', 'meetings_participant_has_play', 'participantHasPlay'],
      ['23514', 'meetings_local_time_exists', 'localTime'],
      ['23514', 'meetings_schedule_locked', 'locked'],
      ['23514', 'meetings_finished_locked', 'finished'],
      ['23514', 'meetings_start_planned', 'notPlanned'],
      ['23514', 'meetings_finish_in_progress', 'notInProgress'],
      ['23514', 'meetings_delete_in_progress', 'deleteInProgress'],
      ['23514', 'meetings_host_participant', 'hostInvalid'],
      ['23514', 'meetings_host_not_admin', 'hostInvalid'],
      ['23514', 'meetings_club_required', 'noClub'],
      ['23514', 'meetings_participants_required', 'noParticipants'],
      ['23514', 'meetings_status_transition', 'statusChanged'],
      ['23502', 'meetings_starts_at_required', 'dateRequired'],
      ['P0002', 'meetings_not_found', 'gone'],
    ];
    for (const [code, hint, reason] of cases) {
      expect(meetingFailure({ code, hint, message: 'x' })).toBe(reason);
    }
  });

  it('bez HINT rozpoznaje uprawnienia, klucze obce i usuniętego członka', () => {
    expect(meetingFailure({ code: '42501', message: 'administrator required' })).toBe('forbidden');
    expect(
      meetingFailure({
        code: '23503',
        message:
          'update or delete on table "meetings" violates foreign key constraint "plays_meeting_id_fkey" on table "plays"',
      }),
    ).toBe('hasPlays');
    expect(meetingFailure({ code: '23503', message: 'meeting_participants_profile_id_fkey' })).toBe(
      'save',
    );
    expect(
      meetingFailure({
        code: '23503',
        message:
          'update or delete on table "meeting_participants" violates foreign key constraint "play_results_meeting_id_profile_id_fkey" on table "play_results"',
      }),
    ).toBe('participantHasPlay');
    expect(
      meetingFailure({ code: '23514', message: 'deleted profile cannot join a meeting' }),
    ).toBe('participantDeleted');
    expect(
      meetingFailure({
        code: '23505',
        message: 'duplicate key value violates unique constraint "meetings_single_in_progress"',
      }),
    ).toBe('otherInProgress');
    expect(meetingFailure({ code: '08006', message: 'network' })).toBe('save');
    expect(meetingFailure({ code: 'XX', hint: 'nieznana', message: '' })).toBe('save');
  });

  it('każdy powód ma polski komunikat', () => {
    for (const message of Object.values(t.meetings.errors)) expect(message).not.toBe('');
    const reasons: MeetingFailure[] = [
      'forbidden',
      'gone',
      'otherInProgress',
      'drafts',
      'hasPlays',
    ];
    for (const reason of reasons) expect(t.meetings.errors[reason]).toBeTruthy();
  });
});

function fakeClient(result: { data?: unknown; error?: object | null }) {
  const rpc = vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null }));
  const select = vi.fn(async () => ({ data: result.data ?? [], error: result.error ?? null }));
  const eq = vi.fn(() => ({ select }));
  const remove = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ delete: remove }));
  return { client: { rpc, from } as unknown as SupabaseClient, rpc, from, eq };
}

describe('RPC spotkań', () => {
  it('save_meeting dostaje datę i godzinę w strefie klubu, tytuł bez spacji', async () => {
    const fake = fakeClient({});
    await saveMeeting(fake.client, {
      id: 'm1',
      values: {
        title: '  Granie ',
        date: '2026-11-28',
        time: '18:00',
        participants: ['a1'],
        hostId: null,
      },
      original: null,
    });
    expect(fake.rpc).toHaveBeenCalledWith('save_meeting', {
      meeting_id: 'm1',
      title: 'Granie',
      local_date: '2026-11-28',
      local_time: '18:00',
      participant_ids: ['a1'],
      host_id: null,
      is_new: true,
    });
  });

  it('edycja wysyła termin tylko po zmianie i nie tworzy spotkania na nowo', async () => {
    const original = {
      title: 'Granie',
      date: '2026-11-28',
      time: '18:00',
      participants: ['a1'],
      hostId: null,
    };
    const fake = fakeClient({});
    await saveMeeting(fake.client, {
      id: 'm1',
      values: { ...original, participants: ['a1', 'b2'] },
      original,
    });
    expect(fake.rpc).toHaveBeenLastCalledWith(
      'save_meeting',
      expect.objectContaining({ local_date: null, local_time: null, is_new: false }),
    );
    await saveMeeting(fake.client, { id: 'm1', values: { ...original, time: '19:00' }, original });
    expect(fake.rpc).toHaveBeenLastCalledWith(
      'save_meeting',
      expect.objectContaining({ local_date: '2026-11-28', local_time: '19:00', is_new: false }),
    );
    const gone = fakeClient({ error: { code: 'P0002', hint: 'meetings_not_found', message: 'x' } });
    await expect(
      saveMeeting(gone.client, { id: 'm1', values: original, original }),
    ).rejects.toMatchObject({ reason: 'gone' });
  });

  it('start i koniec zamieniają błąd bazy na powód', async () => {
    const conflict = fakeClient({ error: { code: '23505', hint: 'meetings_single_in_progress' } });
    await expect(startMeeting(conflict.client, 'm1')).rejects.toEqual(
      new MeetingError('otherInProgress'),
    );
    expect(conflict.rpc).toHaveBeenCalledWith('start_meeting', { meeting_id: 'm1' });
    const drafts = fakeClient({
      error: { code: '23514', hint: 'meetings_no_drafts_when_finished' },
    });
    await expect(finishMeeting(drafts.client, 'm1')).rejects.toMatchObject({ reason: 'drafts' });
    await expect(finishMeeting(fakeClient({}).client, 'm1')).resolves.toBeUndefined();
  });

  it('usunięcie: brak wiersza to „gone”, partie blokują (PLAN-5)', async () => {
    const ok = fakeClient({ data: [{ id: 'm1' }] });
    await expect(deleteMeeting(ok.client, 'm1')).resolves.toBeUndefined();
    expect(ok.eq).toHaveBeenCalledWith('id', 'm1');
    await expect(deleteMeeting(fakeClient({ data: [] }).client, 'm1')).rejects.toMatchObject({
      reason: 'gone',
    });
    await expect(
      deleteMeeting(
        fakeClient({ error: { code: '23503', message: 'violates "plays_meeting_id_fkey"' } })
          .client,
        'm1',
      ),
    ).rejects.toMatchObject({ reason: 'hasPlays' });
  });
});
