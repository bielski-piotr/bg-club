import { describe, expect, it } from 'vitest';
import { checkTyped, cleanNumber, flipSign, nextInput, revealShift, stepTyped } from './core/entry';
import { spots, validateTemplate, type LineDef, type PadTemplate } from './core/templates';

/**
 * Wpisywanie punktów w pole kartki (zadanie [021], PAD-13…PAD-15): kolejność pól, zakres
 * kategorii, minus i strzałki, przewijanie widoku do pola.
 */

/** Tabela z kategoriami: imię, dwie punktowe, suma, puste pole, trzecia punktowa, wynik. */
function table(players: number): PadTemplate {
  const cols = players + 1;
  const t = validateTemplate({
    v: 2,
    id: `t-${players}`,
    name: `Tabela ${players}`,
    size: { w: 20, h: 14 },
    tape: '#2c3a46',
    grid: {
      x: Array.from({ length: cols + 1 }, (_, i) => i / cols),
      y: Array.from({ length: 8 }, (_, i) => i / 7),
      players: 'cols',
      labels: 1,
    },
    lines: [
      { id: 'names', label: 'Gracze', kind: 'names' },
      { id: 'a', label: 'Karty', kind: 'input', min: 0, max: 40 },
      { id: 'b', label: 'Kary', kind: 'input', min: -20, max: 0, step: 2 },
      { id: 'sum', label: 'Razem A+B', kind: 'sum', of: ['a', 'b'] },
      { id: 'gap', label: '', kind: 'skip' },
      { id: 'c', label: 'Premia', kind: 'input', values: [0, 5, 12] },
      { id: 'total', label: 'Wynik', kind: 'total' },
    ],
  } as unknown as PadTemplate);
  if (!t) throw new Error('Niepoprawny szablon testowy');
  return t;
}

const line = (t: PadTemplate, id: string): LineDef => {
  const l = t.lines.find((x) => x.id === id);
  if (!l) throw new Error(id);
  return l;
};

/** Pole kategorii `id` gracza `p`. */
function spotOf(t: PadTemplate, id: string, p: number) {
  const li = t.lines.findIndex((x) => x.id === id);
  const sp = spots(t).find((x) => x.li === li && x.p === p);
  if (!sp) throw new Error(`${id}/${p}`);
  return sp;
}

const label = (t: PadTemplate, sp: ReturnType<typeof spotOf> | null) =>
  sp ? `${t.lines[sp.li].id}/${sp.p}` : null;

describe('kolejne pola (PAD-15)', () => {
  it('Enter/Tab idzie po kategoriach punktowych gracza, potem do następnego; pomija imiona, sumy i puste pola', () => {
    const t = table(3);
    const order: (string | null)[] = [];
    let sp: ReturnType<typeof spotOf> | null = spotOf(t, 'a', 0);
    for (let i = 0; i < 9 && sp; i++) {
      order.push(label(t, sp));
      sp = nextInput(t, sp, 1);
    }
    expect(order).toEqual(['a/0', 'b/0', 'c/0', 'a/1', 'b/1', 'c/1', 'a/2', 'b/2', 'c/2']);
    // po ostatniej kategorii ostatniego gracza: pierwsza kategoria pierwszego
    expect(label(t, nextInput(t, spotOf(t, 'c', 2), 1))).toBe('a/0');
  });

  it('Shift+Tab cofa, także do ostatniej kategorii poprzedniego gracza', () => {
    const t = table(3);
    expect(label(t, nextInput(t, spotOf(t, 'c', 1), -1))).toBe('b/1');
    expect(label(t, nextInput(t, spotOf(t, 'a', 1), -1))).toBe('c/0');
    expect(label(t, nextInput(t, spotOf(t, 'a', 0), -1))).toBe('c/2');
  });

  it('działa dla ponad ośmiu miejsc', () => {
    const t = table(10);
    expect(label(t, nextInput(t, spotOf(t, 'c', 8), 1))).toBe('a/9');
    expect(label(t, nextInput(t, spotOf(t, 'c', 9), 1))).toBe('a/0');
    expect(label(t, nextInput(t, spotOf(t, 'a', 9), -1))).toBe('c/8');
  });
});

describe('wpis z klawiatury (PAD-13, PAD-14)', () => {
  it('zostawia cyfry; minus zmienia znak tylko w kategorii z wartościami ujemnymi', () => {
    expect(cleanNumber('12a3', false)).toBe('123');
    expect(cleanNumber('007', false)).toBe('7');
    expect(cleanNumber('-5', false)).toBe('5');
    expect(cleanNumber('-5', true)).toBe('-5');
    expect(cleanNumber('5−', true)).toBe('-5');
    expect(cleanNumber('--5', true)).toBe('5');
    expect(cleanNumber('1234567', false)).toBe('12345');
  });

  it('przycisk ± przełącza znak', () => {
    expect(flipSign('4')).toBe('-4');
    expect(flipSign('-4')).toBe('4');
    expect(flipSign('', true)).toBe('-');
    expect(flipSign('-4', false)).toBe('4');
  });

  it('wpis spoza zakresu albo listy wartości daje błąd po polsku', () => {
    const t = table(2);
    expect(checkTyped(line(t, 'a'), '40')).toEqual({ value: 40, error: '' });
    expect(checkTyped(line(t, 'a'), '41').error).toBe('Ta kategoria przyjmuje: od 0 do 40.');
    expect(checkTyped(line(t, 'b'), '-3').error).toBe('Ta kategoria przyjmuje: od −20 do 0 co 2.');
    expect(checkTyped(line(t, 'b'), '-4').value).toBe(-4);
    expect(checkTyped(line(t, 'c'), '7').error).toBe('Ta kategoria przyjmuje: 0, 5, 12.');
    expect(checkTyped(line(t, 'c'), '5').value).toBe(5);
    // puste pole (albo sam minus) to brak wpisu, bez błędu
    expect(checkTyped(line(t, 'a'), '')).toEqual({ value: null, error: '' });
    expect(checkTyped(line(t, 'b'), '-')).toEqual({ value: null, error: '' });
  });

  it('strzałki góra/dół zmieniają o krok kategorii i nie wychodzą poza zakres', () => {
    const t = table(2);
    expect(stepTyped(line(t, 'a'), '7', 1)).toBe('8');
    expect(stepTyped(line(t, 'a'), '40', 1)).toBe('40');
    expect(stepTyped(line(t, 'a'), '', -1)).toBe('0');
    expect(stepTyped(line(t, 'b'), '-4', -1)).toBe('-6');
    expect(stepTyped(line(t, 'c'), '5', 1)).toBe('12');
    expect(stepTyped(line(t, 'c'), '', 1)).toBe('0');
  });
});

describe('pole w kadrze (PAD-15)', () => {
  const view = { x: 0, y: 60, w: 360, h: 300 };

  it('widoczne pole nie przesuwa widoku', () => {
    expect(revealShift({ x: 100, y: 100, w: 40, h: 30 }, view, 12)).toEqual({ dx: 0, dy: 0 });
  });

  it('pole pod klawiaturą albo nad paskiem przesuwa widok o tyle, ile trzeba', () => {
    expect(revealShift({ x: 100, y: 500, w: 40, h: 30 }, view, 12)).toEqual({ dx: 0, dy: 182 });
    expect(revealShift({ x: 100, y: 20, w: 40, h: 30 }, view, 12)).toEqual({ dx: 0, dy: -52 });
    expect(revealShift({ x: 340, y: 100, w: 40, h: 30 }, view, 12)).toEqual({ dx: 32, dy: 0 });
  });

  it('pole większe niż kadr jest wyśrodkowane', () => {
    expect(revealShift({ x: 100, y: 0, w: 40, h: 400 }, view, 12)).toEqual({ dx: 0, dy: -10 });
  });
});
