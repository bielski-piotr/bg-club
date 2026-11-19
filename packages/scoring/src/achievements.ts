/**
 * Katalog osiągnięć i ich warunki liczone z historii.
 *
 * Katalog jest zdefiniowany w kodzie: zmiana listy wymaga zmiany kodu. Baza liczy te
 * same warunki w `private.computed_achievement_unlocks()` (migracja `…_achievements.sql`), a obie
 * implementacje przechodzą ten sam zestaw przypadków (`cases/achievements.ts`, test pgTAP
 * generowany przez `sql.ts`).
 *
 * Historia jest odtwarzana chronologicznie w kolejności ustalonej: spotkania po
 * `starts_at`, potem `id`; partie w spotkaniu po `saved_at`, potem `id`. Data odblokowania to
 * termin spotkania, na którym warunek spełniono po raz pierwszy, a `playId` wskazuje partię,
 * która go dopełniła (`null` dla `voter-10`, które wynika z głosowania, nie z partii).
 */

export type AchievementGroup =
  'meetings' | 'plays' | 'wins' | 'streaks' | 'variety' | 'special' | 'points' | 'club';

export interface AchievementDefinition {
  readonly id: string;
  readonly group: AchievementGroup;
  /** Nazwa w gablocie. */
  readonly name: string;
  /** Warunek w języku gracza. */
  readonly description: string;
  /** Nazwa ikony z zestawu aplikacji (gablota, toast). */
  readonly icon: string;
  /** Próg licznika dla postępu „7/10”; brak dla warunków jednorazowych. */
  readonly goal?: number;
}

/** Nazwy grup w kolejności gabloty. */
export const ACHIEVEMENT_GROUPS: Readonly<Record<AchievementGroup, string>> = {
  meetings: 'Spotkania',
  plays: 'Partie',
  wins: 'Wygrane',
  streaks: 'Serie',
  variety: 'Różnorodność',
  special: 'Wyjątkowe',
  points: 'Punkty',
  club: 'Klub',
};

/** Katalog MVP: 29 pozycji w kolejności katalogu. */
export const ACHIEVEMENTS = [
  {
    id: 'meet-1',
    group: 'meetings',
    name: 'Pierwsze kroki',
    description: 'Udział w pierwszym spotkaniu z co najmniej jedną partią',
    icon: 'footsteps',
    goal: 1,
  },
  {
    id: 'meet-10',
    group: 'meetings',
    name: 'Stały bywalec',
    description: '10 spotkań z co najmniej jedną partią',
    icon: 'calendar',
    goal: 10,
  },
  {
    id: 'meet-25',
    group: 'meetings',
    name: 'Weteran',
    description: '25 spotkań z co najmniej jedną partią',
    icon: 'medal',
    goal: 25,
  },
  {
    id: 'meet-50',
    group: 'meetings',
    name: 'Filar klubu',
    description: '50 spotkań z co najmniej jedną partią',
    icon: 'columns',
    goal: 50,
  },
  {
    id: 'play-10',
    group: 'plays',
    name: 'Rozgrzewka',
    description: '10 rozegranych partii',
    icon: 'dice',
    goal: 10,
  },
  {
    id: 'play-50',
    group: 'plays',
    name: 'Zapalony gracz',
    description: '50 rozegranych partii',
    icon: 'flame',
    goal: 50,
  },
  {
    id: 'play-100',
    group: 'plays',
    name: 'Setka',
    description: '100 rozegranych partii',
    icon: 'hundred',
    goal: 100,
  },
  {
    id: 'marathon',
    group: 'plays',
    name: 'Maratończyk',
    description: 'Co najmniej 5 partii na jednym spotkaniu',
    icon: 'timer',
  },
  {
    id: 'win-1',
    group: 'wins',
    name: 'Pierwsza wygrana',
    description: 'Pierwsza wygrana partia',
    icon: 'trophy',
    goal: 1,
  },
  {
    id: 'win-10',
    group: 'wins',
    name: 'Zwycięzca',
    description: '10 wygranych partii',
    icon: 'trophy',
    goal: 10,
  },
  {
    id: 'win-50',
    group: 'wins',
    name: 'Mistrz',
    description: '50 wygranych partii',
    icon: 'crown',
    goal: 50,
  },
  {
    id: 'hattrick',
    group: 'wins',
    name: 'Hat-trick',
    description: 'Co najmniej 3 wygrane na jednym spotkaniu',
    icon: 'hat',
  },
  {
    id: 'flawless',
    group: 'wins',
    name: 'Bez skazy',
    description: 'Wygrane wszystkie partie spotkania (co najmniej 3 partie)',
    icon: 'diamond',
  },
  {
    id: 'streak-3',
    group: 'streaks',
    name: 'W gazie',
    description: 'Seria zwycięstw 3',
    icon: 'bolt',
    goal: 3,
  },
  {
    id: 'streak-5',
    group: 'streaks',
    name: 'Nie do zatrzymania',
    description: 'Seria zwycięstw 5',
    icon: 'rocket',
    goal: 5,
  },
  {
    id: 'streak-10',
    group: 'streaks',
    name: 'Legenda',
    description: 'Seria zwycięstw 10',
    icon: 'star',
    goal: 10,
  },
  {
    id: 'explorer-10',
    group: 'variety',
    name: 'Odkrywca',
    description: 'Zagrane 10 różnych gier',
    icon: 'compass',
    goal: 10,
  },
  {
    id: 'explorer-25',
    group: 'variety',
    name: 'Ludoznawca',
    description: 'Zagrane 25 różnych gier',
    icon: 'map',
    goal: 25,
  },
  {
    id: 'versatile-5',
    group: 'variety',
    name: 'Wszechstronny',
    description: 'Wygrane w 5 różnych grach',
    icon: 'shapes',
    goal: 5,
  },
  {
    id: 'specialist',
    group: 'variety',
    name: 'Specjalista',
    description: '10 wygranych w jednej grze',
    icon: 'target',
    goal: 10,
  },
  {
    id: 'beginners-luck',
    group: 'variety',
    name: 'Szczęście debiutanta',
    description: 'Wygrana w swojej pierwszej partii danej gry',
    icon: 'clover',
  },
  {
    id: 'record',
    group: 'special',
    name: 'Rekordzista',
    description: 'Ustanowienie rekordu gry',
    icon: 'chart',
  },
  {
    id: 'big-table',
    group: 'special',
    name: 'Wielki stół',
    description: 'Partia z co najmniej 6 graczami',
    icon: 'table',
  },
  {
    id: 'tie-top',
    group: 'special',
    name: 'Ex aequo',
    description: 'Wspólne 1. miejsce',
    icon: 'handshake',
  },
  {
    id: 'comeback',
    group: 'special',
    name: 'Powrót z popiołów',
    description: 'Wygrana na pierwszym spotkaniu po przerwaniu serii co najmniej 3',
    icon: 'phoenix',
  },
  {
    id: 'lantern-10',
    group: 'special',
    name: 'Czerwona latarnia',
    description: '10 razy ostatnie miejsce',
    icon: 'lantern',
    goal: 10,
  },
  {
    id: 'pts-100',
    group: 'points',
    name: 'Setka punktów',
    description: '100 punktów leaderboardu',
    icon: 'coins',
    goal: 100,
  },
  {
    id: 'pts-500',
    group: 'points',
    name: 'Pół tysiąca',
    description: '500 punktów leaderboardu',
    icon: 'gem',
    goal: 500,
  },
  {
    id: 'voter-10',
    group: 'club',
    name: 'Głos ludu',
    description: 'Głos oddany w 10 głosowaniach',
    icon: 'ballot',
    goal: 10,
  },
] as const satisfies readonly AchievementDefinition[];

export type AchievementId = (typeof ACHIEVEMENTS)[number]['id'];

export const ACHIEVEMENT_IDS: readonly AchievementId[] = ACHIEVEMENTS.map((a) => a.id);

const byId = new Map<string, AchievementDefinition>(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Definicja z katalogu albo `undefined` dla identyfikatora spoza katalogu. */
export const achievementById = (id: string): AchievementDefinition | undefined => byId.get(id);

// ---------------------------------------------------------------------------------------------
// Historia i przeliczenie
// ---------------------------------------------------------------------------------------------

export interface HistoryMeeting {
  readonly id: string;
  /** Termin spotkania (ISO 8601); data odblokowania. */
  readonly startsAt: string;
  /** Spotkanie zakończone: dopiero wtedy liczy się `flawless`. */
  readonly finished: boolean;
}

export interface HistoryResult {
  readonly profileId: string;
  /** Miejsce z remisami (1, 1, 3); wygrana to miejsce 1. */
  readonly place: number;
  /** Punkty leaderboardu. */
  readonly points: number;
  /** Wartość kategorii decydującej; `null`, gdy gracz jej nie ma. */
  readonly rankingValue: number | null;
  /**
   * Miejsce na kartce (od 1). Członkowie zespołu mają to samo miejsce i liczą się jako jedna
   * strona (wygrana zespołu to nie „wspólne 1. miejsce”). Brak = każdy gracz osobno.
   */
  readonly seat?: number | undefined;
}

/** Zapisana partia (szkice nie są historią). */
export interface HistoryPlay {
  readonly id: string;
  readonly meetingId: string;
  readonly gameId: string;
  /** Zatwierdzenie karteczki (ISO 8601), kolejność partii w spotkaniu. */
  readonly savedAt: string;
  /** Kierunek kategorii decydującej wersji notesu partii („mniej = lepiej” to `asc`). */
  readonly dir: 'asc' | 'desc';
  readonly results: readonly HistoryResult[];
}

/** Gracz z ≥ 1 głosem w chwili zamknięcia głosowania spotkania. */
export interface HistoryVoter {
  readonly meetingId: string;
  readonly profileId: string;
}

export interface AchievementHistory {
  readonly meetings: readonly HistoryMeeting[];
  readonly plays: readonly HistoryPlay[];
  readonly voters: readonly HistoryVoter[];
}

export interface AchievementUnlock {
  readonly profileId: string;
  readonly achievementId: AchievementId;
  readonly meetingId: string;
  readonly playId: string | null;
  /** Termin spotkania, na którym warunek spełniono po raz pierwszy. */
  readonly unlockedAt: string;
}

/** Porównanie tekstu po punktach kodowych (jak `uuid` i identyfikatory w bazie). */
export const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Mikrosekundy ponad milisekundę z ułamka sekund ISO 8601 (Postgres zapisuje do 1 µs). */
const micros = (iso: string): number =>
  Number((/\.\d{3}(\d{1,3})/.exec(iso)?.[1] ?? '').padEnd(3, '0'));
const compareTime = (a: string, b: string): number =>
  Date.parse(a) - Date.parse(b) || micros(a) - micros(b);

/** Kolejność spotkań ustalonej: termin, potem identyfikator. */
export const compareMeetings = (a: HistoryMeeting, b: HistoryMeeting): number =>
  compareTime(a.startsAt, b.startsAt) || compareText(a.id, b.id);

/** Kolejność partii w spotkaniu ustalonej: zatwierdzenie karteczki, potem identyfikator. */
export const comparePlays = (a: HistoryPlay, b: HistoryPlay): number =>
  compareTime(a.savedAt, b.savedAt) || compareText(a.id, b.id);

interface PlayerState {
  plays: number;
  wins: number;
  points: number;
  lastPlaces: number;
  meetings: number;
  games: Set<string>;
  wonGames: Set<string>;
  gameWins: Map<string, number>;
  streak: number;
  /** Poprzednie spotkanie gracza (z partią) przerwało serię ≥ 3. */
  afterBreak: boolean;
}

interface MeetingTally {
  plays: number;
  wins: number;
  firstWin: string | null;
  lastPlay: string;
}

const COUNTERS = {
  meetings: [
    ['meet-1', 1],
    ['meet-10', 10],
    ['meet-25', 25],
    ['meet-50', 50],
  ],
  plays: [
    ['play-10', 10],
    ['play-50', 50],
    ['play-100', 100],
  ],
  wins: [
    ['win-1', 1],
    ['win-10', 10],
    ['win-50', 50],
  ],
  streak: [
    ['streak-3', 3],
    ['streak-5', 5],
    ['streak-10', 10],
  ],
  games: [
    ['explorer-10', 10],
    ['explorer-25', 25],
  ],
  points: [
    ['pts-100', 100],
    ['pts-500', 500],
  ],
} as const satisfies Record<string, readonly (readonly [AchievementId, number])[]>;

const better = (dir: 'asc' | 'desc', a: number, b: number): boolean =>
  dir === 'asc' ? a < b : a > b;

/**
 * Odblokowania wynikające z całej historii, posortowane po graczu i identyfikatorze osiągnięcia.
 * Każde osiągnięcie gracz ma najwyżej raz, z pierwszym spotkaniem, na którym warunek spełnił.
 * Wynik zależy tylko od historii, więc ponowne przeliczenie daje to samo, a usunięcie partii
 * cofa osiągnięcia, które przestały być spełnione.
 */
export function computeAchievements(history: AchievementHistory): AchievementUnlock[] {
  const meetings = [...history.meetings].sort(compareMeetings);
  const meetingById = new Map(meetings.map((m) => [m.id, m]));
  const playsByMeeting = new Map<string, HistoryPlay[]>();
  for (const play of history.plays) {
    if (!meetingById.has(play.meetingId))
      throw new Error(`Partia ${play.id} wskazuje nieznane spotkanie ${play.meetingId}.`);
    const list = playsByMeeting.get(play.meetingId) ?? [];
    list.push(play);
    playsByMeeting.set(play.meetingId, list);
  }

  const unlocks = new Map<string, AchievementUnlock>();
  const unlock = (
    profileId: string,
    achievementId: AchievementId,
    meeting: HistoryMeeting,
    playId: string | null,
  ) => {
    const key = `${profileId}\u0000${achievementId}`;
    if (unlocks.has(key)) return;
    unlocks.set(key, {
      profileId,
      achievementId,
      meetingId: meeting.id,
      playId,
      unlockedAt: meeting.startsAt,
    });
  };
  const counters = (
    profileId: string,
    list: readonly (readonly [AchievementId, number])[],
    value: number,
    meeting: HistoryMeeting,
    playId: string | null,
  ) => {
    for (const [id, goal] of list) if (value >= goal) unlock(profileId, id, meeting, playId);
  };

  const players = new Map<string, PlayerState>();
  const player = (id: string): PlayerState => {
    let state = players.get(id);
    if (!state) {
      state = {
        plays: 0,
        wins: 0,
        points: 0,
        lastPlaces: 0,
        meetings: 0,
        games: new Set(),
        wonGames: new Set(),
        gameWins: new Map(),
        streak: 0,
        afterBreak: false,
      };
      players.set(id, state);
    }
    return state;
  };
  /** Najlepsza dotychczasowa wartość gry w danym kierunku (rekord). */
  const records = new Map<string, number>();

  for (const meeting of meetings) {
    const plays = [...(playsByMeeting.get(meeting.id) ?? [])].sort(comparePlays);
    const tallies = new Map<string, MeetingTally>();

    for (const play of plays) {
      const lastPlace = Math.max(...play.results.map((r) => r.place));
      // Strony (gracze albo zespoły) na 1. miejscu.
      const winners = new Set(
        play.results.filter((r) => r.place === 1).map((r) => r.seat ?? r.profileId),
      ).size;

      for (const r of play.results) {
        const state = player(r.profileId);
        const win = r.place === 1;
        let tally = tallies.get(r.profileId);
        if (!tally) {
          tally = { plays: 0, wins: 0, firstWin: null, lastPlay: play.id };
          tallies.set(r.profileId, tally);
          state.meetings += 1;
          counters(r.profileId, COUNTERS.meetings, state.meetings, meeting, play.id);
        }
        tally.plays += 1;
        tally.lastPlay = play.id;

        state.plays += 1;
        state.points += r.points;
        counters(r.profileId, COUNTERS.plays, state.plays, meeting, play.id);
        counters(r.profileId, COUNTERS.points, state.points, meeting, play.id);
        if (tally.plays >= 5) unlock(r.profileId, 'marathon', meeting, play.id);

        const firstOfGame = !state.games.has(play.gameId);
        state.games.add(play.gameId);
        counters(r.profileId, COUNTERS.games, state.games.size, meeting, play.id);

        if (win) {
          state.wins += 1;
          tally.wins += 1;
          tally.firstWin ??= play.id;
          state.wonGames.add(play.gameId);
          const gameWins = (state.gameWins.get(play.gameId) ?? 0) + 1;
          state.gameWins.set(play.gameId, gameWins);
          counters(r.profileId, COUNTERS.wins, state.wins, meeting, play.id);
          if (tally.wins >= 3) unlock(r.profileId, 'hattrick', meeting, play.id);
          if (state.wonGames.size >= 5) unlock(r.profileId, 'versatile-5', meeting, play.id);
          if (gameWins >= 10) unlock(r.profileId, 'specialist', meeting, play.id);
          if (firstOfGame) unlock(r.profileId, 'beginners-luck', meeting, play.id);
          if (winners >= 2) unlock(r.profileId, 'tie-top', meeting, play.id);
        }
        // Ostatnie miejsce, także wspólne, ale nie wtedy, gdy wszyscy dzielą 1. miejsce.
        if (r.place === lastPlace && lastPlace > 1) {
          state.lastPlaces += 1;
          if (state.lastPlaces >= 10) unlock(r.profileId, 'lantern-10', meeting, play.id);
        }
        if (play.results.length >= 6) unlock(r.profileId, 'big-table', meeting, play.id);
      }

      // Rekord: najlepszy wynik partii lepszy od wszystkich wcześniejszych partii gry w tym
      // samym kierunku. Pierwsza partia i wyrównanie rekordu nie dają osiągnięcia.
      const values = play.results.flatMap((r) => (r.rankingValue === null ? [] : [r.rankingValue]));
      if (values.length > 0) {
        const best = play.dir === 'asc' ? Math.min(...values) : Math.max(...values);
        const key = `${play.gameId}\u0000${play.dir}`;
        const previous = records.get(key);
        if (previous !== undefined && better(play.dir, best, previous))
          for (const r of play.results)
            if (r.rankingValue === best) unlock(r.profileId, 'record', meeting, play.id);
        if (previous === undefined || better(play.dir, best, previous)) records.set(key, best);
      }
    }

    // Serie: spotkanie z wygraną +1, z partiami bez wygranej zeruje, bez partii nic.
    for (const [profileId, tally] of tallies) {
      const state = player(profileId);
      if (tally.firstWin !== null) {
        state.streak += 1;
        counters(profileId, COUNTERS.streak, state.streak, meeting, tally.firstWin);
        if (state.afterBreak) unlock(profileId, 'comeback', meeting, tally.firstWin);
        state.afterBreak = false;
      } else {
        state.afterBreak = state.streak >= 3;
        state.streak = 0;
      }
      if (meeting.finished && tally.plays >= 3 && tally.wins === tally.plays)
        unlock(profileId, 'flawless', meeting, tally.lastPlay);
    }
  }

  // Głos ludu: różne spotkania z głosem w chwili zamknięcia głosowania, chronologicznie.
  const voted = new Map<string, Set<string>>();
  for (const v of history.voters) {
    if (!meetingById.has(v.meetingId))
      throw new Error(`Głos wskazuje nieznane spotkanie ${v.meetingId}.`);
    const set = voted.get(v.profileId) ?? new Set();
    set.add(v.meetingId);
    voted.set(v.profileId, set);
  }
  for (const [profileId, set] of voted) {
    const tenth = meetings.filter((m) => set.has(m.id))[9];
    if (tenth) unlock(profileId, 'voter-10', tenth, null);
  }

  return [...unlocks.values()].sort(
    (a, b) =>
      compareText(a.profileId, b.profileId) || compareText(a.achievementId, b.achievementId),
  );
}
