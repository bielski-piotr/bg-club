// Obróbka zdjęć kartek: wczytanie, obrót, wykrycie kartki, prostowanie perspektywy,
// wyrównanie oświetlenia i wykrywanie linii siatki.

import { clamp, makeCanvas } from '../core/util';

export type Pt = { x: number; y: number };
export type Quad = [Pt, Pt, Pt, Pt]; // lewy górny, prawy górny, prawy dolny, lewy dolny

/**
 * Dłuższy bok zdjęcia źródłowego i wyprostowanej kartki (EDT-12). Mniejsze zdjęcie nie jest
 * powiększane; to też granica tekstury notesu (PAD-16).
 */
export const MAX_SHEET_SIDE = 4096;
/** Jakość zapisu kartki (EDT-12: co najmniej 0,92). */
export const SHEET_QUALITY = 0.92;
/** Największy plik kartki: limit bucketu `scorepads` to 5 MiB, zostawiamy zapas. */
export const MAX_SHEET_BYTES = 4.5 * 1024 * 1024;

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
  const k = Math.min(1, MAX_SHEET_SIDE / Math.max(src.width, src.height));
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

/**
 * Piksele zdjęcia, pamiętane na czas jednej operacji (wykrywanie czyta je kilka razy). Kopia
 * zdjęcia 4096 px to do 64 MB, więc po operacji zwalnia ją `releasePixels()`.
 */
let pixelCache: { c: HTMLCanvasElement; d: ImageData } | null = null;
export function pixelsOf(c: HTMLCanvasElement): ImageData {
  if (pixelCache?.c !== c)
    pixelCache = {
      c,
      d: (c.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, c.width, c.height),
    };
  return pixelCache.d;
}

export function releasePixels(): void {
  pixelCache = null;
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
  const sd = pixelsOf(src).data;
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

/**
 * Wymiary wyprostowanej kartki (EDT-12): dłuższy bok jak najdłuższy bok obszaru na zdjęciu
 * źródłowym (bez powiększania), najwyżej `MAX_SHEET_SIDE`; proporcje z rozmiaru w centymetrach.
 */
export function sheetSize(q: Quad, aspect: number): { w: number; h: number } {
  const d = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
  const side = Math.max(d(q[0], q[1]), d(q[1], q[2]), d(q[2], q[3]), d(q[3], q[0]));
  const long = Math.max(16, Math.min(MAX_SHEET_SIDE, Math.round(side)));
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  return a <= 1
    ? { w: Math.max(8, Math.round(long * a)), h: long }
    : { w: long, h: Math.max(8, Math.round(long / a)) };
}

let webp: boolean | null = null;
/**
 * Czy przeglądarka koduje WebP (sprawdzane raz, na płótnie 1×1). Bez tego `toDataURL` zwraca
 * PNG, którego kodowanie przy kartce 4096 px trwa długo.
 */
export function webpEncoding(): boolean {
  if (webp === null) {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    try {
      webp = c.toDataURL('image/webp').startsWith('data:image/webp');
    } catch {
      webp = false;
    }
  }
  return webp;
}

/** Tylko testy: ponowne sprawdzenie kodowania WebP. */
export function resetWebpProbe(): void {
  webp = null;
}

/** Bajty pliku zapisanego w data URL (base64). */
export function dataUrlBytes(url: string): number {
  const i = url.indexOf(',');
  const b64 = url.length - i - 1;
  const pad = url.endsWith('==') ? 2 : url.endsWith('=') ? 1 : 0;
  return Math.floor((b64 * 3) / 4) - pad;
}

/**
 * Zapis kartki do notesu (EDT-12): WebP (gdy przeglądarka go koduje) albo JPEG o jakości 0,92.
 * Plik większy niż limit Storage zmniejszamy (o 15% na krok), a nie obniżamy jakości.
 */
export function encodeSheet(c: HTMLCanvasElement, maxBytes = MAX_SHEET_BYTES): string {
  const type = webpEncoding() ? 'image/webp' : 'image/jpeg';
  let cur = c;
  for (let attempt = 0; ; attempt++) {
    const url = cur.toDataURL(type, SHEET_QUALITY);
    if (dataUrlBytes(url) <= maxBytes || attempt >= 6 || Math.max(cur.width, cur.height) < 800)
      return url;
    const [n, g] = makeCanvas(cur.width * 0.85, cur.height * 0.85);
    g.imageSmoothingQuality = 'high';
    g.drawImage(cur, 0, 0, n.width, n.height);
    cur = n;
  }
}
