// Obróbka zdjęć kartek: wczytanie, obrót, wykrycie kartki, prostowanie perspektywy,
// wyrównanie oświetlenia i wykrywanie linii siatki.

import { clamp, makeCanvas } from '../core/util';

export type Pt = { x: number; y: number };
export type Quad = [Pt, Pt, Pt, Pt]; // lewy górny, prawy górny, prawy dolny, lewy dolny

const MAX_SRC = 2400;

export async function canvasFromBlob(file: Blob): Promise<HTMLCanvasElement> {
  let src: CanvasImageSource & { width: number; height: number };
  try {
    src = await createImageBitmap(file);
  } catch {
    const url = URL.createObjectURL(file);
    try {
      src = await new Promise<HTMLImageElement>((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('To nie wygląda na obraz.'));
        im.src = url;
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
  const k = Math.min(1, MAX_SRC / Math.max(src.width, src.height));
  const [c, g] = makeCanvas(src.width * k, src.height * k);
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

export async function canvasFromUrl(url: string): Promise<HTMLCanvasElement> {
  const im = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('Nie udało się wczytać obrazu.'));
    i.src = url;
  });
  const [c, g] = makeCanvas(im.naturalWidth, im.naturalHeight);
  g.drawImage(im, 0, 0);
  return c;
}

export function rotate(src: HTMLCanvasElement, dir: 1 | -1): HTMLCanvasElement {
  const [c, g] = makeCanvas(src.height, src.width);
  g.translate(c.width / 2, c.height / 2);
  g.rotate((dir * Math.PI) / 2);
  g.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

export const fullQuad = (w: number, h: number): Quad => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
];

/** Proporcje prostokąta wyznaczonego narożnikami (szerokość / wysokość). */
export function quadAspect(q: Quad): number {
  const d = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
  const w = (d(q[0], q[1]) + d(q[3], q[2])) / 2;
  const h = (d(q[0], q[3]) + d(q[1], q[2])) / 2;
  return w / Math.max(1, h);
}

/** Homografia kwadratu jednostkowego na czworokąt (Heckbert). */
function homography(q: Quad): number[] {
  const [p0, p1, p2, p3] = q;
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;
  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
    return [p1.x - p0.x, p2.x - p1.x, p0.x, p1.y - p0.y, p2.y - p1.y, p0.y, 0, 0];
  }
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;
  return [
    p1.x - p0.x + g * p1.x,
    p3.x - p0.x + h * p3.x,
    p0.x,
    p1.y - p0.y + g * p1.y,
    p3.y - p0.y + h * p3.y,
    p0.y,
    g,
    h,
  ];
}

/** Przejście między wyprostowaną kartką (u, v ∈ 0…1) a pikselami zdjęcia dla danych narożników. */
export class Persp {
  private f: number[];
  private r: number[];

  constructor(q: Quad) {
    const [a, b, c, d, e, f, g, h] = homography(q);
    this.f = [a, b, c, d, e, f, g, h, 1];
    // odwrotność macierzy 3×3 (dopełnienia algebraiczne)
    const m = this.f;
    const A = m[4] * m[8] - m[5] * m[7];
    const B = m[5] * m[6] - m[3] * m[8];
    const C = m[3] * m[7] - m[4] * m[6];
    const det = m[0] * A + m[1] * B + m[2] * C || 1e-12;
    this.r = [
      A / det,
      (m[2] * m[7] - m[1] * m[8]) / det,
      (m[1] * m[5] - m[2] * m[4]) / det,
      B / det,
      (m[0] * m[8] - m[2] * m[6]) / det,
      (m[2] * m[3] - m[0] * m[5]) / det,
      C / det,
      (m[1] * m[6] - m[0] * m[7]) / det,
      (m[0] * m[4] - m[1] * m[3]) / det,
    ];
  }

  /** Punkt kartki → piksel zdjęcia. */
  toPhoto(u: number, v: number): Pt {
    const m = this.f;
    const w = m[6] * u + m[7] * v + m[8];
    return { x: (m[0] * u + m[1] * v + m[2]) / w, y: (m[3] * u + m[4] * v + m[5]) / w };
  }

  /** Piksel zdjęcia → punkt kartki (poza kartką wychodzi poza 0…1). */
  toSheet(x: number, y: number): { u: number; v: number } {
    const m = this.r;
    const w = m[6] * x + m[7] * y + m[8];
    return { u: (m[0] * x + m[1] * y + m[2]) / w, v: (m[3] * x + m[4] * y + m[5]) / w };
  }
}

/** Obraca narożniki razem ze zdjęciem o 90° (dir 1 = w prawo); zwraca je od nowego lewego górnego. */
export function rotateQuad(q: Quad, w: number, h: number, dir: 1 | -1): Quad {
  const p = q.map((pt) => (dir === 1 ? { x: h - pt.y, y: pt.x } : { x: pt.y, y: w - pt.x }));
  return (dir === 1 ? [p[3], p[0], p[1], p[2]] : [p[1], p[2], p[3], p[0]]) as Quad;
}

/** Prostuje kartkę z czworokąta `q` do prostokąta ow×oh. */
export function warp(src: HTMLCanvasElement, q: Quad, ow: number, oh: number): HTMLCanvasElement {
  const sw = src.width;
  const sh = src.height;
  const sd = (src.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, sw, sh).data;
  const [c, g] = makeCanvas(ow, oh);
  const out = g.createImageData(c.width, c.height);
  const od = out.data;
  const [a, b, cc, d, e, f, gg, hh] = homography(q);
  const W = c.width;
  const Hh = c.height;
  let o = 0;
  for (let y = 0; y < Hh; y++) {
    const v = (y + 0.5) / Hh;
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      const den = gg * u + hh * v + 1;
      let fx = (a * u + b * v + cc) / den - 0.5;
      let fy = (d * u + e * v + f) / den - 0.5;
      fx = clamp(fx, 0, sw - 1.001);
      fy = clamp(fy, 0, sh - 1.001);
      const x0 = fx | 0;
      const y0 = fy | 0;
      const tx = fx - x0;
      const ty = fy - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + sw * 4;
      const i11 = i01 + 4;
      for (let k = 0; k < 3; k++) {
        const top = sd[i00 + k] + (sd[i10 + k] - sd[i00 + k]) * tx;
        const bot = sd[i01 + k] + (sd[i11 + k] - sd[i01 + k]) * tx;
        od[o + k] = top + (bot - top) * ty;
      }
      od[o + 3] = 255;
      o += 4;
    }
  }
  g.putImageData(out, 0, 0);
  return c;
}

/** Szuka jasnej kartki na ciemniejszym tle i zwraca jej narożniki. */
export function detectPaper(src: HTMLCanvasElement): Quad | null {
  const k = 320 / Math.max(src.width, src.height);
  const [c, g] = makeCanvas(src.width * k, src.height * k);
  g.drawImage(src, 0, 0, c.width, c.height);
  const { width: w, height: h } = c;
  const d = g.getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  const sat = new Float32Array(w * h);
  const hist = new Array(256).fill(0);
  for (let i = 0; i < w * h; i++) {
    const r = d[i * 4];
    const gg = d[i * 4 + 1];
    const b = d[i * 4 + 2];
    const mx = Math.max(r, gg, b);
    const mn = Math.min(r, gg, b);
    lum[i] = 0.3 * r + 0.59 * gg + 0.11 * b;
    sat[i] = mx ? (mx - mn) / mx : 0;
    hist[Math.round(lum[i])]++;
  }
  // próg Otsu
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let thr = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = w * h - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      thr = i;
    }
  }
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = lum[i] > thr && sat[i] < 0.42 ? 1 : 0;
  // największy spójny obszar
  const label = new Int32Array(w * h).fill(-1);
  let bestId = -1;
  let bestSize = 0;
  const stack: number[] = [];
  let id = 0;
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || label[s] >= 0) continue;
    let size = 0;
    stack.push(s);
    label[s] = id;
    while (stack.length) {
      const p = stack.pop() as number;
      size++;
      const x = p % w;
      const y = (p / w) | 0;
      const nb = [
        x > 0 ? p - 1 : -1,
        x < w - 1 ? p + 1 : -1,
        y > 0 ? p - w : -1,
        y < h - 1 ? p + w : -1,
      ];
      for (const q of nb) {
        if (q >= 0 && mask[q] && label[q] < 0) {
          label[q] = id;
          stack.push(q);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestId = id;
    }
    id++;
  }
  if (bestSize < w * h * 0.1) return null;
  let tl = { v: Infinity, x: 0, y: 0 };
  let br = { v: -Infinity, x: 0, y: 0 };
  let tr = { v: -Infinity, x: 0, y: 0 };
  let bl = { v: Infinity, x: 0, y: 0 };
  for (let p = 0; p < w * h; p++) {
    if (label[p] !== bestId) continue;
    const x = p % w;
    const y = (p / w) | 0;
    if (x + y < tl.v) tl = { v: x + y, x, y };
    if (x + y > br.v) br = { v: x + y, x, y };
    if (x - y > tr.v) tr = { v: x - y, x, y };
    if (x - y < bl.v) bl = { v: x - y, x, y };
  }
  const s = 1 / k;
  return [
    { x: tl.x * s, y: tl.y * s },
    { x: (tr.x + 1) * s, y: tr.y * s },
    { x: (br.x + 1) * s, y: (br.y + 1) * s },
    { x: bl.x * s, y: (bl.y + 1) * s },
  ];
}

/** Wyrównuje nierówne oświetlenie i wybiela papier (dzielenie przez mapę jasności tła). */
export function flattenPaper(c: HTMLCanvasElement, strength = 1): void {
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const { width: w, height: h } = c;
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const gx = 36;
  const gy = Math.max(8, Math.round((36 * h) / w));
  const bw = w / gx;
  const bh = h / gy;
  const map = new Float32Array(gx * gy * 3);
  const lums: number[] = [];
  for (let by = 0; by < gy; by++) {
    for (let bx = 0; bx < gx; bx++) {
      lums.length = 0;
      const x0 = Math.floor(bx * bw);
      const x1 = Math.floor((bx + 1) * bw);
      const y0 = Math.floor(by * bh);
      const y1 = Math.floor((by + 1) * bh);
      for (let y = y0; y < y1; y += 2)
        for (let x = x0; x < x1; x += 2) {
          const i = (y * w + x) * 4;
          lums.push(0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]);
        }
      lums.sort((a, b) => a - b);
      const thr = lums[Math.floor(lums.length * 0.72)] ?? 0;
      let r = 0;
      let gg = 0;
      let b = 0;
      let n = 0;
      for (let y = y0; y < y1; y += 2)
        for (let x = x0; x < x1; x += 2) {
          const i = (y * w + x) * 4;
          if (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2] >= thr) {
            r += d[i];
            gg += d[i + 1];
            b += d[i + 2];
            n++;
          }
        }
      const m = (by * gx + bx) * 3;
      map[m] = r / Math.max(1, n);
      map[m + 1] = gg / Math.max(1, n);
      map[m + 2] = b / Math.max(1, n);
    }
  }
  // maksimum z sąsiadów (bloki zalane drukiem), potem rozmycie
  const pass = (src: Float32Array, fn: (vals: number[]) => number): Float32Array => {
    const out = new Float32Array(src.length);
    for (let y = 0; y < gy; y++)
      for (let x = 0; x < gx; x++)
        for (let k = 0; k < 3; k++) {
          const vals: number[] = [];
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const xx = clamp(x + dx, 0, gx - 1);
              const yy = clamp(y + dy, 0, gy - 1);
              vals.push(src[(yy * gx + xx) * 3 + k]);
            }
          out[(y * gx + x) * 3 + k] = fn(vals);
        }
    return out;
  };
  let m2 = pass(map, (v) => Math.max(...v));
  m2 = pass(m2, (v) => v.reduce((a, b) => a + b, 0) / v.length);
  m2 = pass(m2, (v) => v.reduce((a, b) => a + b, 0) / v.length);
  const target = 247;
  for (let y = 0; y < h; y++) {
    const fy = clamp(y / bh - 0.5, 0, gy - 1.001);
    const y0 = fy | 0;
    const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = clamp(x / bw - 0.5, 0, gx - 1.001);
      const x0 = fx | 0;
      const tx = fx - x0;
      const i = (y * w + x) * 4;
      for (let k = 0; k < 3; k++) {
        const a = m2[(y0 * gx + x0) * 3 + k];
        const b = m2[(y0 * gx + x0 + 1) * 3 + k];
        const c2 = m2[((y0 + 1) * gx + x0) * 3 + k];
        const e = m2[((y0 + 1) * gx + x0 + 1) * 3 + k];
        const L = Math.max(30, (a + (b - a) * tx) * (1 - ty) + (c2 + (e - c2) * tx) * ty);
        let v = (d[i + k] / L) * target;
        v = 255 - (255 - v) * 1.08;
        d[i + k] = clamp(d[i + k] + (v - d[i + k]) * strength, 0, 255);
      }
    }
  }
  g.putImageData(img, 0, 0);
}

export interface LineScan {
  xs: number[];
  ys: number[];
  /** Pasy między liniami ys, których nie przecinają linie pionowe (np. „Tiebreaker”). */
  openRows: number[];
  /** Pasy między liniami xs, których nie przecinają linie poziome. */
  openCols: number[];
}

/**
 * Szuka linii tabeli w ramce (współrzędne 0…1). Linia to długi, prawie ciągły ciemny odcinek
 * (tekst ma przerwy między literami). Próg ciemności jest lokalny, więc działa też na tle
 * z akwarelą albo przy nierównym świetle. Dokłada też brzegi wierszy i kolumn, które
 * nie mają własnej linii (otwarty nagłówek, ostatni wiersz bez dolnej krawędzi).
 */
export function detectLines(
  c: HTMLCanvasElement,
  fr: { x0: number; y0: number; x1: number; y1: number },
): LineScan {
  const k = Math.min(1, 900 / Math.max(c.width, c.height));
  const [sc, g] = makeCanvas(c.width * k, c.height * k);
  g.drawImage(c, 0, 0, sc.width, sc.height);
  const { width: w, height: h } = sc;
  const d = g.getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++)
    lum[i] = 0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2];
  // lokalna średnia jasności (obraz całkowy)
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += lum[y * w + x];
      I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row;
    }
  }
  const r = Math.max(6, Math.round(Math.min(w, h) / 40));
  const dark = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - r);
    const yb = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const xa = Math.max(0, x - r);
      const xb = Math.min(w, x + r + 1);
      const sum =
        I[yb * (w + 1) + xb] - I[ya * (w + 1) + xb] - I[yb * (w + 1) + xa] + I[ya * (w + 1) + xa];
      const mean = sum / ((xb - xa) * (yb - ya));
      // ciemniejsze od otoczenia o wyraźną różnicę — działa też dla jasnych, cienkich linii na akwareli
      dark[y * w + x] = mean - lum[y * w + x] > Math.max(10, mean * 0.065) ? 1 : 0;
    }
  }
  const at = (horiz: boolean, a: number, b: number): number => {
    // piksel linii (z sąsiednim, bo linia bywa na granicy pikseli)
    if (horiz) return dark[a * w + b] || (a + 1 < h && dark[(a + 1) * w + b]) ? 1 : 0;
    return dark[b * w + a] || (a + 1 < w && dark[b * w + a + 1]) ? 1 : 0;
  };
  const gapTol = Math.max(2, Math.round(Math.max(w, h) * 0.004));

  interface Found {
    pos: number;
    start: number;
    end: number;
  }
  const scan = (horiz: boolean, a0: number, a1: number, b0: number, b1: number): Found[] => {
    const prof: { v: number; s: number; e: number }[] = [];
    for (let a = a0; a < a1; a++) {
      let best = 0;
      let bs = 0;
      let cur = 0;
      let cs = 0;
      let gap = 0;
      for (let b = b0; b < b1; b++) {
        if (at(horiz, a, b)) {
          if (!cur) cs = b;
          cur += 1 + gap;
          gap = 0;
          if (cur > best) {
            best = cur;
            bs = cs;
          }
        } else if (cur && gap < gapTol) gap++;
        else {
          cur = 0;
          gap = 0;
        }
      }
      prof.push({ v: best / Math.max(1, b1 - b0), s: bs, e: bs + best });
    }
    const mx = Math.max(0, ...prof.map((p) => p.v));
    const thr = Math.max(0.25, mx * 0.55);
    const out: Found[] = [];
    const size = horiz ? h : w;
    let i = 0;
    while (i < prof.length) {
      if (prof[i].v >= thr) {
        let j = i;
        let ws = 0;
        let pos = 0;
        let st = Infinity;
        let en = 0;
        while (j < prof.length && prof[j].v >= thr * 0.7) {
          ws += prof[j].v;
          pos += (a0 + j) * prof[j].v;
          st = Math.min(st, prof[j].s);
          en = Math.max(en, prof[j].e);
          j++;
        }
        const c2 = pos / ws + 0.5;
        if (!out.length || c2 - out[out.length - 1].pos > size * 0.012)
          out.push({ pos: c2, start: st, end: en });
        i = j;
      } else i++;
    }
    return out;
  };
  /** Pełny zasięg linii z przerwami (odcinki krótsze niż 3% pomijamy — to litery). */
  const extent = (horiz: boolean, pos: number, b0: number, b1: number): [number, number] => {
    const a = Math.round(pos - 0.5);
    const minSeg = (horiz ? w : h) * 0.03;
    let first = -1;
    let last = -1;
    let cur = 0;
    let cs = 0;
    let gap = 0;
    for (let b = b0; b <= b1; b++) {
      const on = b < b1 && (at(horiz, a, b) || at(horiz, a - 1, b));
      if (on) {
        if (!cur) cs = b;
        cur += 1 + gap;
        gap = 0;
      } else if (cur && gap < gapTol) gap++;
      else {
        if (cur >= minSeg) {
          if (first < 0) first = cs;
          last = cs + cur;
        }
        cur = 0;
        gap = 0;
      }
    }
    return first < 0 ? [b0, b0] : [first, last];
  };
  const X0 = Math.floor(fr.x0 * w);
  const X1 = Math.ceil(fr.x1 * w);
  const Y0 = Math.floor(fr.y0 * h);
  const Y1 = Math.ceil(fr.y1 * h);
  const H0 = scan(true, Y0, Y1, X0, X1);
  const V0 = scan(false, X0, X1, Y0, Y1);
  let ys = H0.map((f) => f.pos);
  let xs = V0.map((f) => f.pos);
  if (ys.length < 2 || xs.length < 2)
    return { xs: xs.map((v) => v / w), ys: ys.map((v) => v / h), openRows: [], openCols: [] };

  const med = (a: number[]): number => {
    const b = [...a].sort((p, q) => p - q);
    return b[b.length >> 1];
  };
  const vExt = xs.map((x) => extent(false, x, Y0, Y1));
  const hExt = ys.map((y) => extent(true, y, X0, X1));
  const top = med(vExt.map((e) => e[0]));
  const bot = med(vExt.map((e) => e[1]));
  const left = med(hExt.map((e) => e[0]));
  const right = med(hExt.map((e) => e[1]));
  const rowH = med(ys.slice(1).map((y, i) => y - ys[i]));
  const colW = med(xs.slice(1).map((x, i) => x - xs[i]));
  if (ys[0] - top > rowH * 0.4) ys = [top, ...ys];
  if (bot - ys[ys.length - 1] > rowH * 0.4) ys = [...ys, bot];
  if (xs[0] - left > colW * 0.4) xs = [left, ...xs];
  if (right - xs[xs.length - 1] > colW * 0.4) xs = [...xs, right];

  // pasy, których nie przecinają linie drugiego kierunku → miejsca bez wpisu
  const crossing = (horizBand: boolean, a: number, b: number, lines: number[]): number => {
    const inner = lines.slice(1, -1);
    if (!inner.length) return 1;
    const m = Math.max(2, Math.round((b - a) * 0.2));
    const cover = inner.map((l) => {
      let on = 0;
      let n = 0;
      for (let q = Math.ceil(a + m); q < b - m; q++) {
        n++;
        const L = Math.round(l - 0.5);
        if (
          horizBand ? at(false, L, q) || at(false, L - 1, q) : at(true, L, q) || at(true, L - 1, q)
        )
          on++;
      }
      return n ? on / n : 1;
    });
    return med(cover);
  };
  const openRows: number[] = [];
  for (let i = 0; i < ys.length - 1; i++)
    if (crossing(true, ys[i], ys[i + 1], xs) < 0.3) openRows.push(i);
  const openCols: number[] = [];
  for (let i = 0; i < xs.length - 1; i++)
    if (crossing(false, xs[i], xs[i + 1], ys) < 0.3) openCols.push(i);
  return { xs: xs.map((v) => v / w), ys: ys.map((v) => v / h), openRows, openCols };
}

/** Czy obraz to już przycięta kartka (brzeg jasny jak papier), a nie zdjęcie kartki na tle. */
export function looksCropped(src: HTMLCanvasElement): boolean {
  const k = 160 / Math.max(src.width, src.height);
  const [c, g] = makeCanvas(src.width * k, src.height * k);
  g.drawImage(src, 0, 0, c.width, c.height);
  const { width: w, height: h } = c;
  const d = g.getImageData(0, 0, w, h).data;
  const L = (x: number, y: number): number => {
    const i = (y * w + x) * 4;
    return 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
  };
  const center: number[] = [];
  for (let y = Math.floor(h * 0.25); y < h * 0.75; y++)
    for (let x = Math.floor(w * 0.25); x < w * 0.75; x++) center.push(L(x, y));
  center.sort((a, b) => a - b);
  const paper = center[Math.floor(center.length * 0.8)] ?? 255;
  const ring = Math.max(2, Math.round(Math.min(w, h) * 0.04));
  let bright = 0;
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= ring && x < w - ring && y >= ring && y < h - ring) continue;
      n++;
      if (L(x, y) > paper * 0.78) bright++;
    }
  }
  return n > 0 && bright / n > 0.6;
}

export function toJpeg(c: HTMLCanvasElement, q = 0.86): string {
  return c.toDataURL('image/jpeg', q);
}
