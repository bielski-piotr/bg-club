// Papier, nadruk wbudowanych notesów i przygotowanie zdjęć kartek do tekstury.

import type { IconKind, PadTemplate } from './templates';
import { lineCount } from './templates';
import {
  PRINT_DISPLAY,
  PRINT_TEXT,
  hexToRgba,
  line,
  makeCanvas,
  mulberry32,
  roundRect,
  spacing,
} from './util';

let GRAIN: HTMLCanvasElement | null = null;
let SKIP: HTMLCanvasElement | null = null;

export function grain(): HTMLCanvasElement {
  if (GRAIN) return GRAIN;
  const [c, g] = makeCanvas(256, 256);
  const img = g.createImageData(256, 256);
  const r = mulberry32(7);
  for (let i = 0; i < 256 * 256; i++) {
    const v = 255 - Math.pow(r(), 5) * 40 - r() * 4;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v - 1;
    img.data[i * 4 + 2] = v - 4;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.lineCap = 'round';
  for (let k = 0; k < 80; k++) {
    g.strokeStyle = `rgba(118, 100, 76, ${0.035 + r() * 0.055})`;
    g.lineWidth = 0.5 + r() * 0.8;
    const x = 12 + r() * 232;
    const y = 12 + r() * 232;
    const a = r() * Math.PI * 2;
    const l = 5 + r() * 12;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(
      x + Math.cos(a + 0.7) * l * 0.5,
      y + Math.sin(a + 0.7) * l * 0.5,
      x + Math.cos(a) * l,
      y + Math.sin(a) * l,
    );
    g.stroke();
  }
  GRAIN = c;
  return c;
}

export function skipNoise(): HTMLCanvasElement {
  if (SKIP) return SKIP;
  const [c, g] = makeCanvas(128, 128);
  const r = mulberry32(11);
  for (let k = 0; k < 700; k++) {
    g.fillStyle = `rgba(0,0,0,${0.12 + r() * 0.4})`;
    g.fillRect(r() * 128, r() * 128, 0.8 + r() * 1.4, 0.8 + r() * 1.2);
  }
  SKIP = c;
  return c;
}

function applyGrain(g: CanvasRenderingContext2D, w: number, h: number, alpha = 1): void {
  g.save();
  g.globalAlpha = alpha;
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = g.createPattern(grain(), 'repeat') as CanvasPattern;
  g.fillRect(0, 0, w, h);
  g.restore();
}

/** Ślad kleju pod taśmą: u góry kartki albo — w notesie klejonym z boku — przy lewej krawędzi. */
function glueResidue(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  glue: number,
  tape: string,
  left = false,
): void {
  const r = mulberry32(3);
  g.fillStyle = hexToRgba(tape, 0.12);
  if (left) {
    const gp = Math.round(glue * w);
    g.fillRect(0, 0, Math.max(0, gp - 6), h);
    for (let y = 0; y < h; y += 6) g.fillRect(gp - 6, y, r() * 6, 6);
    return;
  }
  const gp = Math.round(glue * h);
  g.fillRect(0, 0, w, Math.max(0, gp - 6));
  for (let x = 0; x < w; x += 6) g.fillRect(x, gp - 6, 6, r() * 6);
}

function paperBase(g: CanvasRenderingContext2D, w: number, h: number, tone = '#f8f6f1'): void {
  g.fillStyle = tone;
  g.fillRect(0, 0, w, h);
  const rg = g.createRadialGradient(w * 0.5, h * 0.45, 80, w * 0.5, h * 0.5, Math.max(w, h) * 0.85);
  rg.addColorStop(0, 'rgba(255,255,255,0)');
  rg.addColorStop(1, 'rgba(150,128,96,0.07)');
  g.fillStyle = rg;
  g.fillRect(0, 0, w, h);
}

// ─────────────────────────────────────────────────────────── ikony nadruku

function drawDie(g: CanvasRenderingContext2D, n: number, s: number): void {
  const h = s / 2;
  roundRect(g, -h, -h, s, s, s * 0.2);
  g.stroke();
  const q = s * 0.26;
  const pips: Record<number, [number, number][]> = {
    1: [[0, 0]],
    2: [
      [-1, -1],
      [1, 1],
    ],
    3: [
      [-1, -1],
      [0, 0],
      [1, 1],
    ],
    4: [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ],
    5: [
      [-1, -1],
      [1, -1],
      [0, 0],
      [-1, 1],
      [1, 1],
    ],
    6: [
      [-1, -1],
      [1, -1],
      [-1, 0],
      [1, 0],
      [-1, 1],
      [1, 1],
    ],
  };
  for (const [px, py] of pips[n]) {
    g.beginPath();
    g.arc(px * q, py * q, s * 0.085, 0, Math.PI * 2);
    g.fill();
  }
}

function drawBadge(g: CanvasRenderingContext2D, text: string, s: number): void {
  g.font = `700 ${Math.round(s * 0.5)}px ${PRINT_TEXT}`;
  const w = Math.max(s, g.measureText(text).width + s * 0.42);
  roundRect(g, -w / 2, -s * 0.38, w, s * 0.76, s * 0.18);
  g.stroke();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 0, s * 0.03);
}

export function drawIcon(
  g: CanvasRenderingContext2D,
  kind: IconKind,
  cx: number,
  cy: number,
  s: number,
  color: string,
): void {
  g.save();
  g.translate(cx, cy);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = Math.max(2, s * 0.075);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const h = s / 2;
  const badges: Partial<Record<IconKind, string>> = {
    x3: '3×',
    x4: '4×',
    full: '3+2',
    small: '1–4',
    big: '1–5',
    gen: '5×',
    chance: '?',
    sum: 'Σ',
    plus: '+35',
  };
  if (kind[0] === 'd' && kind.length === 2) drawDie(g, Number(kind[1]), s * 0.9);
  else if (badges[kind]) drawBadge(g, badges[kind] as string, s);
  else if (kind === 'house') {
    g.beginPath();
    g.moveTo(-h * 0.85, -h * 0.05);
    g.lineTo(0, -h * 0.85);
    g.lineTo(h * 0.85, -h * 0.05);
    g.moveTo(-h * 0.62, -h * 0.25);
    g.lineTo(-h * 0.62, h * 0.8);
    g.lineTo(h * 0.62, h * 0.8);
    g.lineTo(h * 0.62, -h * 0.25);
    g.stroke();
    g.strokeRect(-h * 0.16, h * 0.28, h * 0.32, h * 0.52);
  } else if (kind === 'route') {
    g.setLineDash([s * 0.12, s * 0.1]);
    g.beginPath();
    g.moveTo(-h * 0.75, h * 0.6);
    g.bezierCurveTo(-h * 0.2, h * 0.7, h * 0.1, -h * 0.7, h * 0.75, -h * 0.55);
    g.stroke();
    g.setLineDash([]);
    for (const [x, y] of [
      [-h * 0.78, h * 0.62],
      [h * 0.78, -h * 0.56],
    ]) {
      g.beginPath();
      g.arc(x, y, s * 0.1, 0, Math.PI * 2);
      g.fill();
    }
  } else if (kind === 'card') {
    g.rotate(-0.16);
    roundRect(g, -h * 0.55, -h * 0.8, h * 1.1, h * 1.6, s * 0.08);
    g.stroke();
    line(g, -h * 0.3, -h * 0.35, h * 0.3, -h * 0.35);
    line(g, -h * 0.3, -h * 0.05, h * 0.15, -h * 0.05);
  } else if (kind === 'crate') {
    g.strokeRect(-h * 0.72, -h * 0.72, h * 1.44, h * 1.44);
    line(g, -h * 0.72, -h * 0.72, h * 0.72, h * 0.72);
    line(g, h * 0.72, -h * 0.72, -h * 0.72, h * 0.72);
  } else if (kind === 'coin') {
    g.beginPath();
    g.arc(0, 0, h * 0.8, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(0, 0, h * 0.48, 0, Math.PI * 2);
    g.stroke();
  } else if (kind === 'flag') {
    line(g, -h * 0.55, h * 0.85, -h * 0.55, -h * 0.85);
    g.beginPath();
    g.moveTo(-h * 0.55, -h * 0.85);
    g.lineTo(h * 0.75, -h * 0.5);
    g.lineTo(-h * 0.55, -h * 0.12);
    g.closePath();
    g.stroke();
  } else if (kind === 'star') {
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const rr = k % 2 ? h * 0.4 : h * 0.88;
      if (k) g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    g.stroke();
  } else if (kind === 'minus') {
    g.beginPath();
    g.arc(0, 0, h * 0.8, 0, Math.PI * 2);
    g.stroke();
    line(g, -h * 0.42, 0, h * 0.42, 0);
  }
  g.restore();
}

// ─────────────────────────────────────────────────────────── nadruk wbudowanego notesu

function buildBuiltin(t: PadTemplate, CW: number, CH: number, glue: number): HTMLCanvasElement {
  const grid = t.grid as NonNullable<PadTemplate['grid']>;
  const pr = t.print as NonNullable<PadTemplate['print']>;
  const [c, g] = makeCanvas(CW, CH);
  paperBase(g, CW, CH);
  glueResidue(g, CW, CH, glue, t.tape);
  const P = pr.color;
  const gx = grid.x.map((v) => v * CW);
  const gy = grid.y.map((v) => v * CH);
  const x0 = gx[0];
  const x1 = gx[gx.length - 1];
  const labelX = gx[grid.labels];
  const top = gy[0];
  const bottom = gy[gy.length - 1];
  const fieldY = (t.header ? t.header.game[1] * CH : 266) + 14;

  g.fillStyle = P;
  g.strokeStyle = P;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.font = `700 80px ${PRINT_DISPLAY}`;
  g.fillText(pr.title, x0 - 3, 192);
  spacing(g, '3px');
  g.font = `600 21px ${PRINT_TEXT}`;
  g.fillText(pr.subtitle.toUpperCase(), x0, 228);
  spacing(g, '0px');
  pr.ornaments.forEach((k, i) => {
    g.save();
    g.translate(x1 - 26 - (pr.ornaments.length - 1 - i) * 54, 168);
    g.rotate((i % 2 ? 1 : -1) * 0.12);
    drawIcon(g, k, 0, 0, 42, P);
    g.restore();
  });
  spacing(g, '2px');
  g.font = `700 16px ${PRINT_TEXT}`;
  g.fillText('PARTIA NR', x0, fieldY);
  g.fillText('DATA', x0 + 238, fieldY);
  spacing(g, '0px');
  g.lineWidth = 1.4;
  line(g, x0 + 104, fieldY + 3, x0 + 200, fieldY + 3);
  line(g, x0 + 286, fieldY + 3, x0 + 476, fieldY + 3);
  g.font = `400 16px ${PRINT_TEXT}`;
  g.textAlign = 'right';
  g.globalAlpha = 0.75;
  g.fillText(pr.corner, x1, fieldY);
  g.globalAlpha = 1;

  // wypełnienia wierszy liczonych
  t.lines.forEach((l, i) => {
    const y = gy[i];
    const h = gy[i + 1] - gy[i];
    if (l.kind === 'names') {
      g.fillStyle = pr.tint;
      g.fillRect(x0, y, labelX - x0, h);
    } else if (l.kind !== 'input') {
      g.fillStyle = pr.tint;
      g.fillRect(x0, y, x1 - x0, h);
      if (l.kind === 'total') g.fillRect(x0, y, labelX - x0, h);
    }
  });
  // linie
  g.strokeStyle = P;
  t.lines.forEach((l, i) => {
    const y = gy[i];
    const prev = t.lines[i - 1];
    const comp = (k: string): boolean => k === 'sum' || k === 'bonus' || k === 'total';
    const rule = !!prev && prev.kind !== 'names' && comp(l.kind) !== comp(prev.kind);
    g.lineWidth = l.kind === 'total' || rule ? 3 : prev && prev.kind === 'names' ? 2.6 : 1.3;
    line(g, x0, y, x1, y);
    if (l.kind === 'total') {
      g.lineWidth = 1.3;
      line(g, x0, y - 5, x1, y - 5);
    }
  });
  g.lineWidth = 2.6;
  line(g, labelX, top, labelX, bottom);
  g.lineWidth = 1.3;
  for (let k = grid.labels + 1; k < gx.length - 1; k++) line(g, gx[k], top, gx[k], bottom);
  g.lineWidth = 3.4;
  g.strokeRect(x0, top, x1 - x0, bottom - top);

  // etykiety
  t.lines.forEach((d, i) => {
    const y = gy[i];
    const h = gy[i + 1] - gy[i];
    const cy = y + h / 2;
    const big = h > 80;
    g.fillStyle = P;
    g.textAlign = 'left';
    if (d.kind === 'names') {
      spacing(g, '2.5px');
      g.font = `700 19px ${PRINT_TEXT}`;
      g.textBaseline = 'middle';
      g.fillText('GRACZE', x0 + 18, cy + 1);
      spacing(g, '0px');
      g.font = `600 15px ${PRINT_TEXT}`;
      g.globalAlpha = 0.65;
      for (let p = 0; p + grid.labels < gx.length - 1; p++)
        g.fillText(String(p + 1), gx[grid.labels + p] + 9, y + 14);
      g.globalAlpha = 1;
      return;
    }
    const iconS = big ? 40 : 29;
    let tx = x0 + 18;
    if (d.icon) {
      drawIcon(g, d.icon, x0 + 16 + iconS / 2, cy, iconS, P);
      tx = x0 + 30 + iconS;
    }
    g.fillStyle = P;
    g.textBaseline = 'alphabetic';
    if (d.kind === 'total') {
      g.font = `700 ${big ? 38 : 34}px ${PRINT_DISPLAY}`;
      g.fillText(d.label, x0 + 18, cy + 12);
    } else if (d.kind !== 'input') {
      spacing(g, '1.5px');
      g.font = `700 18px ${PRINT_TEXT}`;
      g.fillText(d.label.toUpperCase(), tx, cy - 1);
      spacing(g, '0px');
      g.font = `400 15px ${PRINT_TEXT}`;
      g.globalAlpha = 0.75;
      g.fillText(d.hint ?? '', tx, cy + 17);
      g.globalAlpha = 1;
    } else {
      g.font = `600 ${big ? 31 : 27}px ${PRINT_TEXT}`;
      g.fillText(d.label, tx, cy + (big ? -2 : 0));
      g.font = `400 ${big ? 18 : 16}px ${PRINT_TEXT}`;
      g.globalAlpha = 0.72;
      g.fillText(d.hint ?? '', tx, cy + (big ? 25 : 20));
      g.globalAlpha = 1;
    }
  });

  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.font = `400 17px ${PRINT_TEXT}`;
  g.globalAlpha = 0.8;
  g.fillText(pr.footer, x0, CH - 52);
  g.textAlign = 'right';
  spacing(g, '2px');
  g.font = `700 14px ${PRINT_TEXT}`;
  g.fillText(`NOTES · ${lineCount(t) > 12 ? 48 : 40} KARTEK`, x1, CH - 52);
  spacing(g, '0px');
  g.globalAlpha = 1;
  applyGrain(g, CW, CH);
  return c;
}

// ─────────────────────────────────────────────────────────── przygotowanie tekstur

export interface PrintSet {
  key: string;
  t: PadTemplate;
  glue: number;
  print: HTMLCanvasElement;
  back: HTMLCanvasElement;
  tone: string;
  CW: number;
  CH: number;
}

const cache = new Map<string, PrintSet>();

export function texSize(t: PadTemplate): [number, number] {
  if (t.print) return [1024, 1434];
  const a = t.size.w / t.size.h;
  const long = 1600;
  return a <= 1 ? [Math.round(long * a), long] : [long, Math.round(long / a)];
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('Nie udało się wczytać zdjęcia kartki.'));
    im.src = src;
  });
}

function paperTone(c: HTMLCanvasElement): string {
  const [s, g] = makeCanvas(48, 48);
  g.drawImage(c, 0, 0, 48, 48);
  const d = g.getImageData(0, 0, 48, 48).data;
  const px: [number, number, number, number][] = [];
  for (let i = 0; i < d.length; i += 4)
    px.push([d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11, d[i], d[i + 1], d[i + 2]]);
  px.sort((a, b) => b[0] - a[0]);
  const top = px.slice(Math.floor(px.length * 0.08), Math.floor(px.length * 0.3));
  const avg = [1, 2, 3].map((k) =>
    Math.round(top.reduce((s2, p) => s2 + p[k], 0) / Math.max(1, top.length)),
  );
  void s;
  return `#${avg.map((v) => Math.min(255, v).toString(16).padStart(2, '0')).join('')}`;
}

export function printKey(t: PadTemplate): string {
  return `${t.id}:${t.size.w}x${t.size.h}:${t.image ? t.image.length : 'p'}:${t.tape}:${t.binding ?? 'top'}`;
}

export async function preparePrint(t: PadTemplate, glue: number): Promise<PrintSet> {
  const key = printKey(t);
  const hit = cache.get(key);
  if (hit) return hit;
  const [CW, CH] = texSize(t);
  let print: HTMLCanvasElement;
  let tone = '#f8f6f1';
  if (t.image) {
    const im = await loadImage(t.image);
    const [c, g] = makeCanvas(CW, CH);
    g.imageSmoothingQuality = 'high';
    g.drawImage(im, 0, 0, CW, CH);
    tone = paperTone(c);
    glueResidue(g, CW, CH, glue, t.tape, t.binding === 'left');
    applyGrain(g, CW, CH, 0.35);
    print = c;
  } else {
    print = buildBuiltin(t, CW, CH, glue);
  }
  const [b, bg] = makeCanvas(CW, CH);
  paperBase(bg, CW, CH, tone);
  glueResidue(bg, CW, CH, glue, t.tape, t.binding === 'left');
  applyGrain(bg, CW, CH);
  const set: PrintSet = { key, t, glue, print, back: b, tone, CW, CH };
  cache.set(key, set);
  return set;
}

export function dropPrint(t: PadTemplate): void {
  cache.delete(printKey(t));
}

/** Przerysowuje nadruki wbudowanych notesów (gdy doczytają się fonty). */
export function refreshBuiltinPrints(): void {
  for (const set of cache.values()) {
    if (!set.t.print) continue;
    const fresh = buildBuiltin(set.t, set.CW, set.CH, set.glue);
    const g = set.print.getContext('2d') as CanvasRenderingContext2D;
    g.clearRect(0, 0, set.CW, set.CH);
    g.drawImage(fresh, 0, 0);
  }
}
