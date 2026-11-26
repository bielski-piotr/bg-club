import { captureArtifact, expectNoDiagnostics } from '@solidjs/diagnostics';
import { fireEvent, within } from '@solidjs/testing-library';
import { QueryClient } from '@tanstack/query-core';
import { flush } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContextValue } from '../auth/authContext';
import type { OwnProfile } from '../auth/ownProfile';
import { clubKey } from '../club/club';
import type { PopupApi, PopupLevel } from '../popups/popupContext';
import { allProfilesKey, membersKey, type Profile } from '../profile/profileQueries';
import { renderWithProviders } from '../test/render';
import { CalendarPopup } from './CalendarPopup';
import { monthOf } from './calendar';
import { DateVotingSection } from './DateVotingSection';
import { meetingDateOptionsKey, type DateOption } from './dateVoting';
import { DeleteMeetingDialog } from './DeleteMeetingDialog';
import { AddMeetingPopup, EditMeetingPopup } from './MeetingFormPopup';
import { meetingKey, meetingPlayersKey, type Meeting } from './meetings';
import { calendarKey, timelineKey, type MeetingOverview } from './overview';
import { TimelineWidget } from './TimelineWidget';

/*
 * Obszar Spotkania – planowanie: Timeline,
 * kalendarz, formularz spotkania, głosowanie na termin i usuwanie. Zachowanie sprawdzają e2e
 * (`calendar.spec.ts`, `meetings.spec.ts`, `date-voting.spec.ts`, `hub.spec.ts`); tu bramka
 * bez kodów diagnostyki Solid dla renderu i interakcji. Dane są fikcyjne.
 */

const id = (group: string, n: number) =>
  `00000000-0000-4000-${group}-${String(n).padStart(12, '0')}`;

const ME: OwnProfile = {
  id: id('a000', 1),
  hook: 'ada-testowa-a001',
  first_name: 'Ada',
  last_name: 'Testowa',
  role: 'admin',
  avatar_path: null,
  deleted_at: null,
  theme: 'system',
  password_change_suggested: false,
};

const MEMBER: Profile = {
  id: id('a000', 2),
  hook: 'bartek-probny-a002',
  first_name: 'Bartek',
  last_name: 'Próbny',
  role: 'player',
  avatar_path: null,
  deleted_at: null,
};

function meeting(n: number, title: string, extra: Partial<Meeting> = {}): Meeting {
  return {
    id: id('d000', n),
    title,
    starts_at: '2026-11-28T17:00:00Z',
    status: 'planned',
    voting_open: true,
    date_voting_open: true,
    host_id: null,
    started_at: null,
    finished_at: null,
    participants: [ME.id, MEMBER.id],
    ...extra,
  };
}

const PLANNED = meeting(1, 'Sobotnie granie');
const FINISHED = meeting(2, 'Wieczór z Azulem', {
  starts_at: '2026-11-10T17:00:00Z',
  status: 'finished',
  voting_open: false,
  date_voting_open: false,
  started_at: '2026-11-10T17:00:00Z',
  finished_at: '2026-11-10T21:00:00Z',
});
const RUNNING = meeting(3, 'Granie w toku', {
  starts_at: '2026-11-20T09:00:00Z',
  status: 'in_progress',
  voting_open: false,
  date_voting_open: false,
  started_at: '2026-11-20T09:00:00Z',
});

const overview = (m: Meeting, playCount: number, winners: string[]): MeetingOverview => ({
  ...m,
  playCount,
  winners,
});

const OPTIONS: DateOption[] = [
  { id: id('e000', 1), starts_at: '2026-11-28T17:00:00Z', voters: [ME.id] },
  { id: id('e000', 2), starts_at: '2026-11-29T16:00:00Z', voters: [ME.id, MEMBER.id] },
];

function host() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  queryClient.setQueryData(clubKey, { name: 'Klub', logo_path: null, timezone: 'Europe/Warsaw' });
  queryClient.setQueryData(membersKey, [ME, MEMBER]);
  queryClient.setQueryData(
    allProfilesKey,
    new Map<string, Profile>([
      [ME.id, ME],
      [MEMBER.id, MEMBER],
    ]),
  );
  queryClient.setQueryData(timelineKey, {
    upcoming: [overview(PLANNED, 0, [])],
    finished: [overview(FINISHED, 2, [ME.id])],
  });
  const month = monthOf('2026-11-20');
  queryClient.setQueryData(calendarKey(month), [
    overview(FINISHED, 2, [ME.id]),
    overview(RUNNING, 1, []),
    overview(PLANNED, 0, []),
  ]);
  queryClient.setQueryData(calendarKey({ year: 2026, month: 12 }), []);
  for (const each of [PLANNED, FINISHED, RUNNING])
    queryClient.setQueryData(meetingKey(each.id), each);
  queryClient.setQueryData(meetingKey(id('d000', 9)), null);
  queryClient.setQueryData(meetingDateOptionsKey(PLANNED.id), OPTIONS);
  queryClient.setQueryData(meetingPlayersKey(RUNNING.id), new Set([MEMBER.id]));
  const done = Promise.resolve({ data: null, error: null });
  const rpc = vi.fn(() => done);
  // Głos na termin: `insert`, a cofnięcie `delete().eq().eq().select()` z usuniętym wierszem.
  const chain: Record<string, unknown> = {
    insert: () => done,
    delete: () => chain,
    eq: () => chain,
    select: () => Promise.resolve({ data: [{ option_id: 'x' }], error: null }),
  };
  const from = vi.fn(() => chain);
  const popups: PopupApi = {
    stack: [{ kind: 'calendar' }],
    open: vi.fn(),
    back: vi.fn(),
    backBy: vi.fn(),
    replace: vi.fn(),
    closeAll: vi.fn(),
    hrefFor: () => '/?p=x',
  };
  const popupLevel: PopupLevel = {
    level: 0,
    covered: false,
    onBack: undefined,
    onClose: vi.fn(),
    onScrimClick: vi.fn(),
  };
  const auth = {
    client: { rpc, from },
    state: { status: 'signedIn', session: { user: { id: ME.id } } },
    signOut: vi.fn(async () => undefined),
  } as unknown as AuthContextValue;
  return {
    queryClient,
    auth,
    popups,
    popupLevel,
    popupGuards: { set: vi.fn() },
    toast: { show: vi.fn(() => 1), dismiss: vi.fn() },
  };
}

const settle = async () => {
  await Promise.resolve();
  flush();
};

beforeEach(() => {
  // Tylko zegar dat: „dziś” w kalendarzu i formularzu, mikrozadania działają normalnie.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-20T10:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('obszar Spotkania (planowanie) bez diagnostyki Solid', () => {
  it('Timeline, kalendarz z nawigacją i planowaniem dnia, usuwanie', async () => {
    const { artifact } = await captureArtifact(
      async () => {
        const widget = renderWithProviders(() => <TimelineWidget />, host());
        await settle();
        const card = widget.container;
        expect(card).toHaveTextContent('Sobotnie granie');
        expect(card).toHaveTextContent('Wieczór z Azulem');
        expect(card).toHaveTextContent('Ada');
        expect(within(card).getAllByRole('link')).toHaveLength(3);
        widget.unmount();

        const calendarHost = host();
        const calendar = renderWithProviders(() => <CalendarPopup isAdmin />, calendarHost);
        await settle();
        const dialog = within(calendar.container).getByRole('dialog');
        expect(within(dialog).getAllByText('Sobotnie granie').length).toBeGreaterThan(0);
        expect(dialog).toHaveTextContent('3 spotkania');
        const plannable = within(dialog).getAllByRole('button', { name: /^Zaplanuj spotkanie / });
        fireEvent.click(plannable[0] as HTMLElement);
        await settle();
        expect(calendarHost.popups.open).toHaveBeenCalledWith(
          expect.objectContaining({ kind: 'add-meeting', date: expect.any(String) }),
        );
        fireEvent.click(within(dialog).getByRole('button', { name: 'Następny miesiąc' }));
        await settle();
        expect(dialog).toHaveTextContent('W tym miesiącu nie ma spotkań.');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Dziś' }));
        await settle();
        expect(dialog).toHaveTextContent('3 spotkania');
        calendar.unmount();

        const remove = renderWithProviders(() => <DeleteMeetingDialog id={PLANNED.id} />, host());
        await settle();
        expect(within(remove.container).getByRole('dialog')).toHaveTextContent('Sobotnie granie');
        remove.unmount();

        const running = renderWithProviders(() => <DeleteMeetingDialog id={RUNNING.id} />, host());
        await settle();
        expect(within(running.container).getByRole('dialog')).toHaveTextContent(
          'To spotkanie trwa. Najpierw je zakończ.',
        );
        running.unmount();
      },
      { scenario: 'meetings-plan-calendar' },
    );
    expectNoDiagnostics(artifact);
  });

  it('formularz spotkania z walidacją i propozycjami terminu, edycja, głosowanie na termin', async () => {
    const { artifact } = await captureArtifact(
      async () => {
        const add = renderWithProviders(
          () => <AddMeetingPopup me={ME} date="2026-11-27" />,
          host(),
        );
        await settle();
        const form = within(add.container).getByRole('dialog');
        expect(within(form).getByLabelText('Data')).toHaveValue('2026-11-27');
        fireEvent.click(within(form).getByRole('button', { name: 'Zaplanuj' }));
        await settle();
        expect(within(form).getByText('Popraw zaznaczone pola.')).toBeInTheDocument();
        fireEvent.input(within(form).getByLabelText('Tytuł'), {
          target: { value: 'Nowe granie' },
        });
        await settle();
        fireEvent.click(within(form).getByRole('button', { name: 'Zaznacz wszystkich' }));
        await settle();
        expect(form).toHaveTextContent('Wybrano 2 z 2');
        fireEvent.click(within(form).getByRole('checkbox', { name: 'Głosowanie na termin' }));
        await settle();
        fireEvent.click(within(form).getByRole('button', { name: 'Dodaj propozycję terminu' }));
        await settle();
        fireEvent.input(within(form).getByLabelText('Data propozycji 1'), {
          target: { value: '2026-11-30' },
        });
        await settle();
        expect(within(form).getByLabelText('Data propozycji 1')).toHaveValue('2026-11-30');
        fireEvent.click(within(form).getByRole('button', { name: 'Usuń propozycję 1' }));
        await settle();
        expect(within(form).queryByLabelText('Data propozycji 1')).toBeNull();
        expect(within(form).getByLabelText('Tytuł')).toHaveValue('Nowe granie');
        add.unmount();

        const edit = renderWithProviders(
          () => <EditMeetingPopup id={PLANNED.id} me={ME} />,
          host(),
        );
        await settle();
        const editForm = within(edit.container).getByRole('dialog');
        expect(within(editForm).getByLabelText('Tytuł')).toHaveValue('Sobotnie granie');
        expect(within(editForm).getByLabelText('Data propozycji 2')).toBeInTheDocument();
        edit.unmount();

        const inProgress = renderWithProviders(
          () => <EditMeetingPopup id={RUNNING.id} me={ME} />,
          host(),
        );
        await settle();
        const runningForm = within(inProgress.container).getByRole('dialog');
        expect(runningForm).toHaveTextContent('Ma partię');
        expect(within(runningForm).getByLabelText('Tytuł')).toBeDisabled();
        inProgress.unmount();

        const finished = renderWithProviders(
          () => <EditMeetingPopup id={FINISHED.id} me={ME} />,
          host(),
        );
        await settle();
        expect(within(finished.container).getByRole('dialog')).toHaveTextContent(
          'Spotkanie zakończone',
        );
        finished.unmount();

        const missing = renderWithProviders(
          () => <EditMeetingPopup id={id('d000', 9)} me={ME} />,
          host(),
        );
        await settle();
        expect(within(missing.container).getByRole('dialog')).toHaveTextContent(
          'Nie znaleziono spotkania',
        );
        missing.unmount();

        const votingHost = host();
        const voting = renderWithProviders(
          () => (
            <DateVotingSection
              meeting={PLANNED}
              me={ME}
              members={[ME, MEMBER]}
              timeZone="Europe/Warsaw"
            />
          ),
          votingHost,
        );
        await settle();
        const section = voting.container;
        expect(section).toHaveTextContent('Najwięcej głosów');
        expect(section).toHaveTextContent('Termin spotkania');
        const toggles = within(section).getAllByRole('button', { pressed: true });
        fireEvent.click(toggles[0] as HTMLElement);
        await settle();
        await vi.waitFor(() =>
          expect(votingHost.toast.show).toHaveBeenCalledWith(expect.any(String), 'success'),
        );
        fireEvent.click(
          within(section).getAllByRole('button', {
            name: /^Ustal termin spotkania/,
          })[1] as HTMLElement,
        );
        await settle();
        fireEvent.click(within(section).getByRole('button', { name: 'Zaproponuj' }));
        await settle();
        await vi.waitFor(() => expect(votingHost.auth.client.rpc).toHaveBeenCalled());
        voting.unmount();
      },
      { scenario: 'meetings-plan-form' },
    );
    expectNoDiagnostics(artifact);
  });
});
