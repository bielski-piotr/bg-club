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
  kind: 'points' | 'wins' | 'streak' = 'points',
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

const TIED = [
  entry(1, 1, 'Ada', 12),
  entry(2, 1, 'Bea', 12),
  entry(3, 1, 'Cela', 12),
  entry(4, 1, 'Dora', 12),
  entry(5, 5, 'Ewa', 8),
  entry(6, 6, 'Fela', 7),
  entry(7, 7, 'Gaja', 6),
  entry(8, 8, 'Hela', 5),
  entry(9, 9, 'Iga', 4),
  entry(10, 10, 'Jola', 3),
  entry(99, 11, 'Zoja', 40, true),
];

describe('ranking: podium i lista (LB-2, LB-3, LB-6, LB-7)', () => {
  it('remisujący stoją razem; widżet skraca stopień i pokazuje 4 kolejne miejsca', () => {
    renderBoard(TIED, 'widget', id(10));
    const podium = screen.getByRole('list', { name: 'Podium' });
    expect(podium).toHaveTextContent(
      '1. miejsce, 4 osoby: Ada Bardzo-Długie-Nazwisko-Testowe, Bea',
    );
    expect(within(podium).getByText('+1')).toBeInTheDocument();
    expect(within(podium).getByText('Ada, Bea, Cela i 1 więcej')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Kolejne miejsca' });
    const rows = within(list).getAllByRole('listitem');
    // Miejsca 5–8 (cztery wiersze) i własny wiersz Joli z 10. miejsca na końcu.
    expect(rows.map((row) => row.textContent?.slice(0, 2))).toEqual(['5E', '6F', '7G', '8H', '10']);
    expect(rows.at(-1)).toHaveTextContent('Ty');
    expect(screen.queryByText(/Zoja/)).not.toBeInTheDocument();
  });

  it('popup pokazuje pełną listę z wyszarzonym usuniętym na końcu', () => {
    renderBoard(TIED, 'popup');
    const podium = screen.getByRole('list', { name: 'Podium' });
    expect(within(podium).queryByText('+1')).not.toBeInTheDocument();
    expect(within(podium).getAllByRole('link')).toHaveLength(4);
    const rows = within(screen.getByRole('list', { name: 'Kolejne miejsca' })).getAllByRole(
      'listitem',
    );
    expect(rows).toHaveLength(7);
    const removed = rows.at(-1) as HTMLElement;
    expect(removed).toHaveTextContent('–ZBZoja Bardzo-Długie-Nazwisko-Testowe (usunięty)40pkt');
    expect(removed.querySelector('.row--muted')).not.toBeNull();
    // Bieżąca użytkowniczka na podium ma odznakę „Ty”, a nie wiersz akcentu.
    expect(within(podium).getByText('Ty')).toBeInTheDocument();
    expect(document.querySelector('.row--highlighted')).toBeNull();
  });

  it('każdy awatar prowadzi do profilu', () => {
    renderBoard(TIED, 'popup');
    const link = screen.getByRole('link', {
      name: 'Otwórz profil: Ewa Bardzo-Długie-Nazwisko-Testowe',
    });
    expect(link.getAttribute('href')).toContain(`p=profile/${id(5)}`);
  });

  it('jeden i dwóch graczy: tylko zajęte stopnie, bez listy', () => {
    renderBoard([entry(1, 1, 'Ada', 3)], 'widget');
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByRole('list', { name: 'Kolejne miejsca' })).not.toBeInTheDocument();
  });

  it('przy remisie 1, 1, 3 trzeci stoi na 3. stopniu, a 2. stopień jest pusty', () => {
    renderBoard([entry(1, 1, 'Ada', 5), entry(2, 1, 'Bea', 5), entry(3, 3, 'Cela', 2)], 'popup');
    const classes = [...document.querySelectorAll('.podium__step')].map((step) => step.className);
    expect(classes).toEqual([
      expect.stringContaining('podium__step--1 podium__step--tied'),
      expect.stringContaining('podium__step--3'),
    ]);
  });

  it('jednostki zależą od klasyfikacji', () => {
    renderBoard([entry(1, 1, 'Ada', 5), entry(2, 2, 'Bea', 1)], 'popup', id(1), 'wins');
    expect(screen.getByText('wygranych')).toBeInTheDocument();
    expect(screen.getByText('wygrana')).toBeInTheDocument();
  });
});
