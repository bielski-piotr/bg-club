// Obszar kartki na zdjęciu: wielokąt w pikselach zdjęcia, z którego edytor wyznacza
// cztery narożniki do prostowania perspektywy i kształt kartki (współrzędne kartki 0…1).
// Czyste funkcje bez DOM.

import type { ShapePt, SheetShape } from '../core/shape';
import { Persp, type Pt, type Quad } from './photo';

/** Sposób wyznaczenia obszaru: całe zdjęcie albo punkty ustawione ręcznie. */
export type AreaMode = 'full' | 'manual';

/** Najmniej punktów obszaru (trójkąt). */
export const MIN_AREA_POINTS = 3;
/** Najwięcej punktów obszaru z kształtu wczytanego notesu (więcej uchwytów tylko przeszkadza). */
export const MAX_EDIT_POINTS = 48;
/** Największa siła wygładzania krawędzi. */
export const MAX_SMOOTHING = 10;
/**
 * Czworokąt opisany większy od otoczki najwyżej o 10% (zaokrąglone rogi, wycięcia, otwory):
 * to kartka prostokątna, którą prostujemy perspektywą.
 */
const QUAD_LIKE = 1.1;

type P2 = [number, number];

const cross = (o: Pt, a: Pt, b: Pt): number =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Pole wielokąta ze znakiem (dodatnie zgodnie z ruchem wskazówek zegara w układzie ekranu). */
export function polygonArea(p: readonly Pt[]): number {
  let s = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++)
    s += (p[j].x + p[i].x) * (p[j].y - p[i].y);
  return -s / 2;
}

/**
 * Otoczka wypukła (łańcuch monotoniczny). W układzie ekranu (y w dół) idzie zgodnie z ruchem
 * wskazówek zegara, jak narożniki `Quad`; wnętrze leży po stronie `cross(a, b, p) > 0`.
 */
export function convexHull(pts: readonly Pt[]): Pt[] {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const lo: Pt[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/** Przecięcie prostych a1–a2 i b1–b2 albo null dla równoległych. */
function intersect(a1: Pt, a2: Pt, b1: Pt, b2: Pt): Pt | null {
  const d = (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((b1.x - a1.x) * (b2.y - b1.y) - (b1.y - a1.y) * (b2.x - b1.x)) / d;
  return { x: a1.x + (a2.x - a1.x) * t, y: a1.y + (a2.y - a1.y) * t };
}

const triArea = (a: Pt, b: Pt, c: Pt): number => Math.abs(cross(a, b, c)) / 2;

/**
 * Czworokąt opisany na otoczce: krok po kroku zastępuje krawędź przecięciem sąsiednich krawędzi
 * (najmniejszy przyrost pola). Zaokrąglone rogi i wycięcia nie przesuwają narożników do środka:
 * narożnik to przecięcie przedłużonych boków kartki.
 */
export function enclosingQuad(hull: readonly Pt[]): Pt[] {
  const q = hull.slice();
  while (q.length > 4) {
    const n = q.length;
    let best = Infinity;
    let bi = -1;
    let bx: Pt | null = null;
    for (let i = 0; i < n; i++) {
      const p0 = q[(i + n - 1) % n];
      const p1 = q[i];
      const p2 = q[(i + 1) % n];
      const p3 = q[(i + 2) % n];
      const x = intersect(p0, p1, p2, p3);
      if (!x) continue;
      // przecięcie musi leżeć za krawędzią (na zewnątrz), na przedłużeniu obu sąsiednich boków
      if (cross(p1, p2, x) > 0) continue;
      const along1 = (x.x - p1.x) * (p1.x - p0.x) + (x.y - p1.y) * (p1.y - p0.y);
      const along2 = (x.x - p2.x) * (p2.x - p3.x) + (x.y - p2.y) * (p2.y - p3.y);
      if (along1 < 0 || along2 < 0) continue;
      const add = triArea(p1, x, p2);
      if (add < best) {
        best = add;
        bi = i;
        bx = x;
      }
    }
    if (bi < 0 || !bx) {
      // brak przecięcia na zewnątrz (np. boki równoległe): usuwamy najmniej znaczący wierzchołek
      let mi = 0;
      let ma = Infinity;
      for (let i = 0; i < n; i++) {
        const a = triArea(q[(i + n - 1) % n], q[i], q[(i + 1) % n]);
        if (a < ma) {
          ma = a;
          mi = i;
        }
      }
      q.splice(mi, 1);
      continue;
    }
    if (bi === n - 1) {
      q.splice(bi, 1, bx);
      q.splice(0, 1);
    } else q.splice(bi, 2, bx);
  }
  return q;
}

/**
 * Prostokąt o najmniejszym polu opisany na otoczce (obrotowe suwmiarki): jeden bok prostokąta
 * leży na boku otoczki. Dla kartek, które nie są czworokątem (koło, sześciokąt), bo czworokąt
 * opisany ścinałby albo zniekształcał płaską kartkę przy prostowaniu.
 */
export function minAreaRect(hull: readonly Pt[]): Pt[] {
  let best: Pt[] = [];
  let bestArea = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1e-9) continue;
    const ux = (b.x - a.x) / L;
    const uy = (b.y - a.y) / L;
    let s0 = Infinity;
    let s1 = -Infinity;
    let t0 = Infinity;
    let t1 = -Infinity;
    for (const p of hull) {
      const s = (p.x - a.x) * ux + (p.y - a.y) * uy;
      const t = -(p.x - a.x) * uy + (p.y - a.y) * ux;
      s0 = Math.min(s0, s);
      s1 = Math.max(s1, s);
      t0 = Math.min(t0, t);
      t1 = Math.max(t1, t);
    }
    const area = (s1 - s0) * (t1 - t0);
    if (area < bestArea) {
      bestArea = area;
      const at = (s: number, t: number): Pt => ({
        x: a.x + ux * s - uy * t,
        y: a.y + uy * s + ux * t,
      });
      best = [at(s0, t0), at(s1, t0), at(s1, t1), at(s0, t1)];
    }
  }
  return best;
}

/** Narożniki w kolejności lewy górny, prawy górny, prawy dolny, lewy dolny. */
export function orderQuad(pts: readonly Pt[]): Quad {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const q = pts
    .slice()
    .sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let start = 0;
  for (let i = 1; i < q.length; i++) if (q[i].x + q[i].y < q[start].x + q[start].y) start = i;
  return [0, 1, 2, 3].map((i) => ({ ...q[(start + i) % q.length] })) as Quad;
}

const isConvexQuad = (q: Quad): boolean => {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const c = cross(q[i], q[(i + 1) % 4], q[(i + 2) % 4]);
    if (Math.abs(c) < 1e-6) return false;
    const s = Math.sign(c);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
};

/** Prostokąt całego zdjęcia w×h jako wielokąt obszaru. */
export const fullArea = (w: number, h: number): Pt[] => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
];

/**
 * Cztery narożniki do prostowania perspektywy wyznaczone z obszaru. Narożniki prawie
 * w rogach zdjęcia (do 1,5% przekątnej) to całe zdjęcie: skan i kartka już wyprostowana nie są
 * prostowane drugi raz. Zdegenerowany obszar daje prostokąt opisany na punktach.
 */
export function areaCorners(area: readonly Pt[], w: number, h: number): Quad {
  const full = fullArea(w, h) as Quad;
  if (area.length < MIN_AREA_POINTS) return full;
  const hull = convexHull(area);
  let q: Quad | null = null;
  if (hull.length >= 4) {
    const e = enclosingQuad(hull);
    // Otoczka daleka od czworokąta (koło, sześciokąt, „domek”) to kartka innego kształtu, a nie
    // prostokąt w perspektywie: prostujemy ją według prostokąta opisanego, bez ścinania.
    const hullArea = Math.abs(polygonArea(hull));
    if (e.length === 4 && Math.abs(polygonArea(e)) <= hullArea * QUAD_LIKE) q = orderQuad(e);
    else {
      const r = minAreaRect(hull);
      if (r.length === 4) q = orderQuad(r);
    }
  }
  // Trójkąt (i obszar zdegenerowany) prostujemy według prostokąta opisanego na punktach.
  const diag = Math.hypot(w, h);
  if (!q || !isConvexQuad(q) || Math.abs(polygonArea(q)) < w * h * 0.002) {
    const xs = area.map((p) => p.x);
    const ys = area.map((p) => p.y);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    if (x1 - x0 < 1 || y1 - y0 < 1) return full;
    q = [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ];
  }
  // Przedłużone boki mogą wyjść daleko poza zdjęcie (np. bardzo tępy róg): ograniczamy do pół przekątnej.
  q = q.map((p) => ({
    x: Math.min(w + diag / 2, Math.max(-diag / 2, p.x)),
    y: Math.min(h + diag / 2, Math.max(-diag / 2, p.y)),
  })) as Quad;
  const near = q.every((p, i) => Math.hypot(p.x - full[i].x, p.y - full[i].y) <= diag * 0.015);
  return near ? full : q;
}

const r4 = (v: number): number => Math.round(v * 10000) / 10000;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Wielokąt zdjęcia → pierścień we współrzędnych kartki (0…1) dla narożników `quad`. */
export function toSheetRing(ring: readonly Pt[], quad: Quad): ShapePt[] {
  const P = new Persp(quad);
  const out: ShapePt[] = [];
  for (const p of ring) {
    const { u, v } = P.toSheet(p.x, p.y);
    const q: ShapePt = [r4(clamp01(u)), r4(clamp01(v))];
    const last = out[out.length - 1];
    if (!last || last[0] !== q[0] || last[1] !== q[1]) out.push(q);
  }
  if (
    out.length > 1 &&
    out[0][0] === out[out.length - 1][0] &&
    out[0][1] === out[out.length - 1][1]
  )
    out.pop();
  return out;
}

/** Pierścień kartki → wielokąt zdjęcia dla narożników `quad`. */
export function toPhotoRing(ring: readonly ShapePt[], quad: Quad): Pt[] {
  const P = new Persp(quad);
  return ring.map(([u, v]) => P.toPhoto(u, v));
}

const ringArea = (r: readonly ShapePt[]): number => {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a) / 2;
};

/**
 * Wygładzanie krawędzi: punkty pośrednie metodą Chaikina. Siła 1…10 to długość cięcia
 * przy każdym punkcie (do ćwierci boku), więc długie proste boki zostają proste, a rogi i wycięcia
 * przechodzą płynnie. Trzy przebiegi dają łuk bez widocznych załamań.
 */
export function smoothRing(ring: readonly ShapePt[], strength: number): ShapePt[] {
  const s = Math.max(0, Math.min(MAX_SMOOTHING, strength));
  if (s <= 0 || ring.length < 3) return ring.slice();
  const r = (0.25 * s) / MAX_SMOOTHING;
  let cur: ShapePt[] = ring.slice();
  for (let pass = 0; pass < 3; pass++) {
    const next: ShapePt[] = [];
    for (let i = 0; i < cur.length; i++) {
      const a = cur[i];
      const b = cur[(i + 1) % cur.length];
      next.push([a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r]);
      next.push([a[0] + (b[0] - a[0]) * (1 - r), a[1] + (b[1] - a[1]) * (1 - r)]);
    }
    cur = next;
  }
  return simplifyRing(
    cur.map(([x, y]) => [r4(x), r4(y)] as ShapePt),
    0.0004,
  );
}

/** Upraszcza zamknięty pierścień (Douglas–Peucker); `eps` w jednostkach pierścienia. */
export function simplifyRing<T extends P2 | Pt>(ring: readonly T[], eps: number): T[] {
  if (ring.length < 5) return ring.slice();
  const xy = (p: T): P2 => (Array.isArray(p) ? (p as P2) : [(p as Pt).x, (p as Pt).y]);
  const pts = ring.map(xy);
  let far = 0;
  let fd = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2;
    if (d > fd) {
      fd = d;
      far = i;
    }
  }
  const keep = new Uint8Array(pts.length + 1);
  const run = (a: number, b: number): void => {
    const stack: P2[] = [[a, b]];
    keep[a] = keep[b] = 1;
    while (stack.length) {
      const [i0, i1] = stack.pop() as P2;
      const A = pts[i0 % pts.length];
      const B = pts[i1 % pts.length];
      const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1e-12;
      let best = -1;
      let bi = -1;
      for (let i = i0 + 1; i < i1; i++) {
        const P = pts[i % pts.length];
        const d = Math.abs((B[0] - A[0]) * (A[1] - P[1]) - (A[0] - P[0]) * (B[1] - A[1])) / L;
        if (d > best) {
          best = d;
          bi = i;
        }
      }
      if (best > eps) {
        keep[bi] = 1;
        stack.push([i0, bi], [bi, i1]);
      }
    }
  };
  run(0, far);
  run(far, pts.length);
  const out = ring.filter((_, i) => keep[i]);
  return out.length >= 3 ? out : ring.slice();
}

/** Upraszcza obszar do najwyżej `max` punktów (rosnąca tolerancja). */
export function limitPoints(area: readonly Pt[], max: number, diag: number): Pt[] {
  let eps = diag * 0.002;
  let out = simplifyRing(area, eps);
  while (out.length > max && eps < diag) {
    eps *= 1.5;
    out = simplifyRing(area, eps);
  }
  return out;
}

/**
 * Kształt kartki z obszaru: obrys (opcjonalnie wygładzony) i otwory we współrzędnych kartki.
 * `undefined`, gdy obszar to cały prostokąt kartki (zwykła prostokątna kartka).
 */
export function areaShape(
  area: readonly Pt[],
  holes: readonly (readonly Pt[])[],
  quad: Quad,
  smoothing: number,
): SheetShape | undefined {
  let outline = toSheetRing(area, quad);
  if (outline.length < MIN_AREA_POINTS) return undefined;
  const rings = holes
    .map((h) => toSheetRing(h, quad))
    .filter((h) => h.length >= 3 && ringArea(h) > 1e-4);
  // Prostokąt sprawdzamy przed wygładzeniem: nawet słabe wygładzanie zaokrągla rogi.
  if (!rings.length && ringArea(outline) >= 0.997) {
    if (smoothing <= 0) return undefined;
    outline = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
  }
  if (smoothing > 0) outline = smoothRing(outline, smoothing);
  return rings.length ? { outline, holes: rings } : { outline };
}

/** Odległość punktu od odcinka a–b i rzut punktu na odcinek (t ∈ 0…1). */
export function segmentDistance(p: Pt, a: Pt, b: Pt): { d: number; t: number; at: Pt } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  const at = { x: a.x + dx * t, y: a.y + dy * t };
  return { d: Math.hypot(p.x - at.x, p.y - at.y), t, at };
}

/**
 * Wstawia punkt na krawędzi obszaru najbliższej `p` (kliknięcie lub dotknięcie krawędzi).
 * Zwraca nowy obszar i indeks wstawionego punktu albo null, gdy krawędź jest dalej niż `tol`.
 */
export function insertPoint(
  area: readonly Pt[],
  p: Pt,
  tol: number,
): { area: Pt[]; index: number } | null {
  let best = Infinity;
  let bi = -1;
  let at: Pt = p;
  for (let i = 0; i < area.length; i++) {
    const r = segmentDistance(p, area[i], area[(i + 1) % area.length]);
    if (r.d < best) {
      best = r.d;
      bi = i;
      at = r.at;
    }
  }
  if (bi < 0 || best > tol) return null;
  const out = area.map((q) => ({ ...q }));
  out.splice(bi + 1, 0, { x: at.x, y: at.y });
  return { area: out, index: bi + 1 };
}

/** Usuwa punkt obszaru (zostają co najmniej trzy) albo zwraca null. */
export function removePoint(area: readonly Pt[], index: number): Pt[] | null {
  if (area.length <= MIN_AREA_POINTS || index < 0 || index >= area.length) return null;
  return area.filter((_, i) => i !== index).map((q) => ({ ...q }));
}

/** Obrót punktu zdjęcia w×h o 90° razem ze zdjęciem (dir 1 = w prawo). */
export function rotatePoint(p: Pt, w: number, h: number, dir: 1 | -1): Pt {
  return dir === 1 ? { x: h - p.y, y: p.x } : { x: p.y, y: w - p.x };
}

/** Czy obszar jest poprawny: co najmniej trzy punkty i niezerowe pole. */
export function areaValid(area: readonly Pt[], w: number, h: number): boolean {
  return area.length >= MIN_AREA_POINTS && Math.abs(polygonArea(area)) >= w * h * 0.002;
}
