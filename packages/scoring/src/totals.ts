/**
 * Sumy notesu (PRD EDT-13): suma liczy się z wybranych kategorii, także z innych sum, bez cykli.
 *
 * Reguły domyślne (kategoria sumy bez listy `of`) pochodzą z notesu POC 2.4.0 i są tu przeniesione
 * bez zmian zachowania, żeby notes i edytor liczyły tak samo.
 */
import type { LineValues, ScoringLine, ScoringTemplate } from './template';
import { FINAL_TOTAL, isComputed } from './template';

type Lines = { readonly lines: readonly ScoringLine[] };

/** Kategorie sumowane przez kategorię o indeksie `i` (jawna lista albo domyślna). */
export function effectiveOf(t: Lines, i: number): string[] {
  const ln = t.lines[i];
  if (!ln) return [];
  const ids = new Set(t.lines.map((l) => l.id));
  if (ln.of) return ln.of.filter((id) => id !== ln.id && ids.has(id));
  if (ln.kind === 'total')
    return t.lines.filter((l) => l.kind === 'input' || l.kind === 'bonus').map((l) => l.id);
  // Suma częściowa sumuje punktacje od poprzedniej sumy częściowej; premia liczy się z niej.
  let start = 0;
  for (let k = i - 1; k >= 0; k--) {
    if (t.lines[k]?.kind === 'sum') {
      if (ln.kind === 'bonus') return effectiveOf(t, k);
      start = k + 1;
      break;
    }
  }
  return t.lines
    .slice(start, i)
    .filter((l) => l.kind === 'input')
    .map((l) => l.id);
}

/** Wszystkie punktacje, z których (pośrednio) składa się lista kategorii. */
export function inputLeaves(t: Lines, ids: readonly string[], seen = new Set<string>()): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const i = t.lines.findIndex((l) => l.id === id);
    const ln = t.lines[i];
    if (!ln) continue;
    if (ln.kind === 'input') out.push(id);
    else if (ln.kind === 'sum' || ln.kind === 'total')
      out.push(...inputLeaves(t, effectiveOf(t, i), seen));
  }
  return out;
}

/**
 * Suma końcowa (`total`), która domyślnie rozstrzyga o miejscu: ostatnia z sum, których nie
 * sumuje żadna inna suma (EDT-2). `-1`, gdy notes nie ma sumy `total`.
 */
export function finalTotalIndex(t: Lines): number {
  const totals = t.lines.flatMap((l, i) => (l.kind === 'total' ? [i] : []));
  if (!totals.length) return -1;
  const used = new Set<string>();
  for (const i of totals) for (const id of effectiveOf(t, i)) used.add(id);
  const top = totals.filter((i) => !used.has(t.lines[i]?.id ?? ''));
  const pick = top.length ? top : totals;
  return pick[pick.length - 1] ?? -1;
}

/**
 * Kategorie sum, które leżą na cyklu (suma zależy pośrednio od siebie). Takie sumy nie mają
 * wartości: `computeTotals` zwraca dla nich `null`, a walidacja zgłasza błąd.
 */
export function cyclicLines(t: Lines): string[] {
  const idx = new Map(t.lines.map((l, i) => [l.id, i]));
  const state = new Map<string, 'active' | 'done'>();
  const cyclic = new Set<string>();
  const stack: string[] = [];
  const visit = (id: string): void => {
    const i = idx.get(id);
    const ln = i === undefined ? undefined : t.lines[i];
    if (i === undefined || !ln || !isComputed(ln.kind)) return;
    const s = state.get(id);
    if (s === 'done') return;
    if (s === 'active') {
      for (const x of stack.slice(stack.indexOf(id))) cyclic.add(x);
      return;
    }
    state.set(id, 'active');
    stack.push(id);
    // Jawna lista może wskazywać samą siebie; `effectiveOf` ją pomija, ale to też jest cykl.
    if (ln.of?.includes(id)) cyclic.add(id);
    for (const next of effectiveOf(t, i)) visit(next);
    stack.pop();
    state.set(id, 'done');
  };
  for (const l of t.lines) visit(l.id);
  return t.lines.filter((l) => cyclic.has(l.id)).map((l) => l.id);
}

/**
 * Sumy, premie i wynik końcowy (`FINAL_TOTAL`) jednego gracza. Suma bez żadnej wpisanej
 * składowej jest pusta (`null`); suma na cyklu też.
 */
export function computeTotals(
  t: ScoringTemplate,
  values: LineValues,
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  const idx = new Map(t.lines.map((l, i) => [l.id, i]));
  const cyclic = new Set(cyclicLines(t));
  const memo = new Map<string, number | null>();
  const val = (id: string): number | null => {
    const i = idx.get(id);
    const ln = i === undefined ? undefined : t.lines[i];
    if (i === undefined || !ln) return null;
    if (ln.kind === 'input') return values[id] ?? null;
    if (!isComputed(ln.kind) || cyclic.has(id)) return null;
    const known = memo.get(id);
    if (known !== undefined) return known;
    const of = effectiveOf(t, i);
    const parts = of.map(val);
    const s = parts.some((x) => x != null) ? parts.reduce<number>((a, b) => a + (b ?? 0), 0) : null;
    let r = s;
    if (ln.kind === 'bonus') {
      const leaves = inputLeaves(t, of);
      const done = leaves.length > 0 && leaves.every((x) => values[x] != null);
      r = s != null && s >= (ln.threshold ?? 0) ? (ln.bonus ?? 0) : done ? 0 : null;
    }
    memo.set(id, r);
    return r;
  };
  for (const ln of t.lines) if (isComputed(ln.kind)) out[ln.id] = val(ln.id);
  const fi = finalTotalIndex(t);
  const final = t.lines[fi];
  if (final) out[FINAL_TOTAL] = out[final.id] ?? null;
  else {
    const parts = t.lines
      .filter((l) => l.kind === 'input' || l.kind === 'bonus')
      .map((l) => val(l.id));
    out[FINAL_TOTAL] = parts.some((x) => x != null)
      ? parts.reduce<number>((a, b) => a + (b ?? 0), 0)
      : null;
  }
  return out;
}
