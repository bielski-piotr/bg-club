// Wspólne stałe i narzędzia.

import type * as THREE from 'three';

export const UNIT = 0.24; // jednostki sceny na centymetr (kartka 10 cm = 2.4)
export const CARDBOARD = 0.03;
export const SHEET_T = 0.0042;
export const LIFT_EPS = 0.0025;

export const INK = 'rgba(24, 42, 128, 0.95)';
export const HAND = "'Caveat', 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive";
export const PRINT_DISPLAY = "'Alegreya SC', 'Palatino Linotype', Georgia, serif";
export const PRINT_TEXT = "'Archivo Narrow', 'Arial Narrow', 'Roboto Condensed', Arial, sans-serif";

export interface Ink {
  seed: number;
  t: number;
}

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (t: number): number => t * t * (3 - 2 * t);
export const easeInOut = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const newSeed = (): number => (Math.random() * 2147483647) | 0;
export const inkNow = (delay = 0): Ink => ({ seed: newSeed(), t: performance.now() + delay });
export const inkDone = (): Ink => ({ seed: newSeed(), t: -1e9 });
export const uid = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function range(a: number, b: number, step = 1): number[] {
  const out: number[] = [];
  if (!step || !isFinite(step)) return [a];
  if (step > 0) for (let v = a; v <= b + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  else for (let v = a; v >= b - 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out.slice(0, 400);
}

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return [c, c.getContext('2d', { willReadFrequently: false }) as CanvasRenderingContext2D];
}

export function hexToRgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function line(
  g: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
}

export function spacing(g: CanvasRenderingContext2D, v: string): void {
  if ('letterSpacing' in g) (g as unknown as { letterSpacing: string }).letterSpacing = v;
}

export const fmtDate = (d: Date): string =>
  `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
export const fmtTime = (d: Date): string =>
  `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;

export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const d = n % 10;
  const h = n % 100;
  return d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many;
}

export function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  html?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

/** Notes klejony z lewej: tekstura treści obrócona tak, by na fizycznej kartce (taśma u góry) leżała bokiem. */
export function rotateContent(tex: THREE.Texture | null | undefined, rot: boolean): void {
  if (!tex || !rot) return;
  tex.center.set(0.5, 0.5);
  tex.rotation = -Math.PI / 2;
}
