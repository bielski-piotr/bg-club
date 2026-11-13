import { describe, expect, it } from 'vitest';
import {
  emptyGameForm,
  gameFormFrom,
  gameRow,
  hasErrors,
  parsePoints,
  pointsIncrease,
  resizePoints,
  validateGameForm,
  type GameFormValues,
} from './form';
import { playersLabel } from './labels';

const valid: GameFormValues = {
  title: '  Żółwie Wyścigi ',
  minPlayers: 2,
  maxPlayers: 4,
  points: ['10', '6', '4', '2'],
};

describe('formularz gry: liczba graczy (GAME-4)', () => {
  it('przyjmuje 1 ≤ min ≤ max bez górnego limitu', () => {
    expect(hasErrors(validateGameForm(valid))).toBe(false);
    const solo = { ...valid, minPlayers: 1, maxPlayers: 1, points: ['5'] };
    expect(hasErrors(validateGameForm(solo))).toBe(false);
    const huge = { ...valid, maxPlayers: 40, points: resizePoints(['0'], 40).map(() => '0') };
    expect(hasErrors(validateGameForm(huge))).toBe(false);
  });

  it('odrzuca min < 1 i max < min', () => {
    expect(validateGameForm({ ...valid, minPlayers: 0 }).minPlayers).toBe('min');
    const errors = validateGameForm({ ...valid, minPlayers: 5 });
    expect(errors.maxPlayers).toBe('range');
    expect(hasErrors(errors)).toBe(true);
  });

  it('wymaga tytułu do 120 znaków', () => {
    expect(validateGameForm({ ...valid, title: '   ' }).title).toBe('required');
    expect(validateGameForm({ ...valid, title: 'x'.repeat(121) }).title).toBe('tooLong');
    expect(validateGameForm({ ...valid, title: ` ${'x'.repeat(120)} ` }).title).toBeUndefined();
  });
});

describe('formularz gry: punkty za miejsca (GAME-5)', () => {
  it('zmiana max dodaje puste pola na końcu albo usuwa ostatnie', () => {
    expect(resizePoints(['10', '6', '4'], 5)).toEqual(['10', '6', '4', '', '']);
    expect(resizePoints(['10', '6', '4'], 2)).toEqual(['10', '6']);
    expect(resizePoints(['10'], 0)).toEqual([]);
  });

  it('przyjmuje tylko liczby całkowite ≥ 0', () => {
    expect(parsePoints('0')).toBe(0);
    expect(parsePoints(' 12 ')).toBe(12);
    expect(parsePoints('')).toBe('required');
    expect(parsePoints('-1')).toBe('invalid');
    expect(parsePoints('1.5')).toBe('invalid');
    expect(parsePoints('1e3')).toBe('invalid');
    expect(parsePoints('abc')).toBe('invalid');
    expect(parsePoints('99999999999')).toBe('tooLarge');
  });

  it('każde miejsce 1…max musi mieć punkty', () => {
    const errors = validateGameForm({ ...valid, points: ['10', '', 'x', '2'] });
    expect(errors.points).toEqual([undefined, 'required', 'invalid', undefined]);
    expect(hasErrors(errors)).toBe(true);
  });

  it('ostrzega, gdy niższe miejsce ma więcej punktów (bez blokady)', () => {
    expect(pointsIncrease(['10', '6', '6', '0'])).toBe(false);
    expect(pointsIncrease(['10', '12', '4'])).toBe(true);
    expect(pointsIncrease(['0', '5', '9'])).toBe(true);
    // Puste i błędne pola są pomijane: porównujemy tylko wpisane liczby.
    expect(pointsIncrease(['10', '', '4'])).toBe(false);
    expect(pointsIncrease(['4', 'x', '10'])).toBe(true);
    const increasing = { ...valid, points: ['0', '2', '4', '6'] };
    expect(hasErrors(validateGameForm(increasing))).toBe(false);
  });
});

describe('formularz gry: wiersz games', () => {
  it('przycina tytuł i zamienia punkty na liczby', () => {
    expect(gameRow(valid)).toEqual({
      title: 'Żółwie Wyścigi',
      min_players: 2,
      max_players: 4,
      placement_points: [10, 6, 4, 2],
    });
  });

  it('nowa gra: 2–4 graczy i puste pola; edycja: wartości gry', () => {
    expect(emptyGameForm()).toEqual({
      title: '',
      minPlayers: 2,
      maxPlayers: 4,
      points: ['', '', '', ''],
    });
    expect(
      gameFormFrom({ title: 'Łąka', min_players: 1, max_players: 2, placement_points: [3, 0] }),
    ).toEqual({ title: 'Łąka', minPlayers: 1, maxPlayers: 2, points: ['3', '0'] });
  });

  it('opisuje liczbę graczy', () => {
    expect(playersLabel({ min_players: 2, max_players: 4 })).toBe('2–4 graczy');
    expect(playersLabel({ min_players: 1, max_players: 1 })).toBe('1 gracz');
    expect(playersLabel({ min_players: 3, max_players: 3 })).toBe('3 graczy');
  });
});
