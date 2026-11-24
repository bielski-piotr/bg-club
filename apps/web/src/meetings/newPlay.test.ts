import { describe, expect, it } from 'vitest';
import type { Game } from '../games/games';
import type { Scorepad } from '../score-pad/scorepads';
import {
  assignSeat,
  boundsLabel,
  combinedRange,
  emptySeats,
  firstFreeSeat,
  fittingScorepads,
  gameReason,
  gameSubtitle,
  groupGames,
  minPlayers,
  newPlaySteps,
  playerBounds,
  scorepadReason,
  scorepadsByGame,
  scorepadSubtitle,
  scoringTitle,
  seatOf,
  seatedPlayers,
  seatsProblem,
  startPlay,
  startPlayArgs,
  startPlayFailure,
  StartPlayError,
  toggleTeamMember,
} from './newPlay';

function game(n: number, title: string, min = 2, max = 4): Game {
  return {
    id: `00000000-0000-4000-b000-00000000000${n}`,
    title,
    cover_path: null,
    min_players: min,
    max_players: max,
    placement_points: Array.from({ length: max }, (_, i) => max - i),
    complexity: 2,
    created_at: '2026-10-01T00:00:00Z',
    last_played_at: null,
    base_game_id: null,
    cover_source_path: null,
    cover_crop: null,
    play_count: null,
  };
}

function pad(n: number, gameId: string, slots: number | null, version = 1): Scorepad {
  return {
    id: `00000000-0000-4000-d000-00000000000${n}`,
    game_id: gameId,
    name: `Notes ${n}`,
    created_at: '2026-10-01T00:00:00Z',
    current:
      slots === null
        ? null
        : {
            id: `00000000-0000-4000-e000-00000000000${n}`,
            version,
            image_path: null,
            player_slots: slots,
            created_at: '2026-10-01T00:00:00Z',
          },
  };
}

const A = 'a';
const B = 'b';
const C = 'c';

describe('liczba graczy (PAD-3, Q2)', () => {
  it('partia ma co najmniej 2 graczy, także gdy gra ma min = 1', () => {
    expect(minPlayers(game(1, 'Pasjans', 1, 4))).toBe(2);
    expect(minPlayers(game(1, 'Łąka', 3, 5))).toBe(3);
  });

  it('górna granica to mniejsza z max gry i miejsc notesu', () => {
    expect(playerBounds(game(1, 'X', 1, 4), 3)).toEqual({ min: 2, max: 3 });
    expect(playerBounds(game(1, 'X', 2, 4), 10)).toEqual({ min: 2, max: 4 });
  });

  it('opisuje zakres po polsku', () => {
    expect(boundsLabel({ min: 2, max: 4 })).toBe('2–4 graczy');
    expect(boundsLabel({ min: 2, max: 2 })).toBe('2 graczy');
  });
});

describe('notesy i gry z wyjaśnieniem wyłączenia (RUN-2, PAD-3)', () => {
  const zolwie = game(1, 'Żółwie', 1, 4);

  it('notes z mniejszą liczbą miejsc niż minimum jest niepasujący', () => {
    expect(scorepadReason(zolwie, pad(1, zolwie.id, 1))).toBe(
      'Notes ma 1 miejsce, a gra wymaga 2 graczy.',
    );
    expect(scorepadReason(game(2, 'Łąka', 3, 5), pad(2, 'x', 2))).toBe(
      'Notes ma 2 miejsca, a gra wymaga 3 graczy.',
    );
    expect(scorepadReason(zolwie, pad(3, zolwie.id, 2))).toBeNull();
  });

  it('notes bez wersji nie nadaje się do partii', () => {
    expect(scorepadReason(zolwie, pad(1, zolwie.id, null))).toBe(
      'Notes nie ma jeszcze zapisanej wersji.',
    );
  });

  it('gra jednoosobowa nie ma partii (Q2)', () => {
    const solo = game(3, 'Pasjans', 1, 1);
    expect(gameReason(solo, [pad(1, solo.id, 4)], 4)).toBe(
      'Gra jednoosobowa: partia w klubie wymaga co najmniej 2 graczy.',
    );
  });

  it('gra bez notesu nie pozwala rozpocząć partii', () => {
    expect(gameReason(zolwie, [], 4)).toBe(
      'Brak notesu. Administrator może go dodać w kolekcji gier.',
    );
  });

  it('gra bez pasującego notesu jest wyłączona', () => {
    expect(gameReason(zolwie, [pad(1, zolwie.id, 1)], 4)).toBe('Żaden notes nie mieści 2 graczy.');
  });

  it('gra z większym minimum niż liczba uczestników jest wyłączona', () => {
    const laka = game(2, 'Łąka', 3, 5);
    expect(gameReason(laka, [pad(1, laka.id, 5)], 2)).toBe(
      'Gra wymaga 3 graczy. Aktywni uczestnicy spotkania: 2.',
    );
    expect(gameReason(laka, [pad(1, laka.id, 5)], 3)).toBeNull();
  });

  it('filtruje pasujące notesy i grupuje je według gry', () => {
    const pads = [pad(1, zolwie.id, 1), pad(2, zolwie.id, 4), pad(3, 'inna', 2)];
    expect(fittingScorepads(zolwie, pads.slice(0, 2)).map((p) => p.id)).toEqual([pads[1]?.id]);
    const map = scorepadsByGame(pads);
    expect(map.get(zolwie.id)?.length).toBe(2);
    expect(map.get('inna')?.length).toBe(1);
  });

  it('opisuje grę i notes', () => {
    expect(gameSubtitle(zolwie, [pad(1, zolwie.id, 4), pad(2, zolwie.id, 3)])).toBe(
      '2–4 graczy · 2 notesy',
    );
    expect(gameSubtitle(zolwie, [])).toBe('2–4 graczy');
    expect(scorepadSubtitle(pad(1, zolwie.id, 4, 2))).toBe('4 miejsca · wersja 2');
    expect(scorepadSubtitle(pad(1, zolwie.id, 5))).toBe('5 miejsc · wersja 1');
  });
});

describe('kolejność gier (RUN-2: najpierw opublikowane)', () => {
  const azul = game(1, 'Azul');
  const zolwie = game(2, 'Żółwie Wyścigi');
  const brzdek = game(3, 'Brzdęk');
  const games = [zolwie, azul, brzdek];

  it('opublikowane w kolejności publikacji, potem reszta alfabetycznie', () => {
    const groups = groupGames(games, [zolwie.id, brzdek.id]);
    expect(groups.published.map((g) => g.title)).toEqual(['Żółwie Wyścigi', 'Brzdęk']);
    expect(groups.others.map((g) => g.title)).toEqual(['Azul']);
  });

  it('bez publikacji cała kolekcja alfabetycznie; opublikowana usunięta gra znika', () => {
    expect(groupGames(games, []).others.map((g) => g.title)).toEqual([
      'Azul',
      'Brzdęk',
      'Żółwie Wyścigi',
    ]);
    expect(groupGames(games, ['usunieta']).published).toEqual([]);
  });

  it('wyszukuje bez polskich znaków i wielkości liter', () => {
    const groups = groupGames(games, [zolwie.id], 'ZOLW');
    expect(groups.published.map((g) => g.title)).toEqual(['Żółwie Wyścigi']);
    expect(groups.others).toEqual([]);
  });
});

describe('miejsca w notesie (PAD-2)', () => {
  it('puste miejsca według liczby miejsc notesu', () => {
    expect(emptySeats(3)).toEqual([[], [], []]);
  });

  it('sadza gracza i przesadza go bez duplikatów', () => {
    let seats = assignSeat(emptySeats(3), 0, A);
    seats = assignSeat(seats, 2, B);
    expect(seats).toEqual([[A], [], [B]]);
    seats = assignSeat(seats, 1, A);
    expect(seats).toEqual([[], [A], [B]]);
    expect(seatedPlayers(seats)).toEqual([A, B]);
    expect(assignSeat(seats, 1, null)).toEqual([[], [], [B]]);
  });

  it('zamiana gracza na miejscu nie rusza pozostałych', () => {
    expect(assignSeat([[A], [B], []], 0, C)).toEqual([[C], [B], []]);
  });

  it('zespół: dodaje i usuwa członków, przesiadając ich z innych miejsc', () => {
    let seats = toggleTeamMember(emptySeats(2), 0, A);
    seats = toggleTeamMember(seats, 0, B);
    seats = toggleTeamMember(seats, 1, C);
    expect(seats).toEqual([[A, B], [C]]);
    expect(seatOf(seats, B)).toBe(0);
    seats = toggleTeamMember(seats, 1, B);
    expect(seats).toEqual([[A], [C, B]]);
    expect(toggleTeamMember(seats, 1, B)).toEqual([[A], [C]]);
    expect(assignSeat([[A, B], [C]], 0, null)).toEqual([[], [C]]);
  });

  it('pierwsze wolne miejsce', () => {
    expect(firstFreeSeat([[A], [], []])).toBe(1);
    expect(firstFreeSeat([[A], [B]])).toBe(-1);
  });

  it('sprawdza liczbę graczy i stron', () => {
    const bounds = { min: 2, max: 3 };
    expect(seatsProblem([[A], [], [], []], bounds)).toBe('tooFew');
    expect(seatsProblem([[A], [], [B], []], bounds)).toBeNull();
    expect(seatsProblem([[A], [B], [C], ['d']], bounds)).toBe('tooMany');
    // Wszyscy w jednym zespole: partia potrzebuje co najmniej dwóch stron.
    expect(seatsProblem([[A, B], []], bounds)).toBe('sides');
  });

  it('notes z zespołami: graczy może być więcej niż miejsc notesu', () => {
    const game = { min_players: 2, max_players: 6 };
    expect(playerBounds(game, 2)).toEqual({ min: 2, max: 2 });
    expect(playerBounds(game, 2, true)).toEqual({ min: 2, max: 6 });
  });
});

describe('dodatki partii', () => {
  const base = { ...game(1, 'Podstawka', 2, 4), complexity: 2 };
  const harder = { ...game(11, 'Dodatek A', 2, 4), complexity: 3 };
  const bigger = { ...game(12, 'Dodatek B', 2, 6), complexity: 1.5 };
  const biggerHarder = { ...game(13, 'Dodatek C', 1, 6), complexity: 2.5 };

  it('krok „Dodatki” tylko dla gry z dodatkami', () => {
    expect(newPlaySteps(false)).toEqual(['game', 'scorepad', 'players']);
    expect(newPlaySteps(true)).toEqual(['game', 'expansions', 'scorepad', 'players']);
  });

  it('liczba graczy: najmniejsze min i największe max z gry i dodatków', () => {
    expect(combinedRange(base, [])).toEqual({ min_players: 2, max_players: 4 });
    expect(combinedRange(base, [bigger, biggerHarder])).toEqual({ min_players: 1, max_players: 6 });
  });

  it('punktacja: najwyższe skomplikowanie spośród tytułów, które mieszczą graczy', () => {
    expect(scoringTitle(base, [], 3)).toBe(base);
    expect(scoringTitle(base, [harder], 4)).toBe(harder);
    // Dodatek rozszerza liczbę graczy, ale przy 4 graczach mieści podstawka (wyższa).
    expect(scoringTitle(base, [bigger], 4)).toBe(base);
    // 5 graczy: mieści tylko dodatek.
    expect(scoringTitle(base, [bigger], 5)).toBe(bigger);
    // 5 graczy: najwyższy (A) nie mieści, z mieszczących najwyższe ma C.
    expect(scoringTitle(base, [harder, bigger, biggerHarder], 5)).toBe(biggerHarder);
    // Remis skomplikowania wygrywa gra podstawowa.
    expect(scoringTitle(base, [{ ...harder, complexity: 2 }], 3)).toBe(base);
  });

  it('wysyła zaznaczone dodatki do start_play (posortowane)', async () => {
    const calls: unknown[] = [];
    const client = {
      rpc: (name: string, args: unknown) => {
        calls.push([name, args]);
        return Promise.resolve({ error: null });
      },
    };
    await startPlay(client as never, {
      playId: 'p',
      meetingId: 'm',
      scorepadId: 's',
      seats: [[A], [B]],
      expansionIds: ['z', 'a'],
    });
    expect(calls).toEqual([
      [
        'start_play',
        {
          play_id: 'p',
          meeting_id: 'm',
          scorepad_id: 's',
          player_ids: [A, B],
          expansion_ids: ['a', 'z'],
        },
      ],
    ]);
    expect(startPlayFailure({ hint: 'plays_expansion_unavailable' })).toBe('expansionGone');
  });
});

describe('startPlay (RPC start_play)', () => {
  it('wysyła miejsca jako tablicę z NULL dla wolnych miejsc', async () => {
    const calls: unknown[] = [];
    const client = {
      rpc: (name: string, args: unknown) => {
        calls.push([name, args]);
        return Promise.resolve({ error: null });
      },
    };
    await startPlay(client as never, {
      playId: 'p',
      meetingId: 'm',
      scorepadId: 's',
      seats: [[], [A], [B]],
    });
    expect(calls).toEqual([
      ['start_play', { play_id: 'p', meeting_id: 'm', scorepad_id: 's', player_ids: [null, A, B] }],
    ]);
  });

  it('zespoły: płaska lista graczy z numerami miejsc', () => {
    expect(startPlayArgs([[A, B], [], [C]])).toEqual({
      player_ids: [A, B, C],
      seat_numbers: [1, 1, 3],
    });
  });

  it('zamienia błąd bazy na powód z komunikatem', async () => {
    const client = {
      rpc: () =>
        Promise.resolve({ error: { code: '23514', hint: 'plays_players_count', message: 'x' } }),
    };
    await expect(
      startPlay(client as never, { playId: 'p', meetingId: 'm', scorepadId: 's', seats: [] }),
    ).rejects.toEqual(new StartPlayError('count'));
  });

  it('mapuje reguły z HINT i brak uprawnień', () => {
    expect(startPlayFailure({ hint: 'plays_meeting_in_progress' })).toBe('notInProgress');
    expect(startPlayFailure({ hint: 'plays_scorepad_unavailable' })).toBe('scorepadGone');
    expect(startPlayFailure({ hint: 'plays_game_active' })).toBe('gameGone');
    expect(startPlayFailure({ hint: 'plays_scorepad_fits_game' })).toBe('scorepadTooSmall');
    expect(startPlayFailure({ hint: 'play_results_seat_within_slots' })).toBe('seats');
    expect(startPlayFailure({ hint: 'plays_players_unique' })).toBe('duplicate');
    expect(startPlayFailure({ hint: 'plays_player_participant' })).toBe('participant');
    expect(startPlayFailure({ code: '42501' })).toBe('forbidden');
    expect(startPlayFailure({ code: '08000' })).toBe('save');
    expect(startPlayFailure({ hint: 'plays_already_exists', code: '23505' })).toBe('save');
  });
});
