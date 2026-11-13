// Kształt kartki inny niż prostokąt: obrys (wielokąt) i otwory, we współrzędnych kartki 0…1
// (x w prawo, y w dół od górnej krawędzi). Maska rastrowa służy fizyce, trafieniom i teksturom.

import * as THREE from 'three';
import { clamp } from './util';

export type ShapePt = [number, number];

export interface SheetShape {
  /** Obrys kartki (co najmniej 3 punkty). */
  outline: ShapePt[];
  /** Otwory wewnątrz kartki (np. dziurki). */
  holes?: ShapePt[][];
}

const ring = (v: unknown): ShapePt[] | null => {
  if (!Array.isArray(v)) return null;
  const pts: ShapePt[] = [];
  for (const p of v) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const x = Number(p[0]);
    const y = Number(p[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    pts.push([clamp(x, 0, 1), clamp(y, 0, 1)]);
  }
  return pts.length >= 3 && Math.abs(ringArea(pts)) > 1e-4 ? pts : null;
};

/** Pole wielokąta ze znakiem (we współrzędnych kartki). */
export function ringArea(r: ShapePt[]): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return a / 2;
}

/** Sprawdza i porządkuje kształt z pliku notesu; `undefined` oznacza zwykły prostokąt. */
export function normalizeShape(raw: unknown): SheetShape | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Partial<SheetShape>;
  const outline = ring(r.outline);
  if (!outline) return undefined;
  const holes = (Array.isArray(r.holes) ? r.holes : [])
    .map(ring)
    .filter((h): h is ShapePt[] => !!h);
  return holes.length ? { outline, holes } : { outline };
}

/** Rysuje kształt jako ścieżkę (w pikselach w×h); wypełniać regułą "evenodd". */
export function shapePath(
  g: CanvasRenderingContext2D | Path2D,
  s: SheetShape,
  w: number,
  h: number,
): void {
  for (const r of [s.outline, ...(s.holes ?? [])]) {
    r.forEach(([x, y], i) => (i ? g.lineTo(x * w, y * h) : g.moveTo(x * w, y * h)));
    g.closePath();
  }
}

/** Ścieżka SVG kształtu (w pikselach w×h). */
export function shapeSvgPath(s: SheetShape, w: number, h: number): string {
  return [s.outline, ...(s.holes ?? [])]
    .map(
      (r) =>
        r
          .map(([x, y], i) => `${i ? 'L' : 'M'}${(x * w).toFixed(1)} ${(y * h).toFixed(1)}`)
          .join('') + 'Z',
    )
    .join('');
}

/**
 * Maska kartki: `inside` (czy w danym miejscu jest papier), `coverage` (ile papieru w prostokącie)
 * i `edgeDist` (odległość od brzegu kartki, z pominięciem górnej krawędzi pod taśmą).
 */
export class ShapeMask {
  readonly w: number;
  readonly h: number;
  /** 1 = papier */
  readonly data: Uint8Array;
  /** Biała kartka na czarnym tle — źródło tekstur przezroczystości. */
  readonly canvas: HTMLCanvasElement;
  private dist: Float32Array | null = null;

  /** `glue`: krawędź kartki przyklejona do grzbietu (od niej nie łapie się kartki). */
  constructor(
    readonly shape: SheetShape,
    aspect: number,
    long = 1024,
    readonly glue: 'top' | 'left' = 'top',
  ) {
    this.w = Math.max(8, Math.round(aspect >= 1 ? long : long * aspect));
    this.h = Math.max(8, Math.round(aspect >= 1 ? long / aspect : long));
    const c = document.createElement('canvas');
    c.width = this.w;
    c.height = this.h;
    const g = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    g.fillStyle = '#000';
    g.fillRect(0, 0, this.w, this.h);
    g.fillStyle = '#fff';
    g.beginPath();
    shapePath(g, shape, this.w, this.h);
    g.fill('evenodd');
    this.canvas = c;
    const px = g.getImageData(0, 0, this.w, this.h).data;
    this.data = new Uint8Array(this.w * this.h);
    for (let i = 0; i < this.data.length; i++) this.data[i] = px[i * 4 + 1] >= 128 ? 1 : 0;
  }

  inside(u: number, y: number): boolean {
    if (u < 0 || u > 1 || y < 0 || y > 1) return false;
    const x = Math.min(this.w - 1, Math.floor(u * this.w));
    const yy = Math.min(this.h - 1, Math.floor(y * this.h));
    return this.data[yy * this.w + x] === 1;
  }

  /** Ułamek papieru w prostokącie [u0,u1]×[y0,y1]. */
  coverage(u0: number, y0: number, u1: number, y1: number): number {
    const x0 = clamp(Math.floor(u0 * this.w), 0, this.w - 1);
    const x1 = clamp(Math.ceil(u1 * this.w), x0 + 1, this.w);
    const ya = clamp(Math.floor(y0 * this.h), 0, this.h - 1);
    const yb = clamp(Math.ceil(y1 * this.h), ya + 1, this.h);
    const sx = Math.max(1, Math.floor((x1 - x0) / 12));
    const sy = Math.max(1, Math.floor((yb - ya) / 12));
    let n = 0;
    let on = 0;
    for (let y = ya; y < yb; y += sy) {
      for (let x = x0; x < x1; x += sx) {
        n++;
        on += this.data[y * this.w + x];
      }
    }
    return n ? on / n : 0;
  }

  /** Odległość punktu od brzegu kartki w ułamku szerokości (górna krawędź się nie liczy). */
  edgeDist(u: number, y: number): number {
    if (!this.dist) this.dist = this.distanceField();
    const x = clamp(Math.floor(u * this.w), 0, this.w - 1);
    const yy = clamp(Math.floor(y * this.h), 0, this.h - 1);
    return this.dist[yy * this.w + x] / this.w;
  }

  /** Nowa tekstura maski (właściciel ją zwalnia). */
  texture(): THREE.CanvasTexture {
    const t = new THREE.CanvasTexture(this.canvas);
    t.anisotropy = 4;
    return t;
  }

  /** Przybliżona odległość (w pikselach) do najbliższego miejsca bez papieru; dwa przebiegi 3-4. */
  private distanceField(): Float32Array {
    const { w, h, data } = this;
    const INF = 1e9;
    const d = new Float32Array(w * h);
    for (let i = 0; i < d.length; i++) d[i] = data[i] ? INF : 0;
    const A = 1;
    const B = Math.SQRT2;
    // poza kartką jest „brzeg” — z wyjątkiem krawędzi pod taśmą (u góry albo z lewej)
    const left = this.glue === 'left';
    const at = (x: number, y: number): number =>
      left
        ? y < 0 || y >= h || x >= w
          ? 0
          : x < 0
            ? INF
            : d[y * w + x]
        : x < 0 || x >= w || y >= h
          ? 0
          : y < 0
            ? INF
            : d[y * w + x];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!d[i]) continue;
        d[i] = Math.min(
          d[i],
          at(x - 1, y) + A,
          at(x, y - 1) + A,
          at(x - 1, y - 1) + B,
          at(x + 1, y - 1) + B,
        );
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        if (!d[i]) continue;
        d[i] = Math.min(
          d[i],
          at(x + 1, y) + A,
          at(x, y + 1) + A,
          at(x + 1, y + 1) + B,
          at(x - 1, y + 1) + B,
        );
      }
    }
    return d;
  }
}

/** Zapytania o papier we współrzędnych fizycznej kartki (taśma zawsze u góry). */
export interface SheetArea {
  inside(u: number, y: number): boolean;
  coverage(u0: number, y0: number, u1: number, y1: number): number;
  /** Odległość od brzegu w ułamku szerokości fizycznej kartki. */
  edgeDist(u: number, y: number): number;
}

/**
 * Maska w układzie fizycznym. Notes klejony z lewej leży w scenie obrócony: fizyczna góra (taśma) to
 * lewa krawędź treści, więc punkt fizyczny (u, y) to punkt treści (y, 1 − u).
 */
export function physArea(m: ShapeMask, rot: boolean): SheetArea {
  if (!rot) return m;
  const k = m.w / m.h;
  return {
    inside: (u, y) => m.inside(y, 1 - u),
    coverage: (u0, y0, u1, y1) => m.coverage(y0, 1 - u1, y1, 1 - u0),
    edgeDist: (u, y) => m.edgeDist(y, 1 - u) * k,
  };
}
