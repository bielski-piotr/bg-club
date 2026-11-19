/**
 * Wspólne przypadki osiągnięć: TypeScript (`computeAchievements`) i baza
 * (`private.computed_achievement_unlocks`, test pgTAP generowany przez `../sql.ts`) muszą dać
 * dokładnie te same odblokowania.
 *
 * Przypadek opisuje spotkania w kolejności chronologicznej (chyba że `day` mówi inaczej),
 * w nich partie w kolejności zapisu, a w partii wyniki `[gracz, miejsce, punkty?, wartość?]`.
 * Gracze, gry, spotkania i partie są numerowane od 1; identyfikatory i terminy wylicza
 * `achievementHistory`. `expected` wymienia odblokowania z `only` (domyślnie wszystkie
 * osiągnięcia), każde ze spotkaniem i partią (numer partii w spotkaniu), która je dopełniła.
 */
import {
  compareText,
  type AchievementHistory,
  type AchievementId,
  type AchievementUnlock,
} from '../achievements';

/** `[gracz, miejsce, punkty, wartość kategorii decydującej]`. */
export type CaseResult = readonly [
  player: number,
  place: number,
  points?: number,
  value?: number | null,
];

export interface CasePlay {
  /** Numer gry (domyślnie 1). */
  readonly game?: number;
  /** Kierunek kategorii decydującej wersji notesu (domyślnie `desc`). */
  readonly dir?: 'asc' | 'desc';
  readonly results: readonly CaseResult[];
  /**
   * Miejsca na kartce (od 1) kolejnych wyników; równe miejsca to zespół. Domyślnie każdy
   * gracz na własnym miejscu (1, 2, 3…).
   */
  readonly seats?: readonly number[];
}

export interface CaseMeeting {
  /** Dzień terminu od początku historii (domyślnie numer spotkania); równe dni → po `id`. */
  readonly day?: number;
  /** Domyślnie zakończone; `false` = spotkanie w trakcie. */
  readonly finished?: boolean;
  readonly plays?: readonly CasePlay[];
  /** Gracze z głosem w chwili zamknięcia głosowania. */
  readonly voters?: readonly number[];
}

export interface ExpectedUnlock {
  readonly player: number;
  readonly id: AchievementId;
  /** Numer spotkania (od 1). */
  readonly meeting: number;
  /** Numer partii w spotkaniu (od 1); brak dla `voter-10`. */
  readonly play?: number;
}

export interface AchievementCase {
  readonly name: string;
  readonly meetings: readonly CaseMeeting[];
  /** Porównywane osiągnięcia; domyślnie cały katalog. */
  readonly only?: readonly AchievementId[];
  readonly expected: readonly ExpectedUnlock[];
}

const pad = (n: number) => String(n).padStart(12, '0');
export const caseProfileId = (n: number) => `00000000-0000-4000-a000-${pad(100 + n)}`;
export const caseGameId = (n: number) => `00000000-0000-4000-b000-${pad(n)}`;
export const caseMeetingId = (n: number) => `00000000-0000-4000-c000-${pad(n)}`;
/** Partia `play` spotkania `meeting`: identyfikatory rosną w kolejności zapisu. */
export const casePlayId = (meeting: number, play: number) =>
  `00000000-0000-4000-f000-${pad(meeting * 1000 + play)}`;

const DAY = 86_400_000;
const START = Date.parse('2025-01-06T18:00:00.000Z');
export const caseStartsAt = (m: CaseMeeting, n: number) =>
  new Date(START + (m.day ?? n) * DAY).toISOString();
export const caseSavedAt = (m: CaseMeeting, n: number, play: number) =>
  new Date(Date.parse(caseStartsAt(m, n)) + play * 60_000).toISOString();

/** Punkty za miejsce, gdy przypadek ich nie podaje. */
export const defaultPoints = (place: number) => [10, 6, 4, 2, 1][place - 1] ?? 0;

export function achievementHistory(c: AchievementCase): AchievementHistory {
  return {
    meetings: c.meetings.map((m, i) => ({
      id: caseMeetingId(i + 1),
      startsAt: caseStartsAt(m, i + 1),
      finished: m.finished ?? true,
    })),
    plays: c.meetings.flatMap((m, i) =>
      (m.plays ?? []).map((p, j) => ({
        id: casePlayId(i + 1, j + 1),
        meetingId: caseMeetingId(i + 1),
        gameId: caseGameId(p.game ?? 1),
        savedAt: caseSavedAt(m, i + 1, j + 1),
        dir: p.dir ?? 'desc',
        results: p.results.map(([player, place, points, value], k) => ({
          profileId: caseProfileId(player),
          place,
          points: points ?? defaultPoints(place),
          rankingValue: value ?? null,
          ...(p.seats ? { seat: p.seats[k] ?? k + 1 } : {}),
        })),
      })),
    ),
    voters: c.meetings.flatMap((m, i) =>
      (m.voters ?? []).map((v) => ({
        meetingId: caseMeetingId(i + 1),
        profileId: caseProfileId(v),
      })),
    ),
  };
}

/** Oczekiwane odblokowania w kształcie wyniku `computeAchievements`. */
export function expectedUnlocks(c: AchievementCase): AchievementUnlock[] {
  return c.expected
    .map((e) => {
      const meeting = c.meetings[e.meeting - 1];
      if (!meeting) throw new Error(`Przypadek „${c.name}”: brak spotkania ${e.meeting}.`);
      return {
        profileId: caseProfileId(e.player),
        achievementId: e.id,
        meetingId: caseMeetingId(e.meeting),
        playId: e.play === undefined ? null : casePlayId(e.meeting, e.play),
        unlockedAt: caseStartsAt(meeting, e.meeting),
      };
    })
    .sort(
      (a, b) =>
        compareText(a.profileId, b.profileId) || compareText(a.achievementId, b.achievementId),
    );
}

// ---------------------------------------------------------------------------------------------
// Przypadki
// ---------------------------------------------------------------------------------------------

/** Partia dwóch graczy: `winner` na 1. miejscu, `loser` na 2. */
const duel = (winner: number, loser: number, game = 1): CasePlay => ({
  game,
  results: [
    [winner, 1],
    [loser, 2],
  ],
});
const times = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));

export const achievementCases: readonly AchievementCase[] = [
  {
    name: 'pierwsza partia: meet-1, win-1, szczęście debiutanta; przegrany tylko meet-1',
    meetings: [{ plays: [duel(1, 2)] }],
    expected: [
      { player: 1, id: 'meet-1', meeting: 1, play: 1 },
      { player: 1, id: 'win-1', meeting: 1, play: 1 },
      { player: 1, id: 'beginners-luck', meeting: 1, play: 1 },
      { player: 2, id: 'meet-1', meeting: 1, play: 1 },
    ],
  },
  {
    name: 'szczęście debiutanta: tylko pierwsza partia danej gry, także wspólne 1. miejsce',
    only: ['beginners-luck'],
    meetings: [
      { plays: [duel(2, 1, 1), duel(1, 2, 1)] },
      {
        plays: [
          {
            game: 2,
            results: [
              [1, 1],
              [2, 1],
              [3, 3],
            ],
          },
        ],
      },
    ],
    expected: [
      { player: 2, id: 'beginners-luck', meeting: 1, play: 1 },
      // Gracz 2 ma już osiągnięcie: każde odblokowuje się raz, z pierwszym spotkaniem.
      { player: 1, id: 'beginners-luck', meeting: 2, play: 1 },
    ],
  },
  {
    name: 'remis o 1. miejsce: ex aequo i wygrana dla obu, ostatnie miejsce wspólne',
    only: ['tie-top', 'win-1', 'lantern-10'],
    meetings: [
      {
        plays: [
          {
            results: [
              [1, 1, 8],
              [2, 1, 8],
              [3, 3],
            ],
          },
          {
            results: [
              [1, 1],
              [2, 2],
            ],
          },
        ],
      },
    ],
    expected: [
      { player: 1, id: 'tie-top', meeting: 1, play: 1 },
      { player: 1, id: 'win-1', meeting: 1, play: 1 },
      { player: 2, id: 'tie-top', meeting: 1, play: 1 },
      { player: 2, id: 'win-1', meeting: 1, play: 1 },
    ],
  },
  {
    name: 'zespół: wygrana zespołu to wygrana każdego członka, ale nie ex aequo',
    only: ['tie-top', 'win-1'],
    meetings: [
      {
        plays: [
          {
            results: [
              [1, 1, 8],
              [2, 1, 8],
              [3, 2, 4],
              [4, 2, 4],
            ],
            seats: [1, 1, 2, 2],
          },
        ],
      },
    ],
    expected: [
      { player: 1, id: 'win-1', meeting: 1, play: 1 },
      { player: 2, id: 'win-1', meeting: 1, play: 1 },
    ],
  },
  {
    name: 'czerwona latarnia: wspólne ostatnie miejsce się liczy, wspólne 1. miejsce wszystkich nie',
    only: ['lantern-10', 'tie-top'],
    meetings: [
      {
        plays: [
          ...times(10, () => ({
            results: [
              [1, 1],
              [2, 1],
            ] as const,
          })),
          ...times(9, () => ({
            results: [
              [3, 1],
              [1, 2],
              [2, 2],
            ] as const,
          })),
        ],
      },
      {
        plays: [
          {
            results: [
              [3, 1],
              [1, 2],
              [2, 2],
            ],
          },
        ],
      },
    ],
    expected: [
      { player: 1, id: 'tie-top', meeting: 1, play: 1 },
      { player: 1, id: 'lantern-10', meeting: 2, play: 1 },
      { player: 2, id: 'tie-top', meeting: 1, play: 1 },
      { player: 2, id: 'lantern-10', meeting: 2, play: 1 },
    ],
  },
  {
    name: 'progi liczników: spotkania, partie, wygrane, punkty, serie, specjalista, latarnia',
    only: [
      'meet-1',
      'meet-10',
      'meet-25',
      'meet-50',
      'play-10',
      'play-50',
      'play-100',
      'win-1',
      'win-10',
      'win-50',
      'pts-100',
      'pts-500',
      'streak-3',
      'streak-5',
      'streak-10',
      'specialist',
      'lantern-10',
      'marathon',
      'hattrick',
    ],
    // 50 spotkań po 2 partie: gracz 1 wygrywa wszystkie (10 pkt), gracz 2 zawsze ostatni.
    meetings: times(50, () => ({ plays: [duel(1, 2), duel(1, 2)] })),
    expected: [
      { player: 1, id: 'meet-1', meeting: 1, play: 1 },
      { player: 1, id: 'meet-10', meeting: 10, play: 1 },
      { player: 1, id: 'meet-25', meeting: 25, play: 1 },
      { player: 1, id: 'meet-50', meeting: 50, play: 1 },
      { player: 1, id: 'play-10', meeting: 5, play: 2 },
      { player: 1, id: 'play-50', meeting: 25, play: 2 },
      { player: 1, id: 'play-100', meeting: 50, play: 2 },
      { player: 1, id: 'win-1', meeting: 1, play: 1 },
      { player: 1, id: 'win-10', meeting: 5, play: 2 },
      { player: 1, id: 'win-50', meeting: 25, play: 2 },
      { player: 1, id: 'pts-100', meeting: 5, play: 2 },
      { player: 1, id: 'pts-500', meeting: 25, play: 2 },
      { player: 1, id: 'streak-3', meeting: 3, play: 1 },
      { player: 1, id: 'streak-5', meeting: 5, play: 1 },
      { player: 1, id: 'streak-10', meeting: 10, play: 1 },
      { player: 1, id: 'specialist', meeting: 5, play: 2 },
      { player: 2, id: 'meet-1', meeting: 1, play: 1 },
      { player: 2, id: 'meet-10', meeting: 10, play: 1 },
      { player: 2, id: 'meet-25', meeting: 25, play: 1 },
      { player: 2, id: 'meet-50', meeting: 50, play: 1 },
      { player: 2, id: 'play-10', meeting: 5, play: 2 },
      { player: 2, id: 'play-50', meeting: 25, play: 2 },
      { player: 2, id: 'play-100', meeting: 50, play: 2 },
      { player: 2, id: 'pts-100', meeting: 9, play: 1 },
      { player: 2, id: 'pts-500', meeting: 42, play: 2 },
      { player: 2, id: 'lantern-10', meeting: 5, play: 2 },
    ],
  },
  {
    name: 'punkty: próg „co najmniej” przekroczony w jednej partii',
    only: ['pts-100'],
    meetings: [
      {
        plays: [
          {
            results: [
              [1, 1, 60],
              [2, 2, 0],
            ],
          },
        ],
      },
      {
        plays: [
          {
            results: [
              [1, 1, 45],
              [2, 2, 0],
            ],
          },
        ],
      },
    ],
    expected: [{ player: 1, id: 'pts-100', meeting: 2, play: 1 }],
  },
  {
    name: 'maratończyk, hat-trick i bez skazy w jednym spotkaniu',
    only: ['marathon', 'hattrick', 'flawless'],
    meetings: [
      { plays: [duel(1, 2), duel(1, 2), duel(2, 1), duel(1, 2), duel(1, 2)] },
      { plays: [duel(3, 1), duel(3, 1), duel(3, 1)] },
    ],
    expected: [
      { player: 1, id: 'marathon', meeting: 1, play: 5 },
      { player: 1, id: 'hattrick', meeting: 1, play: 4 },
      { player: 2, id: 'marathon', meeting: 1, play: 5 },
      { player: 3, id: 'hattrick', meeting: 2, play: 3 },
      { player: 3, id: 'flawless', meeting: 2, play: 3 },
    ],
  },
  {
    name: 'bez skazy: co najmniej 3 partie i dopiero po zakończeniu spotkania',
    only: ['flawless'],
    meetings: [
      { plays: [duel(1, 2), duel(1, 2)] },
      { finished: false, plays: [duel(2, 1), duel(2, 1), duel(2, 1)] },
    ],
    expected: [],
  },
  {
    name: 'serie: nieobecność nie przerywa, porażka zeruje, +1 najwyżej raz na spotkanie',
    only: ['streak-3', 'streak-5', 'comeback'],
    meetings: [
      { plays: [duel(1, 2), duel(1, 2), duel(1, 2)] },
      { plays: [duel(1, 2)] },
      { plays: [duel(3, 2)] },
      { plays: [duel(2, 1), duel(1, 2)] },
      { plays: [duel(2, 1)] },
      { plays: [duel(1, 2)] },
      { plays: [duel(1, 2)] },
    ],
    expected: [
      { player: 1, id: 'streak-3', meeting: 4, play: 2 },
      // Porażka na spotkaniu 5 przerwała serię 3, wygrana na 6 to powrót.
      { player: 1, id: 'comeback', meeting: 6, play: 1 },
    ],
  },
  {
    name: 'powrót z popiołów: wygrana na pierwszym spotkaniu gracza po przerwaniu serii ≥ 3',
    only: ['comeback'],
    meetings: [
      { plays: [duel(1, 2)] },
      { plays: [duel(1, 2)] },
      { plays: [duel(1, 2)] },
      { plays: [duel(2, 1)] },
      { plays: [duel(2, 3)] },
      { plays: [duel(2, 1), duel(1, 2)] },
      // Gracz 3: seria 2 przerwana nie daje powrotu.
      { plays: [duel(3, 2)] },
      { plays: [duel(3, 2)] },
      { plays: [duel(2, 3)] },
      { plays: [duel(3, 2)] },
    ],
    expected: [{ player: 1, id: 'comeback', meeting: 6, play: 2 }],
  },
  {
    name: 'powrót z popiołów: przegrane spotkanie po przerwaniu serii zamyka szansę',
    only: ['comeback'],
    meetings: [
      { plays: [duel(1, 2)] },
      { plays: [duel(1, 2)] },
      { plays: [duel(1, 2)] },
      { plays: [duel(2, 1)] },
      { plays: [duel(2, 1)] },
      { plays: [duel(1, 2)] },
    ],
    expected: [],
  },
  {
    name: 'różnorodność: odkrywca, wszechstronny',
    only: ['explorer-10', 'versatile-5', 'beginners-luck'],
    meetings: [
      { plays: times(5, (i) => duel(1, 2, i + 1)) },
      { plays: times(5, (i) => duel(2, 1, i + 6)) },
    ],
    expected: [
      { player: 1, id: 'beginners-luck', meeting: 1, play: 1 },
      { player: 1, id: 'versatile-5', meeting: 1, play: 5 },
      { player: 1, id: 'explorer-10', meeting: 2, play: 5 },
      { player: 2, id: 'beginners-luck', meeting: 2, play: 1 },
      { player: 2, id: 'versatile-5', meeting: 2, play: 5 },
      { player: 2, id: 'explorer-10', meeting: 2, play: 5 },
    ],
  },
  {
    name: 'ludoznawca: 25 różnych gier, powtórki się nie liczą',
    only: ['explorer-25'],
    meetings: [
      { plays: times(20, (i) => duel(1, 2, i + 1)) },
      { plays: [duel(1, 2, 1), ...times(5, (i) => duel(2, 1, i + 21))] },
    ],
    expected: [
      { player: 1, id: 'explorer-25', meeting: 2, play: 6 },
      { player: 2, id: 'explorer-25', meeting: 2, play: 6 },
    ],
  },
  {
    name: 'wielki stół: co najmniej 6 graczy',
    only: ['big-table'],
    meetings: [
      { plays: [{ results: times(5, (i) => [i + 1, i + 1] as const) }] },
      { plays: [{ results: times(6, (i) => [i + 2, i + 1] as const) }] },
    ],
    expected: times(6, (i) => ({ player: i + 2, id: 'big-table' as const, meeting: 2, play: 1 })),
  },
  {
    name: 'rekord: lepszy od wszystkich wcześniejszych partii, nie pierwsza partia, nie wyrównanie',
    only: ['record'],
    meetings: [
      {
        plays: [
          {
            results: [
              [1, 1, 10, 50],
              [2, 2, 6, 40],
            ],
          },
          {
            results: [
              [2, 1, 10, 50],
              [1, 2, 6, 30],
            ],
          },
          // Dwóch graczy z nowym rekordem w jednej partii; trzeci ma wynik lepszy od starego
          // rekordu, ale nie najlepszy w partii.
          {
            results: [
              [1, 1, 8, 70],
              [3, 1, 8, 70],
              [2, 3, 4, 60],
            ],
          },
        ],
      },
      // Wartość pusta nie bije rekordu; inna gra ma osobne rekordy.
      {
        plays: [
          {
            results: [
              [2, 1, 10, 80],
              [3, 2, 6, null],
            ],
          },
          {
            game: 2,
            results: [
              [3, 1, 10, 5],
              [1, 2, 6, 1],
            ],
          },
        ],
      },
    ],
    expected: [
      { player: 1, id: 'record', meeting: 1, play: 3 },
      { player: 2, id: 'record', meeting: 2, play: 1 },
      { player: 3, id: 'record', meeting: 1, play: 3 },
    ],
  },
  {
    name: 'rekord: „mniej = lepiej” i osobny rekord dla innego kierunku notesu',
    only: ['record'],
    meetings: [
      {
        plays: [
          {
            dir: 'asc',
            results: [
              [1, 1, 10, 30],
              [2, 2, 6, 35],
            ],
          },
          {
            dir: 'asc',
            results: [
              [2, 1, 10, 28],
              [1, 2, 6, 31],
            ],
          },
          {
            dir: 'desc',
            results: [
              [1, 1, 10, 10],
              [2, 2, 6, 5],
            ],
          },
          {
            dir: 'desc',
            results: [
              [1, 1, 10, 12],
              [2, 2, 6, 1],
            ],
          },
        ],
      },
    ],
    expected: [
      { player: 1, id: 'record', meeting: 1, play: 4 },
      { player: 2, id: 'record', meeting: 1, play: 2 },
    ],
  },
  {
    name: 'kolejność zdarzeń: termin spotkania, potem id; partie po zapisie',
    only: ['win-1', 'beginners-luck', 'streak-3', 'record'],
    meetings: [
      // Spotkanie 1 odbywa się po spotkaniach 2 i 3 (dzień 10).
      {
        day: 10,
        plays: [
          {
            results: [
              [1, 1, 10, 9],
              [2, 2, 6, 1],
            ],
          },
        ],
      },
      {
        day: 2,
        plays: [
          {
            results: [
              [2, 1, 10, 5],
              [1, 2, 6, 4],
            ],
          },
        ],
      },
      // Ten sam dzień co spotkanie 4: o kolejności decyduje id (3 przed 4).
      {
        day: 3,
        plays: [
          {
            results: [
              [2, 1, 10, 6],
              [1, 2, 6, 1],
            ],
          },
        ],
      },
      {
        day: 3,
        plays: [
          {
            results: [
              [2, 1, 10, 6],
              [1, 2, 6, 1],
            ],
          },
        ],
      },
    ],
    expected: [
      { player: 1, id: 'record', meeting: 1, play: 1 },
      { player: 1, id: 'win-1', meeting: 1, play: 1 },
      { player: 2, id: 'beginners-luck', meeting: 2, play: 1 },
      { player: 2, id: 'record', meeting: 3, play: 1 },
      { player: 2, id: 'streak-3', meeting: 4, play: 1 },
      { player: 2, id: 'win-1', meeting: 2, play: 1 },
    ],
  },
  {
    name: 'głos ludu: 10 różnych głosowań, data dziesiątego spotkania; bez partii też',
    only: ['voter-10'],
    meetings: [
      ...times(9, () => ({ voters: [1, 2] })),
      { day: 30, voters: [2] },
      { day: 20, voters: [1] },
    ],
    expected: [
      { player: 1, id: 'voter-10', meeting: 11 },
      { player: 2, id: 'voter-10', meeting: 10 },
    ],
  },
  {
    name: 'głos ludu: 9 głosowań to za mało',
    only: ['voter-10'],
    meetings: times(9, () => ({ voters: [1] })),
    expected: [],
  },
];
