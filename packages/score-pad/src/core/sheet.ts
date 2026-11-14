// Kartka 3D: tekstura z pismem, materiał z prześwitem i siatka wygładzana z symulacji.

import * as THREE from 'three';
import type { Spec } from './cloth';
import { Cloth } from './cloth';
import { digitSize, drawCell, hand, inkStyle, penStroke, setInkStyle, wobblyEllipse } from './ink';
import type { Settings } from './settings';
import type { PrintSet } from './print';
import { MIN_TEX_SIDE, skipNoise } from './print';
import type { LineKind, PadTemplate, Rect, SheetData, Spot } from './templates';
import {
  cellOf,
  computePlayer,
  digitsOf,
  finalTotalIndex,
  playerActive,
  playerCount,
  padRanking,
  rankSheet,
  spots,
  valuesOf,
} from './templates';
import type { Ink } from './util';
import { clamp, inkDone, inkNow, mulberry32, range, rotateContent } from './util';
import { shapePath } from './shape';

export interface TransLight {
  dir: THREE.Vector3;
  color: THREE.Color;
}

// ─────────────────────────────────────────────────────────── malarz

class Painter {
  readonly main: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  readonly inkC: HTMLCanvasElement;
  readonly ig: CanvasRenderingContext2D;
  readonly tex: THREE.CanvasTexture;
  private skip: CanvasPattern;

  constructor(
    readonly ps: PrintSet,
    aniso: number,
  ) {
    this.main = document.createElement('canvas');
    this.main.width = ps.CW;
    this.main.height = ps.CH;
    this.g = this.main.getContext('2d') as CanvasRenderingContext2D;
    this.inkC = document.createElement('canvas');
    this.inkC.width = ps.CW;
    this.inkC.height = ps.CH;
    this.ig = this.inkC.getContext('2d') as CanvasRenderingContext2D;
    this.skip = this.ig.createPattern(skipNoise(), 'repeat') as CanvasPattern;
    this.tex = new THREE.CanvasTexture(this.main);
    this.tex.encoding = THREE.sRGBEncoding;
    // kartka i pismo w rozdzielczości tekstury, z mipmapami i anizotropią (PAD-16)
    this.tex.generateMipmaps = true;
    this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.tex.anisotropy = aniso;
  }

  paint(s: PaperSheet, now: number): boolean {
    const t = s.t;
    const d = s.data;
    const { CW, CH } = this.ps;
    const k = CH / 1434;
    // pismo w rozdzielczości tekstury (PAD-16): powyżej dawnych 1600 px limity grubości i wielkości rosną
    const res = Math.max(1, Math.max(CW, CH) / MIN_TEX_SIDE);
    const pen = clamp(3.4 * Math.max(k, CW / 1024) * 0.92, 2.2, 5.5 * res);
    const g = this.ig;
    let anim = false;
    setInkStyle(s.cfg.ink.color, s.cfg.ink.speed, s.cfg.ink.size);
    g.clearRect(0, 0, CW, CH);
    const px = (r: {
      x: number;
      y: number;
      w: number;
      h: number;
    }): { x: number; y: number; w: number; h: number } => ({
      x: r.x * CW,
      y: r.y * CH,
      w: r.w * CW,
      h: r.h * CH,
    });

    if (t.header && d.started && d.startInk) {
      anim =
        hand(
          g,
          String(d.game),
          t.header.game[0] * CW,
          t.header.game[1] * CH,
          46 * k,
          d.startInk,
          now,
        ) || anim;
      anim =
        hand(
          g,
          d.started,
          t.header.date[0] * CW,
          t.header.date[1] * CH,
          42 * k,
          { seed: d.startInk.seed + 7, t: d.startInk.t + 300 },
          now,
          { maxW: 180 * k },
        ) || anim;
    }

    const n = playerCount(t);
    const vals = range(0, n - 1).map((p) => valuesOf(t, d, p));
    const comps = vals.map((v) => computePlayer(t, v));
    // zakreślamy zwycięzcę w sumie, która rozstrzyga grę (ona też jest pisana mocniej niż sumy pośrednie)
    const totalLine = finalTotalIndex(t);
    const all = spots(t);

    for (const sp of all) {
      const ln = t.lines[sp.li];
      const r = px(sp.rect);
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const p = sp.p;
      if (ln.kind === 'names') {
        const nm = d.names[p];
        if (nm)
          anim =
            hand(
              g,
              nm.text,
              cx + r.w * 0.02,
              cy + r.h * 0.04,
              Math.min(r.h * 0.78, r.w * 0.36, 60 * res) * inkStyle.size,
              nm.ink,
              now,
              { weight: 700, maxW: r.w * 0.86 },
            ) || anim;
      } else if (ln.kind === 'input') {
        const draft = s.draft && s.draft.key === sp.key ? s.draft : null;
        const cell = cellOf(d, t, sp);
        if (draft) {
          if (draft.text)
            anim =
              hand(
                g,
                draft.text,
                cx,
                cy,
                digitSize(r.w, r.h, Math.max(digitsOf(ln), draft.text.length), res),
                draft.ink,
                now,
              ) || anim;
        } else if (cell)
          anim =
            drawCell(g, cell, cx, cy, digitSize(r.w, r.h, digitsOf(ln), res), r.w, now, pen) ||
            anim;
      } else {
        const v = comps[p][ln.id] ?? null;
        const key = sp.key;
        const prev = s.comp.get(key);
        if (!prev || prev.v !== v)
          s.comp.set(key, {
            v,
            ink: s.compInit ? inkNow(sp.li === totalLine ? 520 : 380) : inkDone(),
          });
        if (v == null) continue;
        const ink = (s.comp.get(key) as { ink: Ink }).ink;
        const size =
          digitSize(r.w, r.h, Math.max(2, String(v).length), res) *
          (sp.li === totalLine ? 1.04 : 0.97);
        anim =
          hand(g, String(v), cx, cy, size, ink, now, { weight: sp.li === totalLine ? 700 : 600 }) ||
          anim;
      }
    }

    // zwycięzca (miejsce 1, także wspólne) zakreślony w kategorii decydującej (EDT-2), gdy każda
    // kategoria punktowa każdego grającego ma wartość
    const act = range(0, n - 1).filter((p) => playerActive(t, d, p));
    const inputs = t.lines.filter((l) => l.kind === 'input').map((l) => l.id);
    const rankLine = t.lines.findIndex((l) => l.id === padRanking(t).line);
    const complete =
      rankLine >= 0 &&
      act.length > 0 &&
      inputs.length > 0 &&
      act.every((p) => inputs.every((id) => vals[p][id] != null));
    let winKey = '';
    let winners: number[] = [];
    if (complete) {
      const ranked = rankSheet(
        t,
        act.map((p) => ({ seat: p, values: vals[p] })),
      );
      // Bez wartości kategorii decydującej (np. suma na cyklu) nikt nie wygrywa.
      if (ranked[0].rankingValue != null) {
        winners = ranked.filter((r) => r.place === 1).map((r) => r.seat);
        winKey = winners.join(',') + ':' + ranked[0].rankingValue;
      }
    }
    if (winKey !== s.winKey) {
      s.winKey = winKey;
      s.winInk = winKey ? (s.compInit ? inkNow(1100) : inkDone()) : null;
    }
    if (s.winInk && rankLine >= 0) {
      for (const sp of all) {
        if (sp.li !== rankLine || !winners.includes(sp.p)) continue;
        const r = px(sp.rect);
        const prog = (now - s.winInk.t) / (650 / inkStyle.speed);
        penStroke(
          g,
          wobblyEllipse(
            mulberry32(s.winInk.seed + sp.p),
            r.x + r.w / 2,
            r.y + r.h / 2,
            r.w * 0.42,
            r.h * 0.42,
          ),
          prog,
          pen * 0.95,
        );
        if (prog < 1) anim = true;
      }
    }
    s.compInit = true;

    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = this.skip;
    g.fillRect(0, 0, CW, CH);
    g.restore();

    const m = this.g;
    m.globalCompositeOperation = 'source-over';
    m.drawImage(this.ps.print, 0, 0);
    if (s.focus) {
      const r = px(s.focus.rect);
      // wpis spoza zakresu kategorii: pole na czerwono (PAD-15)
      m.fillStyle = s.draft?.bad ? 'rgba(214, 64, 58, 0.3)' : 'rgba(255, 206, 84, 0.34)';
      if (s.focus.round) {
        m.beginPath();
        m.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2 - 2, r.h / 2 - 2, 0, 0, Math.PI * 2);
        m.fill();
      } else m.fillRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
    }
    m.globalCompositeOperation = 'multiply';
    m.drawImage(this.inkC, 0, 0);
    m.globalCompositeOperation = 'source-over';
    if (s.cfg.debug.fields) this.drawFields(s);
    this.tex.needsUpdate = true;
    return anim;
  }

  /** Tryb debugowania: obrys pól siatki w kolorach rodzajów kategorii. */
  private drawFields(s: PaperSheet): void {
    const t = s.t;
    const m = this.g;
    const { CW, CH } = this.ps;
    const col: Record<LineKind, string> = {
      input: '#2f6fed',
      names: '#d99a00',
      sum: '#1f9d6b',
      bonus: '#8a4fd8',
      total: '#0f7d55',
      skip: '#8a8a8a',
    };
    m.save();
    m.lineWidth = Math.max(2, CW / 500);
    m.font = `700 ${Math.round(CH / 70)}px Arial, sans-serif`;
    m.textBaseline = 'top';
    if (t.shape) {
      // obrys kształtu kartki
      m.strokeStyle = '#ff4d6d';
      m.setLineDash([CW / 90, CW / 140]);
      m.beginPath();
      shapePath(m, t.shape, CW, CH);
      m.stroke();
      m.setLineDash([]);
    }
    const shape = (r: Rect, round: boolean, inset: number): void => {
      m.beginPath();
      if (round)
        m.ellipse(
          r.x + r.w / 2,
          r.y + r.h / 2,
          Math.max(1, r.w / 2 - inset),
          Math.max(1, r.h / 2 - inset),
          0,
          0,
          Math.PI * 2,
        );
      else m.rect(r.x + inset, r.y + inset, r.w - inset * 2, r.h - inset * 2);
    };
    for (const sp of spots(t)) {
      const ln = t.lines[sp.li];
      const r = { x: sp.rect.x * CW, y: sp.rect.y * CH, w: sp.rect.w * CW, h: sp.rect.h * CH };
      m.strokeStyle = col[ln.kind];
      m.fillStyle = col[ln.kind] + '22';
      shape(r, sp.round, 0);
      m.fill();
      shape(r, sp.round, 2);
      m.stroke();
      if (sp.field || sp.p === 0) {
        m.fillStyle = col[ln.kind];
        m.fillText(sp.field ? `${sp.li + 1}·G${sp.p + 1}` : `${sp.li + 1}`, r.x + 5, r.y + 4);
      }
    }
    m.restore();
  }

  dispose(): void {
    this.tex.dispose();
    this.main.width = this.main.height = 0;
    this.inkC.width = this.inkC.height = 0;
  }
}

// ─────────────────────────────────────────────────────────── materiał z prześwitem

export interface PaperUniforms {
  uBack: { value: THREE.Texture };
  uL1: { value: THREE.Vector3 };
  uC1: { value: THREE.Color };
  uL2: { value: THREE.Vector3 };
  uC2: { value: THREE.Color };
  uTrans: { value: number };
  uTorn: { value: number };
  uSeed: { value: number };
}

function makePaperMaterial(
  front: THREE.Texture,
  back: THREE.Texture,
  lights: TransLight[],
): { mat: THREE.MeshStandardMaterial; uni: PaperUniforms } {
  const mat = new THREE.MeshStandardMaterial({
    map: front,
    roughness: 0.88,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const uni: PaperUniforms = {
    uBack: { value: back },
    uL1: { value: lights[0].dir },
    uC1: { value: lights[0].color },
    uL2: { value: lights[1].dir },
    uC2: { value: lights[1].color },
    uTrans: { value: 2.1 },
    uTorn: { value: 0 },
    uSeed: { value: Math.random() * 10 },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uni);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNrm = normalize(mat3(modelMatrix) * objectNormal);',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D uBack;
uniform vec3 uL1; uniform vec3 uC1; uniform vec3 uL2; uniform vec3 uC2;
uniform float uTrans; uniform float uTorn; uniform float uSeed;
varying vec3 vWPos; varying vec3 vWNrm;
float hash1(float x) { return fract(sin(x * 127.1 + uSeed * 311.7) * 43758.5453); }
float vnoise(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hash1(i), hash1(i + 1.0), f); }
vec3 transmit(vec3 Nw, vec3 Vw, vec3 L, vec3 C, vec3 filt) {
  float behind = max(dot(-Nw, L), 0.0);
  float fwd = pow(max(dot(Vw, -L), 0.0), 2.0);
  return C * vec3(1.0, 0.93, 0.8) * filt * behind * (0.28 + 1.1 * fwd);
}`,
      )
      .replace(
        '#include <map_fragment>',
        `vec4 sFront = texture2D(map, vUv);
  vec4 sBack = texture2D(uBack, vUv);
  vec4 sOwn = gl_FrontFacing ? sFront : sBack;
  vec4 sOther = gl_FrontFacing ? sBack : sFront;
  if (uTorn > 0.5) {
    float edge = 0.003 + 0.011 * vnoise(vUv.x * 95.0) + 0.006 * vnoise(vUv.x * 21.0 + 4.0);
    if (vUv.y > 1.0 - edge) discard;
  }
  diffuseColor *= sOwn;`,
      )
      .replace(
        '#include <output_fragment>',
        `{
    // światło przechodzące przez papier z drugiej strony; atrament z obu stron je pochłania
    vec3 Nw = normalize(vWNrm) * (gl_FrontFacing ? 1.0 : -1.0);
    vec3 Vw = normalize(cameraPosition - vWPos);
    vec3 filt = sOwn.rgb * sOther.rgb;
    outgoingLight += (transmit(Nw, Vw, normalize(uL1), uC1, filt) + transmit(Nw, Vw, normalize(uL2), uC2, filt)) * uTrans;
  }
  #include <output_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => 'paper-transmission-v2';
  return { mat, uni };
}

// ─────────────────────────────────────────────────────────── kartka

function crTable(count: number, n: number): { idx: Int16Array; w: Float32Array } {
  const idx = new Int16Array(count * 4);
  const w = new Float32Array(count * 4);
  for (let a = 0; a < count; a++) {
    const s = (a / (count - 1)) * (n - 1);
    const i0 = Math.min(Math.floor(s), n - 2);
    const t = s - i0;
    const t2 = t * t;
    const t3 = t2 * t;
    const ws = [
      (-t3 + 2 * t2 - t) / 2,
      (3 * t3 - 5 * t2 + 2) / 2,
      (-3 * t3 + 4 * t2 + t) / 2,
      (t3 - t2) / 2,
    ];
    for (let m = 0; m < 4; m++) {
      idx[a * 4 + m] = clamp(i0 - 1 + m, 0, n - 1);
      w[a * 4 + m] = ws[m];
    }
  }
  return { idx, w };
}

export class PaperSheet {
  readonly cloth: Cloth;
  readonly painter: Painter;
  readonly geo: THREE.BufferGeometry;
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.MeshStandardMaterial;
  readonly uni: PaperUniforms;
  private maskTex: THREE.Texture | null = null;
  readonly comp = new Map<string, { v: number | null; ink: Ink }>();
  readonly RX: number;
  readonly RY: number;
  private crx: { idx: Int16Array; w: Float32Array };
  private cry: { idx: Int16Array; w: Float32Array };
  compInit = false;
  winKey = '';
  winInk: Ink | null = null;
  dirty = true;
  animating = false;
  offscreen = 0;
  focus: Spot | null = null;
  /**
   * Tekst wpisywany z klawiatury w zaznaczone pole (PAD-13, PAD-14): cyfry pojawiają się na
   * kartce od razu, zanim wpis zostanie zatwierdzony; `bad` to wpis spoza zakresu kategorii.
   */
  draft: { key: string; text: string; bad: boolean; ink: Ink } | null = null;

  constructor(
    readonly t: PadTemplate,
    public data: SheetData,
    readonly ps: PrintSet,
    readonly spec: Spec,
    padTop: number,
    backTex: THREE.Texture,
    lights: TransLight[],
    aniso: number,
    readonly cfg: Settings,
  ) {
    this.cloth = new Cloth(spec, padTop, cfg.physics);
    this.painter = new Painter(ps, aniso);
    this.RX = Math.min(64, (spec.NX - 1) * 3 + 1);
    this.RY = Math.min(64, (spec.NY - 1) * 3 + 1);
    this.crx = crTable(this.RX, spec.NX);
    this.cry = crTable(this.RY, spec.NY);
    const { RX, RY } = this;
    this.geo = new THREE.BufferGeometry();
    const pos = new Float32Array(RX * RY * 3);
    const uv = new Float32Array(RX * RY * 2);
    // współrzędne tekstury z położeń spoczynkowych — tekstura leży dokładnie na kartce
    this.interp(this.cloth.rest, pos, false);
    for (let k = 0; k < RX * RY; k++) {
      uv[k * 2] = clamp((pos[k * 3] + spec.W / 2) / spec.W, 0, 1);
      uv[k * 2 + 1] = clamp(1 - (pos[k * 3 + 2] + spec.H / 2) / spec.H, 0, 1);
    }
    const index: number[] = [];
    for (let b = 0; b < RY - 1; b++) {
      for (let a = 0; a < RX - 1; a++) {
        const v0 = b * RX + a;
        const v1 = v0 + RX;
        index.push(v0, v1, v0 + 1, v0 + 1, v1, v1 + 1);
      }
    }
    const pa = new THREE.BufferAttribute(pos, 3);
    pa.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', pa);
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geo.setIndex(index);
    const { mat, uni } = makePaperMaterial(this.painter.tex, backTex, lights);
    this.mat = mat;
    this.uni = uni;
    this.uni.uTrans.value = cfg.light.transmission;
    // notes klejony z lewej: treść leży na fizycznej kartce bokiem (tył i maska idą za mapą — wspólne vUv)
    rotateContent(this.painter.tex, spec.rot);
    if (spec.mask) {
      // kartka o niestandardowym kształcie: poza obrysem przezroczysta (także w cieniu)
      this.maskTex = spec.mask.texture();
      rotateContent(this.maskTex, spec.rot);
      mat.alphaMap = this.maskTex;
      mat.alphaTest = 0.5;
    }
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.castShadow = true;
    this.sync();
  }

  get resting(): boolean {
    return (
      !this.cloth.flying && this.cloth.grab < 0 && this.cloth.maxLift < 0.02 && !this.cloth.flipped
    );
  }

  private interp(P: Float32Array, out: Float32Array, clampFloor: boolean): void {
    const { RX, RY, crx, cry } = this;
    const { NX, NY } = this.spec;
    const cl = this.cloth;
    const floor = cl.floorY;
    const bx = cl.boxX;
    const zb = cl.boxBack;
    const zf = cl.boxFront;
    const tapeZ = cl.tapeEdge + 0.004;
    const tapeTop = cl.topAt(cl.boxBack);
    let v = 0;
    for (let b = 0; b < RY; b++) {
      const srcRow = (b / (RY - 1)) * (NY - 1);
      for (let a = 0; a < RX; a++) {
        let x = 0;
        let y = 0;
        let z = 0;
        for (let nn = 0; nn < 4; nn++) {
          const wyv = cry.w[b * 4 + nn];
          const row = cry.idx[b * 4 + nn] * NX;
          for (let m = 0; m < 4; m++) {
            const w = wyv * crx.w[a * 4 + m];
            const o = (row + crx.idx[a * 4 + m]) * 3;
            x += w * P[o];
            y += w * P[o + 1];
            z += w * P[o + 2];
          }
        }
        if (clampFloor) {
          // wygładzona powierzchnia nie może wejść w bloczek, taśmę ani blat
          if (Math.abs(x) <= bx && z >= zb && z <= zf) {
            if (z >= tapeZ) {
              if (y < floor) y = floor;
            } else if (srcRow > 2.2 && y < tapeTop) y = tapeTop;
          } else if (y < 0.002) y = 0.002;
        }
        out[v++] = x;
        out[v++] = y;
        out[v++] = z;
      }
    }
  }

  sync(): void {
    const out = (this.geo.attributes.position as THREE.BufferAttribute).array as Float32Array;
    this.interp(this.cloth.pos, out, !this.cloth.flying);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
    this.cloth.moved = false;
  }

  paint(now: number): void {
    this.animating = this.painter.paint(this, now);
    this.dirty = false;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
    this.maskTex?.dispose();
    this.painter.dispose();
  }
}
