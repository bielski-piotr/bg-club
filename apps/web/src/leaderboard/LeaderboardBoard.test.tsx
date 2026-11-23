import type { SupabaseClient } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/authContext';
import { PopupRouter } from '../popups/PopupRouter';
import type { Profile } from '../profile/profiles';
import { LeaderboardBoard } from './LeaderboardBoard';
import type { LeaderboardEntry } from './leaderboard';

const id = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`;

function entry(n: number, place: number, first: string, value: number, deleted = false) {
  return {
    place,
    profile_id: id(n),
    first_name: first,
    last_name: 'Bardzo-Długie-Nazwisko-Testowe',
    avatar_path: null,
    deleted,
    podium: !deleted && place <= 3,
    value,
    tied: false,
    reached_meeting_id: null,
    reached_meeting_title: null,
    reached_at: null,
    reached_points: null,
    wins: 0,
  } satisfies LeaderboardEntry;
}

function profilesOf(entries: readonly LeaderboardEntry[]): ReadonlyMap<string, Profile> {
  return new Map(
    entries.map((e) => [
      e.profile_id,
      {
        id: e.profile_id,
        hook: `${e.first_name.toLowerCase()}-test`,
        first_name: e.first_name,
        last_name: e.last_name,
        role: 'player',
        avatar_path: null,
        deleted_at: e.deleted ? '2026-11-01T10:00:00Z' : null,
      },
    ]),
  );
}

function renderBoard(
  entries: readonly LeaderboardEntry[],
  variant: 'widget' | 'popup',
  meId = id(1),
  kind: 'points' | 'wins' = 'points',
) {
  const auth = {
    client: {} as SupabaseClient,
    state: { status: 'signedIn', session: { user: { id: meId } } },
  } as unknown as AuthContextValue;
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={auth}>
        <PopupRouter>
          <LeaderboardBoard
            entries={entries}
            kind={kind}
            meId={meId}
            profiles={profilesOf(entries)}
            variant={variant}
          />
        </PopupRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

const BOARD = [
  entry(1, 1, 'Ada', 12),
  entry(2, 2, 'Bea', 12),
  entry(3, 3, 'Cela', 12),
  entry(4, 4, 'Dora', 12),
  entry(5, 5, 'Ewa', 8),
  entry(6, 6, 'Fela', 7),
  entry(7, 7, 'Gaja', 6),
  entry(8, 8, 'Hela', 5),
  entry(9, 9, 'Iga', 4),
  entry(10, 10, 'Jola', 3),
  entry(99, 11, 'Zoja', 40, true),
];

describe('ranking: podium i lista (LB-2, LB-3, LB-7)', () => {
  it('równy wynik nie dzieli miejsca: każdy stopień ma jedną osobę; widżet pokazuje 4 kolejne miejsca', () => {
    renderBoard(BOARD, 'widget', id(10));
    const podium = screen.getByRole('list', { name: 'Podium' });
    const steps = within(podium)
      .getAllByRole('listitem')
      .filter((li) => li.classList.contains('podium__step'));
    expect(steps).toHaveLength(3);
    expect(podium).toHaveTextContent('1. miejsce: Ada Bardzo-Długie-Nazwisko-Testowe');
    expect(document.querySelector('.podium__step--tied')).toBeNull();
    const list = screen.getByRole('list', { name: 'Kolejne miejsca' });
    const rows = within(list).getAllByRole('listitem');
    // Miejsca 4–7 (cztery wiersze) i własny wiersz Joli z 10. miejsca na końcu.
    expect(rows.map((row) => row.textContent?.slice(0, 2))).toEqual(['4D', '5E', '6F', '7G', '10']);
    expect(rows.at(-1)).toHaveTextContent('Ty');
    expect(screen.queryByText(/Zoja/)).not.toBeInTheDocument();
  });

  it('popup pokazuje pełną listę z wyszarzonym usuniętym na końcu', () => {
    renderBoard(BOARD, 'popup');
    const podium = screen.getByRole('list', { name: 'Podium' });
    expect(within(podium).getAllByRole('link')).toHaveLength(3);
    const rows = within(screen.getByRole('list', { name: 'Kolejne miejsca' })).getAllByRole(
      'listitem',
    );
    expect(rows).toHaveLength(8);
    const removed = rows.at(-1) as HTMLElement;
    expect(removed).toHaveTextContent('–ZBZoja Bardzo-Długie-Nazwisko-Testowe (usunięty)40pkt');
    expect(removed.querySelector('.row--muted')).not.toBeNull();
    // Bieżąca użytkowniczka na podium ma odznakę „Ty”, a nie wiersz akcentu.
    expect(within(podium).getByText('Ty')).toBeInTheDocument();
    expect(document.querySelector('.row--highlighted')).toBeNull();
  });

  it('każdy awatar prowadzi do profilu', () => {
    renderBoard(BOARD, 'popup');
    const link = screen.getByRole('link', {
      name: 'Otwórz profil: Ewa Bardzo-Długie-Nazwisko-Testowe',
    });
    expect(link.getAttribute('href')).toContain(`p=profile/${id(5)}`);
  });

  it('jeden gracz: tylko zajęty stopień, bez listy', () => {
    renderBoard([entry(1, 1, 'Ada', 3)], 'widget');
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByRole('list', { name: 'Kolejne miejsca' })).not.toBeInTheDocument();
  });

  it('jednostki zależą od klasyfikacji', () => {
    renderBoard([entry(1, 1, 'Ada', 5), entry(2, 2, 'Bea', 1)], 'popup', id(1), 'wins');
    expect(screen.getByText('wygranych')).toBeInTheDocument();
    expect(screen.getByText('wygrana')).toBeInTheDocument();
  });
});
