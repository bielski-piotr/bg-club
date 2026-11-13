// Narzędzia kształtu kartki: wykrywanie obrysu ze zdjęcia, różdżka, wycinanie i dodawanie obszarów.
// Wszystkie operacje działają na masce rastrowej, a wynik jest z powrotem obrysowywany wielokątem.

import type { ShapePt, SheetShape } from '../core/shape';
import { shapePath } from '../core/shape';
import { clamp, plural } from '../core/util';
import type { Quad } from './photo';
import { warp } from './photo';

/** Maska kartki: 1 = papier. */
export interface Mask {
  w: number;
  h: number;
  d: Uint8Array;
}

export type Box = { x: number; y: number; w: number; h: number };

const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function maskSize(aspect: number, long = 800): { w: number; h: number } {
  return aspect >= 1
    ? { w: long, h: Math.max(8, Math.round(long / aspect)) }
    : { w: Math.max(8, Math.round(long * aspect)), h: long };
}

/** Rasteryzuje kształt (brak kształtu = cała kartka). */
export function rasterize(shape: SheetShape | undefined, w: number, h: number): Mask {
  const d = new Uint8Array(w * h);
  if (!shape) return { w, h, d: d.fill(1) };
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  g.fillStyle = '#fff';
  g.beginPath();
  shapePath(g, shape, w, h);
  g.fill('evenodd');
  const px = g.getImageData(0, 0, w, h).data;
  for (let i = 0; i < d.length; i++) d[i] = px[i * 4 + 3] >= 128 ? 1 : 0;
  return { w, h, d };
}

/** Wypełnia prostokąt albo elipsę (współrzędne kartki 0…1) wartością `v`. */
export function paintBox(m: Mask, b: Box, round: boolean, v: 0 | 1): void {
  const x0 = clamp(Math.floor(b.x * m.w), 0, m.w);
  const x1 = clamp(Math.ceil((b.x + b.w) * m.w), 0, m.w);
  const y0 = clamp(Math.floor(b.y * m.h), 0, m.h);
  const y1 = clamp(Math.ceil((b.y + b.h) * m.h), 0, m.h);
  const cx = (b.x + b.w / 2) * m.w;
  const cy = (b.y + b.h / 2) * m.h;
  const rx = Math.max(0.5, (b.w / 2) * m.w);
  const ry = Math.max(0.5, (b.h / 2) * m.h);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (round) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy > 1) continue;
      }
      m.d[y * m.w + x] = v;
    }
  }
}

/** Wypełnia wielokąt (współrzędne kartki, mogą wychodzić poza 0…1) wartością `v` — narzędzie lasso. */
export function paintPoly(m: Mask, pts: { u: number; v: number }[], v: 0 | 1): number {
  if (pts.length < 3) return 0;
  const c = document.createElement('canvas');
  c.width = m.w;
  c.height = m.h;
  const g = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  g.fillStyle = '#fff';
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p.u * m.w, p.v * m.h) : g.moveTo(p.u * m.w, p.v * m.h)));
  g.closePath();
  g.fill('nonzero');
  const px = g.getImageData(0, 0, m.w, m.h).data;
  let n = 0;
  for (let i = 0; i < m.d.length; i++) {
    if (px[i * 4 + 3] < 128) continue;
    if (m.d[i] !== v) n++;
    m.d[i] = v;
  }
  return n;
}

/** Rozmycie pudełkowe w miejscu; brzeg powielony (kartka „ciągnie się” za krawędź zdjęcia). */
function boxBlur(f: Float32Array, w: number, h: number, r: number): void {
  const tmp = new Float32Array(Math.max(w, h) + 2 * r + 1);
  const pass = (len: number, count: number, at: (line: number, k: number) => number): void => {
    for (let line = 0; line < count; line++) {
      for (let k = -r; k < len + r; k++) tmp[k + r] = f[at(line, clamp(k, 0, len - 1))];
      let s = 0;
      for (let k = 0; k <= 2 * r; k++) s += tmp[k];
      for (let k = 0; k < len; k++) {
        f[at(line, k)] = s / (2 * r + 1);
        s += tmp[k + 2 * r + 1] - tmp[k];
      }
    }
  };
  pass(w, h, (y, x) => y * w + x);
  pass(h, w, (x, y) => y * w + x);
}

/**
 * Wygładza obrys: rasteryzacja, rozmycie i próg 50% (zaokrągla poszarpane krawędzie i ostre rogi wycięć).
 * `level` 0…10; zewnętrzny prostokąt kartki zostaje prosty.
 */
export function smoothShape(
  s: SheetShape | undefined,
  level: number,
  aspect: number,
): SheetShape | undefined {
  if (!s || level <= 0) return s;
  const { w, h } = maskSize(aspect, 640);
  const m = rasterize(s, w, h);
  const r = Math.max(1, Math.round((level * Math.max(w, h)) / 520));
  const f = new Float32Array(w * h);
  for (let i = 0; i < f.length; i++) f[i] = m.d[i];
  for (let k = 0; k < 3; k++) boxBlur(f, w, h, r);
  for (let i = 0; i < f.length; i++) m.d[i] = f[i] >= 0.5 ? 1 : 0;
  const out = traceShape(m);
  return out === null ? s : out;
}

/** Kolory obrazu w rozdzielczości maski. */
export function pixelsAt(img: HTMLCanvasElement, w: number, h: number): Uint8ClampedArray {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, w, h);
  return g.getImageData(0, 0, w, h).data;
}

const dist3 = (px: Uint8ClampedArray, i: number, c: number[]): number =>
  Math.hypot(px[i * 4] - c[0], px[i * 4 + 1] - c[1], px[i * 4 + 2] - c[2]);

/** Różdżka: spójny obszar o kolorze podobnym do klikniętego punktu (1 = obszar). */
export function wandRegion(
  px: Uint8ClampedArray,
  w: number,
  h: number,
  u: number,
  v: number,
  tol: number,
): Uint8Array {
  const sx = clamp(Math.floor(u * w), 0, w - 1);
  const sy = clamp(Math.floor(v * h), 0, h - 1);
  // kolor ziarna: średnia z okolicy 5×5 (odporna na szum)
  const c = [0, 0, 0];
  let n = 0;
  for (let y = Math.max(0, sy - 2); y <= Math.min(h - 1, sy + 2); y++) {
    for (let x = Math.max(0, sx - 2); x <= Math.min(w - 1, sx + 2); x++) {
      const i = (y * w + x) * 4;
      c[0] += px[i];
      c[1] += px[i + 1];
      c[2] += px[i + 2];
      n++;
    }
  }
  c[0] /= n;
  c[1] /= n;
  c[2] /= n;
  const out = new Uint8Array(w * h);
  const stack = [sy * w + sx];
  out[sy * w + sx] = 1;
  while (stack.length) {
    const i = stack.pop() as number;
    const x = i % w;
    const y = (i / w) | 0;
    for (const [dx, dy] of N4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = yy * w + xx;
      if (out[j] || dist3(px, j, c) > tol) continue;
      out[j] = 1;
      stack.push(j);
    }
  }
  // brzeg obszaru (antyaliasing) też należy do tła
  return grow(out, w, h, 1);
}

/** Poszerza obszar o r pikseli (sąsiedztwo 8). */
function grow(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  let cur = m;
  for (let k = 0; k < r; k++) {
    const nx = cur.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (cur[y * w + x]) continue;
        let on = 0;
        for (let dy = -1; dy <= 1 && !on; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < w && yy < h && cur[yy * w + xx]) {
              on = 1;
              break;
            }
          }
        }
        if (on) nx[y * w + x] = 1;
      }
    }
    cur = nx;
  }
  return cur;
}

/** Odległość (fazowana 3-4) od najbliższego piksela zbioru `zero`; poza obrazem nie ma zbioru. */
function chamfer(zero: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = zero[i] ? 0 : INF;
  const S = Math.SQRT2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = d[i];
      if (!v) continue;
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) {
        v = Math.min(v, d[i - w] + 1);
        if (x > 0) v = Math.min(v, d[i - w - 1] + S);
        if (x < w - 1) v = Math.min(v, d[i - w + 1] + S);
      }
      d[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let v = d[i];
      if (!v) continue;
      if (x < w - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < h - 1) {
        v = Math.min(v, d[i + w] + 1);
        if (x < w - 1) v = Math.min(v, d[i + w + 1] + S);
        if (x > 0) v = Math.min(v, d[i + w - 1] + S);
      }
      d[i] = v;
    }
  }
  return d;
}

/** Otwarcie morfologiczne: usuwa z obszaru części węższe niż 2r (paski na brzegach, drobiny). */
function opening(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const inv = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) inv[i] = m[i] ? 0 : 1;
  const dIn = chamfer(inv, w, h);
  const core = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) core[i] = m[i] && dIn[i] > r ? 1 : 0;
  const dCore = chamfer(core, w, h);
  const out = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) out[i] = m[i] && dCore[i] <= r + 0.5 ? 1 : 0;
  return out;
}

/** Etykiety składowych spójnych (sąsiedztwo 4) pikseli o wartości `v`. */
function components(
  d: Uint8Array,
  w: number,
  h: number,
  v: 0 | 1,
): { lab: Int32Array; sizes: number[]; border: boolean[] } {
  const lab = new Int32Array(d.length).fill(-1);
  const sizes: number[] = [];
  const border: boolean[] = [];
  const stack: number[] = [];
  for (let s = 0; s < d.length; s++) {
    if (d[s] !== v || lab[s] >= 0) continue;
    const id = sizes.length;
    let size = 0;
    let onBorder = false;
    lab[s] = id;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop() as number;
      size++;
      const x = i % w;
      const y = (i / w) | 0;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) onBorder = true;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (d[j] !== v || lab[j] >= 0) continue;
        lab[j] = id;
        stack.push(j);
      }
    }
    sizes.push(size);
    border.push(onBorder);
  }
  return { lab, sizes, border };
}

const DIRS = [
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
];
const dirOf = (dx: number, dy: number): number => DIRS.findIndex(([a, b]) => a === dx && b === dy);

/** Obrys składowej (śledzenie sąsiedztwa Moore'a) — środki pikseli brzegowych, zgodnie z ruchem wskazówek zegara. */
function traceMoore(
  inside: (x: number, y: number) => boolean,
  sx: number,
  sy: number,
  limit: number,
): [number, number][] {
  const out: [number, number][] = [[sx, sy]];
  let px = sx;
  let py = sy;
  let bx = sx - 1;
  let by = sy;
  const b0x = bx;
  const b0y = by;
  for (let guard = 0; guard < limit; guard++) {
    const k = dirOf(bx - px, by - py);
    let found = false;
    for (let t = 1; t <= 8; t++) {
      const [dx, dy] = DIRS[(k + t) % 8];
      if (inside(px + dx, py + dy)) {
        const [pdx, pdy] = DIRS[(k + t - 1) % 8];
        bx = px + pdx;
        by = py + pdy;
        px += dx;
        py += dy;
        found = true;
        break;
      }
    }
    if (!found) break;
    if (px === sx && py === sy && bx === b0x && by === b0y) break;
    out.push([px, py]);
  }
  if (out.length > 1 && out[out.length - 1][0] === sx && out[out.length - 1][1] === sy) out.pop();
  return out;
}

function dp(pts: [number, number][], eps: number): [number, number][] {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const L = Math.hypot(bx - ax, by - ay) || 1e-9;
    let best = -1;
    let bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L;
      if (d > best) {
        best = d;
        bi = i;
      }
    }
    if (best > eps) {
      keep[bi] = 1;
      stack.push([a, bi], [bi, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Upraszcza zamknięty wielokąt (Douglas–Peucker). */
function simplifyClosed(pts: [number, number][], eps: number): [number, number][] {
  if (pts.length < 6) return pts;
  let far = 0;
  let fd = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2;
    if (d > fd) {
      fd = d;
      far = i;
    }
  }
  const a = dp(pts.slice(0, far + 1), eps);
  const b = dp([...pts.slice(far), pts[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

function toRing(pts: [number, number][], w: number, h: number): ShapePt[] {
  const snap = (v: number, n: number): number => {
    const t = (v + 0.5) / n;
    return t < 1.6 / n ? 0 : t > 1 - 1.6 / n ? 1 : Math.round(t * 10000) / 10000;
  };
  const ring: ShapePt[] = [];
  for (const [x, y] of pts) {
    const p: ShapePt = [snap(x, w), snap(y, h)];
    const last = ring[ring.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) ring.push(p);
  }
  // punkty leżące na jednej krawędzi zdjęcia między sąsiadami na tej samej krawędzi są zbędne
  return ring.filter((p, i) => {
    const a = ring[(i + ring.length - 1) % ring.length];
    const b = ring[(i + 1) % ring.length];
    return (
      !((p[0] === 0 || p[0] === 1) && a[0] === p[0] && b[0] === p[0]) &&
      !((p[1] === 0 || p[1] === 1) && a[1] === p[1] && b[1] === p[1])
    );
  });
}

/**
 * Zamienia maskę w kształt kartki: największy kawałek papieru, jego obrys i otwory.
 * Zwraca `undefined`, gdy maska to (prawie) cały prostokąt, i `null`, gdy papieru prawie nie ma.
 */
export function traceShape(m: Mask): SheetShape | undefined | null {
  const { w, h } = m;
  const total = w * h;
  const paper = components(m.d, w, h, 1);
  if (!paper.sizes.length) return null;
  const main = paper.sizes.indexOf(Math.max(...paper.sizes));
  if (paper.sizes[main] < total * 0.05) return null;
  const d = new Uint8Array(total);
  for (let i = 0; i < total; i++) d[i] = paper.lab[i] === main ? 1 : 0;
  // tło: to, co dotyka brzegu zdjęcia, jest na zewnątrz; reszta to otwory (drobne się zasklepia)
  const bg = components(d, w, h, 0);
  const holes: number[] = [];
  let outside = 0;
  bg.sizes.forEach((s, id) => {
    if (bg.border[id]) outside += s;
    else if (s >= total * 0.0006) holes.push(id);
  });
  for (let i = 0; i < total; i++)
    if (bg.lab[i] >= 0 && !bg.border[bg.lab[i]] && !holes.includes(bg.lab[i])) d[i] = 1;
  if (outside < total * 0.0005 && !holes.length) return undefined;
  const eps = Math.max(0.7, Math.max(w, h) / 900);
  const limit = total * 4;
  const start = d.indexOf(1);
  const outline = toRing(
    simplifyClosed(
      traceMoore(
        (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[y * w + x] === 1,
        start % w,
        (start / w) | 0,
        limit,
      ),
      eps,
    ),
    w,
    h,
  );
  if (outline.length < 3) return null;
  const rings: ShapePt[][] = [];
  for (const id of holes) {
    const s = bg.lab.indexOf(id);
    const r = toRing(
      simplifyClosed(
        traceMoore(
          (x, y) => x >= 0 && y >= 0 && x < w && y < h && bg.lab[y * w + x] === id,
          s % w,
          (s / w) | 0,
          limit,
        ),
        eps,
      ),
      w,
      h,
    );
    if (r.length >= 3) rings.push(r);
  }
  return rings.length ? { outline, holes: rings } : { outline };
}

const inQuad = (q: Quad, x: number, y: number): boolean => {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (c === 0) continue;
    const s = c > 0 ? 1 : -1;
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
};

const median = (a: number[]): number => {
  const s = a.slice().sort((x, y) => x - y);
  return s[s.length >> 1] ?? 0;
};

export interface ShapeScan {
  shape: SheetShape | undefined;
  /** Komunikat dla użytkownika. */
  note: string;
  /** Czy wykryto kształt inny niż prostokąt. */
  found: boolean;
}

/**
 * Wykrywa kształt kartki: kolor tła bierze ze zdjęcia wokół zaznaczonych narożników, a potem
 * wycina z wyprostowanej kartki obszary w kolorze tła połączone z jej brzegiem (wycięcia, zaokrąglenia).
 */
export function detectShape(src: HTMLCanvasElement, quad: Quad, aspect: number): ShapeScan {
  const sw = src.width;
  const sh = src.height;
  const sd = (src.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, sw, sh).data;
  const samples: number[][] = [];
  const take = (x: number, y: number): void => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= sw || yi >= sh || inQuad(quad, xi, yi)) return;
    const i = (yi * sw + xi) * 4;
    samples.push([sd[i], sd[i + 1], sd[i + 2]]);
  };
  const diag = Math.hypot(sw, sh);
  const cx = quad.reduce((s, p) => s + p.x, 0) / 4;
  const cy = quad.reduce((s, p) => s + p.y, 0) / 4;
  for (let e = 0; e < 4; e++) {
    const a = quad[e];
    const b = quad[(e + 1) % 4];
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let nx = (b.y - a.y) / L;
    let ny = -(b.x - a.x) / L;
    if (nx * ((a.x + b.x) / 2 - cx) + ny * ((a.y + b.y) / 2 - cy) < 0) {
      nx = -nx;
      ny = -ny;
    }
    for (const off of [0.035, 0.06, 0.09]) {
      for (let k = 1; k < 30; k++) {
        const t = k / 30;
        take(a.x + (b.x - a.x) * t + nx * off * diag, a.y + (b.y - a.y) * t + ny * off * diag);
      }
    }
  }
  for (let k = 0; k <= 60; k++) {
    const t = k / 60;
    take(t * (sw - 1), 1);
    take(t * (sw - 1), sh - 2);
    take(1, t * (sh - 1));
    take(sw - 2, t * (sh - 1));
  }
  const { w, h } = maskSize(aspect, 480);
  const small = warp(src, quad, w, h);
  const px = (small.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, w, h).data;
  // narożniki obejmują całe zdjęcie (przycięty skan): tłem jest jednolity brzeg samego obrazu
  const scan = samples.length < 24;
  if (scan) {
    for (let x = 0; x < w; x += 2)
      for (const y of [0, 1, h - 2, h - 1])
        samples.push([px[(y * w + x) * 4], px[(y * w + x) * 4 + 1], px[(y * w + x) * 4 + 2]]);
    for (let y = 0; y < h; y += 2)
      for (const x of [0, 1, w - 2, w - 1])
        samples.push([px[(y * w + x) * 4], px[(y * w + x) * 4 + 1], px[(y * w + x) * 4 + 2]]);
  }
  const bg = [0, 1, 2].map((k) => median(samples.map((s) => s[k])));
  const spread = median(samples.map((s) => Math.hypot(s[0] - bg[0], s[1] - bg[1], s[2] - bg[2])));
  if (scan && spread > 26) {
    return {
      shape: undefined,
      found: false,
      note: 'Wokół kartki nie widać jednolitego tła — kliknij tło różdżką albo wytnij kształt ręcznie.',
    };
  }
  const tol = clamp(spread * 2.5 + 22, 26, 72);
  const center: number[][] = [];
  for (let y = Math.round(h * 0.3); y < h * 0.7; y += 6)
    for (let x = Math.round(w * 0.3); x < w * 0.7; x += 6)
      center.push([px[(y * w + x) * 4], px[(y * w + x) * 4 + 1], px[(y * w + x) * 4 + 2]]);
  const pc = [0, 1, 2].map((k) => median(center.map((s) => s[k])));
  if (Math.hypot(pc[0] - bg[0], pc[1] - bg[1], pc[2] - bg[2]) < tol * 1.2) {
    return {
      shape: undefined,
      found: false,
      note: scan
        ? 'Nie znalazłem wycięć — jeśli kartka ma inny kształt, kliknij tło różdżką.'
        : 'Kartka ma kolor podobny do tła — wytnij kształt różdżką albo ręcznie.',
    };
  }
  // tło połączone z brzegiem wyprostowanej kartki
  const flood = new Uint8Array(w * h);
  const stack: number[] = [];
  const seed = (i: number): void => {
    if (!flood[i] && dist3(px, i, bg) <= tol) {
      flood[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop() as number;
    const x = i % w;
    const y = (i / w) | 0;
    for (const [dx, dy] of N4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      seed(yy * w + xx);
    }
  }
  const cut = opening(flood, w, h, Math.max(2, Math.min(w, h) * 0.012));
  let n = 0;
  for (let i = 0; i < cut.length; i++) n += cut[i];
  if (n < w * h * 0.003)
    return {
      shape: undefined,
      found: false,
      note: 'Kartka jest prostokątna — nie znalazłem wycięć.',
    };
  const m: Mask = { w, h, d: new Uint8Array(w * h) };
  for (let i = 0; i < m.d.length; i++) m.d[i] = cut[i] ? 0 : 1;
  const shape = traceShape(m);
  if (shape === null)
    return {
      shape: undefined,
      found: false,
      note: 'Nie udało się wykryć kształtu — tło jest zbyt podobne do kartki.',
    };
  if (!shape)
    return {
      shape: undefined,
      found: false,
      note: 'Kartka jest prostokątna — nie znalazłem wycięć.',
    };
  return {
    shape,
    found: true,
    note: `Wykryłem kształt kartki (${shape.outline.length} ${plural(shape.outline.length, 'punkt', 'punkty', 'punktów')} obrysu${shape.holes ? `, otwory: ${shape.holes.length}` : ''}).`,
  };
}

/** Upraszcza obrys i otwory (eps we współrzędnych kartki); punkty na krawędziach kartki zostają. */
export function simplifyShape(s: SheetShape, eps: number): SheetShape {
  const one = (r: ShapePt[]): ShapePt[] => {
    const out = simplifyClosed(
      r.map((p) => [p[0], p[1]] as [number, number]),
      eps,
    ) as ShapePt[];
    return out.length >= 3 ? out : r;
  };
  const holes = (s.holes ?? []).map(one);
  return holes.length ? { outline: one(s.outline), holes } : { outline: one(s.outline) };
}

/** Prostokąt z zaokrąglonymi rogami; promień w ułamku krótszego boku (kartka w×h cm). */
export function roundedRect(wcm: number, hcm: number, rcm: number): SheetShape | undefined {
  const r = clamp(rcm, 0, Math.min(wcm, hcm) / 2);
  if (r < 0.05) return undefined;
  const rx = r / wcm;
  const ry = r / hcm;
  const out: ShapePt[] = [];
  const seg = 10;
  const corners: [number, number, number][] = [
    [1 - rx, ry, -Math.PI / 2],
    [1 - rx, 1 - ry, 0],
    [rx, 1 - ry, Math.PI / 2],
    [rx, ry, Math.PI],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let k = 0; k <= seg; k++) {
      const a = a0 + (k / seg) * (Math.PI / 2);
      out.push([
        Math.round((cx + Math.cos(a) * rx) * 10000) / 10000,
        Math.round((cy + Math.sin(a) * ry) * 10000) / 10000,
      ]);
    }
  }
  return { outline: out };
}

// ─────────────────────────────────────────────── kartka na jednolitym tle

type P2 = [number, number];

function hull(pts: P2[]): P2[] {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: P2, a: P2, b: P2): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: P2[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up: P2[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

const triArea = (a: P2, b: P2, c: P2): number =>
  Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
const polyArea = (r: P2[]): number => {
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(s) / 2;
};

/**
 * Przedmiot (kartka, plansza) sfotografowany na jednolitym tle: zwraca czworokąt opisany na jego
 * sylwetce — narożniki do wyprostowania. `null`, gdy tło nie jest jednolite albo to zwykły skan.
 */
export function findOnPlainBackground(src: HTMLCanvasElement): Quad | null {
  const k = Math.min(1, 600 / Math.max(src.width, src.height));
  const w = Math.max(8, Math.round(src.width * k));
  const h = Math.max(8, Math.round(src.height * k));
  const px = pixelsAt(src, w, h);
  const border: number[][] = [];
  for (let x = 0; x < w; x++)
    for (const y of [0, 1, h - 2, h - 1])
      border.push([px[(y * w + x) * 4], px[(y * w + x) * 4 + 1], px[(y * w + x) * 4 + 2]]);
  for (let y = 0; y < h; y++)
    for (const x of [0, 1, w - 2, w - 1])
      border.push([px[(y * w + x) * 4], px[(y * w + x) * 4 + 1], px[(y * w + x) * 4 + 2]]);
  const bg = [0, 1, 2].map((c) => median(border.map((s) => s[c])));
  const spread = median(border.map((s) => Math.hypot(s[0] - bg[0], s[1] - bg[1], s[2] - bg[2])));
  if (spread > 22) return null;
  const tol = clamp(spread * 2.5 + 22, 26, 60);
  const flood = new Uint8Array(w * h);
  const stack: number[] = [];
  const seed = (i: number): void => {
    if (!flood[i] && dist3(px, i, bg) <= tol) {
      flood[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop() as number;
    const x = i % w;
    const y = (i / w) | 0;
    for (const [dx, dy] of N4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < w && yy < h) seed(yy * w + xx);
    }
  }
  const obj = new Uint8Array(w * h);
  for (let i = 0; i < obj.length; i++) obj[i] = flood[i] ? 0 : 1;
  const comp = components(obj, w, h, 1);
  if (!comp.sizes.length) return null;
  const main = comp.sizes.indexOf(Math.max(...comp.sizes));
  const area = comp.sizes[main];
  if (area < w * h * 0.12 || area > w * h * 0.93) return null;
  // przedmiot ma być „pełny”: zwykły skan białej kartki z tabelą ma w środku głównie kolor tła
  let bgLike = 0;
  const edge: P2[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (comp.lab[i] !== main) continue;
      if (dist3(px, i, bg) <= tol) bgLike++;
      if (
        x === 0 ||
        y === 0 ||
        x === w - 1 ||
        y === h - 1 ||
        comp.lab[i - 1] !== main ||
        comp.lab[i + 1] !== main ||
        comp.lab[i - w] !== main ||
        comp.lab[i + w] !== main
      )
        edge.push([x + 0.5, y + 0.5]);
    }
  }
  if (bgLike / area > 0.35) return null;
  // czworokąt wpisany w otoczkę wypukłą: usuwa wierzchołki, których brak najmniej zmniejsza pole
  const H = hull(edge);
  if (H.length < 4) return null;
  const q = H.slice();
  while (q.length > 4) {
    let bi = 0;
    let best = Infinity;
    for (let i = 0; i < q.length; i++) {
      const a = triArea(q[(i + q.length - 1) % q.length], q[i], q[(i + 1) % q.length]);
      if (a < best) {
        best = a;
        bi = i;
      }
    }
    q.splice(bi, 1);
  }
  if (polyArea(q) < polyArea(H) * 0.82) return null;
  // kolejność: lewy górny, prawy górny, prawy dolny, lewy dolny
  const cx = q.reduce((s, p) => s + p[0], 0) / 4;
  const cy = q.reduce((s, p) => s + p[1], 0) / 4;
  q.sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  let start = 0;
  for (let i = 1; i < 4; i++) if (q[i][0] + q[i][1] < q[start][0] + q[start][1]) start = i;
  const ord = [0, 1, 2, 3].map((i) => q[(start + i) % 4]);
  return ord.map(([x, y]) => ({
    x: clamp(x / k, 0, src.width),
    y: clamp(y / k, 0, src.height),
  })) as Quad;
}
