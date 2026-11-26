// Bloczek notesu, stół, rekwizyty i dźwięki.

import * as THREE from 'three';
import type { Spec } from './cloth';
import type { PrintSet } from './print';
import type { PadTemplate } from './templates';
import type { ShapePt, SheetShape } from './shape';
import { CARDBOARD, SHEET_T, makeCanvas, mulberry32, rotateContent } from './util';

/**
 * Bryła o obrysie kartki: grubość wzdłuż osi Y, wyśrodkowana (jak BoxGeometry). Grupy: 0 wieka, 1 boki.
 * `rot`: obrys treści obrócony do układu fizycznego (notes klejony z lewej).
 */
function extrudeShape(
  sh: SheetShape,
  W: number,
  H: number,
  depth: number,
  rot: boolean,
): THREE.BufferGeometry {
  const pt = ([cx, cy]: ShapePt): THREE.Vector2 => {
    const [x, y] = rot ? [1 - cy, cx] : [cx, cy];
    return new THREE.Vector2(-W / 2 + x * W, H / 2 - y * H);
  };
  const shape = new THREE.Shape(sh.outline.map(pt));
  for (const h of sh.holes ?? []) shape.holes.push(new THREE.Path(h.map(pt)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -depth / 2, 0);
  return g;
}

export class Pad {
  readonly group = new THREE.Group();
  private block: THREE.Mesh;
  private topPlane: THREE.Mesh;
  private tapeTop: THREE.Mesh;
  private tapeBack: THREE.Mesh;
  private edgeTex: THREE.CanvasTexture;
  readonly topTex: THREE.CanvasTexture;
  private disposables: { dispose(): void }[] = [];
  left = 48;

  constructor(
    readonly spec: Spec,
    ps: PrintSet,
    t: PadTemplate,
    aniso: number,
  ) {
    const { W, H, tapeD } = spec;
    const [ec, eg] = makeCanvas(64, 128);
    eg.fillStyle = ps.tone;
    eg.fillRect(0, 0, 64, 128);
    const r = mulberry32(5);
    for (let y = 0; y < 128; y += 16) {
      eg.fillStyle = `rgba(110,98,80,${0.2 + r() * 0.12})`;
      eg.fillRect(0, y, 64, 2);
      eg.fillStyle = 'rgba(255,255,255,0.45)';
      eg.fillRect(0, y + 3, 64, 1);
    }
    this.edgeTex = new THREE.CanvasTexture(ec);
    this.edgeTex.encoding = THREE.sRGBEncoding;
    this.edgeTex.wrapS = this.edgeTex.wrapT = THREE.RepeatWrapping;
    const edgeMat = new THREE.MeshStandardMaterial({ map: this.edgeTex, roughness: 0.95 });
    const plainMat = new THREE.MeshStandardMaterial({ color: ps.tone, roughness: 0.95 });
    // tektura pod blokiem: z góry widać tylko jej brzeg
    const boardMat = new THREE.MeshStandardMaterial({ color: 0x6b5d4f, roughness: 0.96 });
    const shape = spec.mask ? t.shape : undefined;
    const blockGeo = shape
      ? extrudeShape(shape, W, H, 1, spec.rot)
      : new THREE.BoxGeometry(W, 1, H);
    this.block = new THREE.Mesh(
      blockGeo,
      shape ? [plainMat, edgeMat] : [edgeMat, edgeMat, plainMat, boardMat, edgeMat, edgeMat],
    );
    this.block.castShadow = true;
    this.block.receiveShadow = true;
    const boardGeo = shape
      ? extrudeShape(shape, W, H, CARDBOARD, spec.rot)
      : new THREE.BoxGeometry(W + 0.01, CARDBOARD, H + 0.01);
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.y = CARDBOARD / 2;
    board.castShadow = true;
    board.receiveShadow = true;

    this.topTex = new THREE.CanvasTexture(ps.print);
    this.topTex.encoding = THREE.sRGBEncoding;
    // pełna rozdzielczość z mipmapami i maksymalną anizotropią
    this.topTex.generateMipmaps = true;
    this.topTex.minFilter = THREE.LinearMipmapLinearFilter;
    this.topTex.anisotropy = aniso;
    // wierzchnia kartka bloczka: przezroczysta poza kształtem
    const maskTex = spec.mask?.texture();
    if (maskTex) this.disposables.push(maskTex);
    rotateContent(this.topTex, spec.rot);
    rotateContent(maskTex, spec.rot);
    const topMat = new THREE.MeshStandardMaterial({
      map: this.topTex,
      roughness: 0.9,
      alphaMap: maskTex ?? null,
      alphaTest: maskTex ? 0.5 : 0,
    });
    const topGeo = new THREE.PlaneGeometry(W, H);
    this.topPlane = new THREE.Mesh(topGeo, topMat);
    this.topPlane.rotation.x = -Math.PI / 2;
    this.topPlane.receiveShadow = true;

    const [tc, tg] = makeCanvas(128, 32);
    tg.fillStyle = '#ffffff';
    tg.fillRect(0, 0, 128, 32);
    for (let x = 0; x < 128; x += 2) {
      tg.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.08})`;
      tg.fillRect(x, 0, 1, 32);
    }
    for (let y = 0; y < 32; y += 2) {
      tg.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.06})`;
      tg.fillRect(0, y, 128, 1);
    }
    const tapeTex = new THREE.CanvasTexture(tc);
    tapeTex.encoding = THREE.sRGBEncoding;
    tapeTex.wrapS = tapeTex.wrapT = THREE.RepeatWrapping;
    tapeTex.repeat.set(Math.max(2, W * 3), 1);
    const tapeMat = new THREE.MeshStandardMaterial({
      map: tapeTex,
      roughness: 0.82,
      color: t.tape,
    });
    const tapeDepth = tapeD + 0.014;
    const ttGeo = new THREE.BoxGeometry(W + 0.024, 0.011, tapeDepth);
    this.tapeTop = new THREE.Mesh(ttGeo, tapeMat);
    this.tapeTop.position.z = -H / 2 - 0.014 + tapeDepth / 2;
    this.tapeTop.castShadow = true;
    this.tapeTop.receiveShadow = true;
    const tbGeo = new THREE.BoxGeometry(W + 0.024, 1, 0.014);
    this.tapeBack = new THREE.Mesh(tbGeo, tapeMat);
    this.tapeBack.position.z = -H / 2 - 0.007;
    this.tapeBack.castShadow = true;
    this.group.add(this.block, board, this.topPlane, this.tapeTop, this.tapeBack);
    this.disposables.push(
      this.edgeTex,
      edgeMat,
      plainMat,
      boardMat,
      blockGeo,
      boardGeo,
      this.topTex,
      topMat,
      topGeo,
      tapeTex,
      tapeMat,
      ttGeo,
      tbGeo,
    );
    this.layout();
  }

  get top(): number {
    return CARDBOARD + Math.max(this.left, 4) * SHEET_T;
  }

  setLeft(n: number): void {
    this.left = n;
    this.layout();
  }

  private layout(): void {
    const h = this.top - CARDBOARD;
    this.block.scale.y = h;
    this.block.position.y = CARDBOARD + h / 2;
    this.edgeTex.repeat.set(1, Math.max(1, this.left / 8));
    this.topPlane.position.y = this.top + 0.0006;
    this.tapeTop.position.y = this.top + 0.004 + 0.0055;
    const bh = this.top + 0.015;
    this.tapeBack.scale.y = bh;
    this.tapeBack.position.y = bh / 2;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}

// ─────────────────────────────────────────────────────────── blat

export function woodTexture(aniso: number): THREE.CanvasTexture {
  const [c, g] = makeCanvas(1024, 1024);
  g.fillStyle = '#5c3b25';
  g.fillRect(0, 0, 1024, 1024);
  const r = mulberry32(21);
  for (let p = 0; p < 4; p++) {
    const y0 = p * 256;
    const tone = (r() - 0.5) * 0.12;
    g.fillStyle = tone > 0 ? `rgba(255,220,180,${tone})` : `rgba(20,10,4,${-tone})`;
    g.fillRect(0, y0, 1024, 256);
    for (let k = 0; k < 70; k++) {
      const yy = y0 + r() * 256;
      const amp = 2 + r() * 6;
      const fr = 0.004 + r() * 0.01;
      const ph = r() * 10;
      const dark = r() < 0.7;
      g.strokeStyle = dark
        ? `rgba(35,18,8,${0.08 + r() * 0.22})`
        : `rgba(170,120,80,${0.05 + r() * 0.12})`;
      g.lineWidth = 0.6 + r() * 2.6;
      g.beginPath();
      for (let x = 0; x <= 1024; x += 16) {
        const yv = yy + Math.sin(x * fr + ph) * amp + Math.sin(x * fr * 3.1 + ph * 2) * amp * 0.3;
        if (x) g.lineTo(x, yv);
        else g.moveTo(x, yv);
      }
      g.stroke();
    }
    g.fillStyle = 'rgba(18,8,3,0.55)';
    g.fillRect(0, y0, 1024, 2);
  }
  const img = g.getImageData(0, 0, 1024, 1024);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 10;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  t.anisotropy = aniso;
  return t;
}

// ─────────────────────────────────────────────────────────── dźwięk

export class Sfx {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  on = true;

  /** Zamyka kontekst audio (przy zamknięciu notesu). */
  close(): void {
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.noise = null;
  }

  unlock(): void {
    if (this.ctx || !this.on) return;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  private burst(dur: number, freq: number, q: number, gain: number, delay = 0): void {
    if (!this.on || !this.ctx || !this.noise) return;
    const c = this.ctx;
    const t0 = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + Math.min(0.006, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(c.destination);
    src.start(t0, Math.random() * 0.5, dur + 0.05);
  }

  crackle(): void {
    for (let k = 0; k < 3; k++)
      this.burst(0.025 + Math.random() * 0.03, 1500 + Math.random() * 3200, 1.1, 0.22, k * 0.012);
  }

  scratch(ms: number): void {
    const n = Math.max(2, Math.round(ms / 70));
    for (let k = 0; k < n; k++)
      this.burst(
        0.05 + Math.random() * 0.04,
        2600 + Math.random() * 1800,
        2.5,
        0.045,
        (k * ms) / n / 1000,
      );
  }

  rustle(): void {
    this.burst(0.16, 1100, 0.6, 0.06);
  }

  whoosh(): void {
    if (!this.on || !this.ctx || !this.noise) return;
    const c = this.ctx;
    const t0 = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.7;
    f.frequency.setValueAtTime(320, t0);
    f.frequency.exponentialRampToValueAtTime(1500, t0 + 0.45);
    f.frequency.exponentialRampToValueAtTime(420, t0 + 1.2);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.14, t0 + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.25);
    src.connect(f).connect(g).connect(c.destination);
    src.start(t0);
    src.stop(t0 + 1.3);
  }
}
