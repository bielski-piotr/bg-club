// Pismo „długopisem”: cyfry, imiona, skreślenia i zakreślenia.

import type { Cell, Entry } from './templates';
import type { Ink } from './util';
import { HAND, INK, clamp, easeInOut, lerp, mulberry32 } from './util';

/** Bieżący styl długopisu (ustawiany przed malowaniem każdej kartki). */
export const inkStyle = { color: INK, speed: 1, size: 1 };

export function setInkStyle(hex: string, speed: number, size: number): void {
  const n = parseInt(hex.slice(1), 16);
  inkStyle.color = Number.isFinite(n)
    ? `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.95)`
    : INK;
  inkStyle.speed = Math.max(0.05, speed);
  inkStyle.size = size;
}

export function hand(
  g: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  size: number,
  ink: Ink,
  now: number,
  opt: { weight?: number; maxW?: number } = {},
): boolean {
  const r = mulberry32(ink.seed);
  const dur = (150 + 105 * text.length) / inkStyle.speed;
  const p = (now - ink.t) / dur;
  if (p <= 0) return true;
  const prog = Math.min(1, p);
  const rot = (r() - 0.5) * 0.09;
  const ox = (r() - 0.5) * size * 0.18;
  const oy = (r() - 0.5) * size * 0.1;
  const sc = 0.93 + r() * 0.13;
  const fs = size * sc;
  g.save();
  g.translate(cx + ox, cy + oy);
  g.rotate(rot);
  g.font = `${opt.weight ?? 600} ${fs.toFixed(1)}px ${HAND}`;
  let w = g.measureText(text).width;
  if (opt.maxW && w > opt.maxW) {
    const k = opt.maxW / w;
    g.scale(k, k);
  }
  w += 2;
  if (prog < 1) {
    g.beginPath();
    g.rect(-w / 2 - 6, -fs, (w + 12) * easeInOut(prog), fs * 2);
    g.clip();
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = inkStyle.color;
  g.fillText(text, 0, fs * 0.05);
  g.globalAlpha = 0.28;
  g.fillText(text, Math.max(0.6, fs * 0.018), fs * 0.05 + Math.max(0.5, fs * 0.014));
  g.restore();
  return prog < 1;
}

export function wobbly(
  r: () => number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  bow: number,
  n = 12,
): number[] {
  const pts: number[] = [];
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const b = (r() - 0.5) * 2 * bow;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const off = Math.sin(t * Math.PI) * b + (r() - 0.5) * bow * 0.3;
    pts.push(x0 + dx * t + nx * off, y0 + dy * t + ny * off);
  }
  return pts;
}

export function wobblyEllipse(
  r: () => number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  n = 52,
): number[] {
  const pts: number[] = [];
  const a0 = -Math.PI * 0.62 + (r() - 0.5) * 0.5;
  const turns = 1.12 + r() * 0.08;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const a = a0 + t * turns * Math.PI * 2;
    const grow = 1 + (t - 0.5) * 0.1;
    const j = 1 + (r() - 0.5) * 0.03;
    pts.push(cx + Math.cos(a) * rx * grow * j, cy + Math.sin(a) * ry * grow * j);
  }
  return pts;
}

export function penStroke(
  g: CanvasRenderingContext2D,
  pts: number[],
  prog: number,
  width: number,
): void {
  if (prog <= 0) return;
  const n = pts.length / 2;
  const upto = clamp(prog, 0, 1) * (n - 1);
  const whole = Math.floor(upto);
  g.save();
  g.strokeStyle = inkStyle.color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let k = 1; k <= whole; k++) g.lineTo(pts[k * 2], pts[k * 2 + 1]);
  const f = upto - whole;
  if (f > 0 && whole < n - 1)
    g.lineTo(
      lerp(pts[whole * 2], pts[whole * 2 + 2], f),
      lerp(pts[whole * 2 + 1], pts[whole * 2 + 3], f),
    );
  g.stroke();
  g.restore();
}

function drawCross(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  ink: Ink,
  now: number,
  pen: number,
): boolean {
  const p = (now - ink.t) / (420 / inkStyle.speed);
  if (p <= 0) return true;
  const r = mulberry32(ink.seed);
  const a = wobbly(r, cx - s * 1.1, cy - s * 0.75, cx + s * 1.05, cy + s * 0.8, s * 0.14);
  const b = wobbly(r, cx + s * 1.0, cy - s * 0.85, cx - s * 1.05, cy + s * 0.78, s * 0.14);
  penStroke(g, a, p * 2, pen * 1.06);
  if (p > 0.5) penStroke(g, b, p * 2 - 1, pen * 1.06);
  return p < 1;
}

function drawStrike(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  ink: Ink,
  now: number,
  pen: number,
): boolean {
  const p = (now - ink.t) / (320 / inkStyle.speed);
  if (p <= 0) return true;
  const r = mulberry32(ink.seed);
  const h = w / 2;
  const k1 = pen * 1.4;
  const pts: number[] = [];
  const legs = [
    [-h, k1 * 0.6],
    [h, -k1 * 1.4],
    [-h + k1 * 1.4, k1 * 1.4],
    [h - k1 * 0.6, -k1 * 0.3],
  ];
  for (let k = 0; k < legs.length - 1; k++) {
    const seg = wobbly(
      r,
      cx + legs[k][0],
      cy + legs[k][1],
      cx + legs[k + 1][0],
      cy + legs[k + 1][1],
      pen,
      6,
    );
    pts.push(...(k ? seg.slice(2) : seg));
  }
  penStroke(g, pts, p, pen * 0.9);
  return p < 1;
}

function drawEntry(
  g: CanvasRenderingContext2D,
  e: Entry,
  cx: number,
  cy: number,
  size: number,
  now: number,
  pen: number,
): boolean {
  if (e.scratch) return drawCross(g, cx, cy, size * 0.36, e.ink, now, pen);
  return hand(g, String(e.value), cx, cy, size, e.ink, now);
}

/** Rysuje zawartość pola: aktualny wpis i ewentualny przekreślony poprzedni. */
export function drawCell(
  g: CanvasRenderingContext2D,
  cell: Cell,
  cx: number,
  cy: number,
  size: number,
  colW: number,
  now: number,
  pen: number,
): boolean {
  let anim = false;
  if (cell.old) {
    const ox = cell.cur ? cx - colW * 0.26 : cx;
    const s = cell.cur ? size * 0.62 : size;
    anim = drawEntry(g, cell.old, ox, cy, s, now, pen) || anim;
    if (cell.strike) {
      const w = cell.old.scratch ? s * 0.9 : s * 0.4 * String(cell.old.value).length + s * 0.25;
      anim = drawStrike(g, ox, cy, w, cell.strike, now, pen) || anim;
    }
  }
  if (cell.cur)
    anim = drawEntry(g, cell.cur, cell.old ? cx + colW * 0.13 : cx, cy, size, now, pen) || anim;
  return anim;
}

/** Rozmiar cyfr dopasowany do pola (w pikselach tekstury). */
export function digitSize(w: number, h: number, chars = 2): number {
  return Math.max(
    10,
    Math.min(h * 0.86, (w * 0.8) / Math.max(1.1, chars * 0.5), 150) * inkStyle.size,
  );
}
