// Symulacja kartki papieru: Verlet + więzy odległości, ścinania i zginania, opór powietrza, wiatr.

import * as THREE from 'three';
import type { PadTemplate } from './templates';
import { LIFT_EPS, UNIT, clamp, lerp, smooth } from './util';
import type { Settings } from './settings';
import { DEFAULTS } from './settings';
import type { SheetArea } from './shape';
import { ShapeMask, physArea } from './shape';

export type PhysicsCfg = Settings['physics'];

export interface Spec {
  W: number;
  H: number;
  NX: number;
  NY: number;
  DX: number;
  zr: Float32Array; // odległość wiersza od górnej krawędzi
  tapeD: number;
  glue: number; // ułamek wysokości kartki ukryty pod taśmą
  /** Maska kartki o niestandardowym kształcie (we współrzędnych treści, jak tekstura). */
  mask?: ShapeMask;
  /** Ta sama maska w układzie fizycznym (taśma u góry). */
  area?: SheetArea;
  /** Notes klejony z lewej: fizyczna kartka to treść obrócona o 90° (W i H zamienione). */
  rot: boolean;
}

/** Odwrotność masy węzła poza papierem: lekki „duch” podąża za kartką, prawie jej nie ciągnąc. */
const GHOST = 14;

export function makeSpec(t: PadTemplate): Spec {
  const rot = t.binding === 'left';
  const W = (rot ? t.size.h : t.size.w) * UNIT;
  const H = (rot ? t.size.w : t.size.h) * UNIT;
  const cell = Math.max(W, H) / 18;
  const NX = clamp(Math.round(W / cell) + 1, 8, 22);
  const NY = clamp(Math.round(H / cell) + 1, 8, 22);
  const gb = clamp(H * 0.03, 0.06, 0.14);
  const tapeD = gb + 0.014;
  // zawias leży tuż pod krawędzią taśmy: kartka wychodzi spod niej i tam się zgina
  const hinge = tapeD - 0.003;
  const zr = new Float32Array(NY);
  zr[1] = hinge;
  for (let j = 2; j < NY; j++) zr[j] = hinge + ((j - 1) * (H - hinge)) / (NY - 2);
  const mask = t.shape
    ? new ShapeMask(t.shape, t.size.w / t.size.h, 1024, rot ? 'left' : 'top')
    : undefined;
  return {
    W,
    H,
    NX,
    NY,
    DX: W / (NX - 1),
    zr,
    tapeD,
    glue: tapeD / H,
    mask,
    area: mask && physArea(mask, rot),
    rot,
  };
}

/** Wiersz siatki (ułamkowy) dla współrzędnej v tekstury (v = 1 u góry). */
export function rowOfV(s: Spec, v: number): number {
  const z = clamp(1 - v, 0, 1) * s.H;
  for (let j = 0; j < s.NY - 1; j++)
    if (z <= s.zr[j + 1]) return j + (z - s.zr[j]) / (s.zr[j + 1] - s.zr[j]);
  return s.NY - 1;
}

export class Cloth {
  readonly s: Spec;
  readonly n: number;
  readonly pos: Float32Array;
  readonly prev: Float32Array;
  readonly rest: Float32Array;
  readonly acc: Float32Array;
  readonly inv: Float32Array;
  readonly glued: boolean[] = [];
  /** Kolumny, w których kartka sięga taśmy (tylko tam jest klej). */
  readonly glueAt: boolean[] = [];
  readonly glueCols: number;
  /** Bazowa odwrotność masy węzła (1 papier, GHOST poza kartką). */
  readonly wgt: Float32Array;
  /** 1 = węzeł należy do papieru (któraś z sąsiednich komórek ma papier). */
  readonly real: Uint8Array;
  /** Ułamek papieru w każdej komórce siatki (opór powietrza). */
  readonly cov: Float32Array;
  readonly damage: Float32Array;
  readonly ca: Uint16Array;
  readonly cb: Uint16Array;
  readonly len: Float32Array;
  readonly k: Float32Array;
  /** Rodzaj więzu: 0 rozciąganie, 1 ścinanie, 2 zginanie, 3 zginanie po przekątnej, 4 łuk. */
  readonly kind: Uint8Array;
  cfg: PhysicsCfg;
  padTop: number;
  flying = false;
  flyT = 0;
  grab = -1;
  readonly gFrom: THREE.Vector3 = new THREE.Vector3();
  readonly gTo: THREE.Vector3 = new THREE.Vector3();
  hover = -1;
  hoverAmt = 0;
  hoverWant = 0;
  sleeping = false;
  quiet = 0;
  maxLift = 0;
  moved = true;
  time = 0;
  readonly wind: THREE.Vector3 = new THREE.Vector3(0.95, 0.6, -0.45).normalize();

  constructor(spec: Spec, padTop: number, cfg: PhysicsCfg = DEFAULTS.physics) {
    this.s = spec;
    this.cfg = cfg;
    const { NX, NY, W, H, DX, zr } = spec;
    this.n = NX * NY;
    this.pos = new Float32Array(this.n * 3);
    this.prev = new Float32Array(this.n * 3);
    this.rest = new Float32Array(this.n * 3);
    this.acc = new Float32Array(this.n * 3);
    this.inv = new Float32Array(this.n);
    this.damage = new Float32Array(NX);
    this.padTop = padTop;
    // papier w komórkach siatki — przy zwykłym prostokącie wszędzie 1
    this.cov = new Float32Array((NX - 1) * (NY - 1)).fill(1);
    this.real = new Uint8Array(this.n).fill(1);
    this.wgt = new Float32Array(this.n).fill(1);
    const mask = spec.area;
    if (mask) {
      this.real.fill(0);
      for (let j = 0; j < NY - 1; j++) {
        for (let i = 0; i < NX - 1; i++) {
          const c = mask.coverage(i / (NX - 1), zr[j] / H, (i + 1) / (NX - 1), zr[j + 1] / H);
          this.cov[j * (NX - 1) + i] = c;
          if (c > 0.002) {
            const a = j * NX + i;
            this.real[a] = this.real[a + 1] = this.real[a + NX] = this.real[a + NX + 1] = 1;
          }
        }
      }
      for (let p = 0; p < this.n; p++) this.wgt[p] = this.real[p] ? 1 : GHOST;
    }
    for (let i = 0; i < NX; i++) {
      const du = 0.5 / (NX - 1);
      const u = i / (NX - 1);
      this.glueAt.push(
        !mask ||
          mask.coverage(
            Math.max(0, u - du),
            0,
            Math.min(1, u + du),
            Math.max(zr[1], spec.tapeD - 0.004) / H,
          ) > 0.15,
      );
    }
    // kartka, która nigdzie nie sięga taśmy, i tak musi się jej trzymać
    if (!this.glueAt.some(Boolean)) this.glueAt.fill(true);
    this.glueCols = this.glueAt.filter(Boolean).length;
    const y = padTop + LIFT_EPS;
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const id = j * NX + i;
        const o = id * 3;
        this.rest[o] = this.pos[o] = this.prev[o] = -W / 2 + i * DX;
        this.rest[o + 1] = this.pos[o + 1] = this.prev[o + 1] = y;
        this.rest[o + 2] = this.pos[o + 2] = this.prev[o + 2] = -H / 2 + zr[j];
        this.inv[id] = j < 2 && this.glueAt[i] ? 0 : this.wgt[id];
      }
    }
    for (let i = 0; i < NX; i++) this.glued.push(this.glueAt[i]);
    const A: number[] = [];
    const B: number[] = [];
    const K: number[] = [];
    const add = (a: number, b: number, kind: number): void => {
      A.push(a);
      B.push(b);
      K.push(kind);
    };
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const id = j * NX + i;
        if (i + 1 < NX) add(id, id + 1, 0);
        if (j + 1 < NY) add(id, id + NX, 0);
        if (i + 1 < NX && j + 1 < NY) {
          add(id, id + NX + 1, 1);
          add(id + 1, id + NX, 1);
        }
        if (i + 2 < NX) add(id, id + 2, 2);
        if (j + 2 < NY) add(id, id + 2 * NX, 2);
        if (i + 2 < NX && j + 2 < NY) {
          add(id, id + 2 * NX + 2, 3);
          add(id + 2, id + 2 * NX, 3);
        }
        if (i + 4 < NX) add(id, id + 4, 4);
        if (j + 4 < NY) add(id, id + 4 * NX, 4);
      }
    }
    this.ca = Uint16Array.from(A);
    this.cb = Uint16Array.from(B);
    this.kind = Uint8Array.from(K);
    this.k = new Float32Array(A.length);
    this.applyStiffness();
    this.len = new Float32Array(A.length);
    for (let c = 0; c < A.length; c++) {
      const a = A[c] * 3;
      const b = B[c] * 3;
      this.len[c] = Math.hypot(
        this.rest[b] - this.rest[a],
        this.rest[b + 1] - this.rest[a + 1],
        this.rest[b + 2] - this.rest[a + 2],
      );
    }
  }

  /** Przelicza sztywność więzów z ustawień (po zmianie w trybie debugowania). */
  applyStiffness(): void {
    const c = this.cfg;
    const table = [1, 0.9, c.bend, c.bend * 0.6, c.bendLong];
    for (let i = 0; i < this.kind.length; i++) this.k[i] = table[this.kind[i]];
    this.wake();
  }

  get floorY(): number {
    return this.padTop + LIFT_EPS;
  }

  /** z zawiasu (wiersz tuż pod taśmą) */
  get hingeZ(): number {
    return -this.s.H / 2 + this.s.zr[1];
  }

  // ─── bryła bloczka z taśmą na grzbiecie (kartka nie może przez nią przenikać)
  get boxX(): number {
    return this.s.W / 2 + 0.013;
  }
  get boxBack(): number {
    return -this.s.H / 2 - 0.016;
  }
  get boxFront(): number {
    return this.s.H / 2 + 0.004;
  }
  get tapeEdge(): number {
    return -this.s.H / 2 + this.s.tapeD;
  }
  /** Wysokość wierzchu bryły w danym miejscu (taśma jest grubsza). */
  topAt(z: number): number {
    return z < this.tapeEdge + 0.004 ? this.padTop + 0.0165 : this.padTop + LIFT_EPS;
  }
  inBox(x: number, z: number): boolean {
    return Math.abs(x) <= this.boxX && z >= this.boxBack && z <= this.boxFront;
  }
  /** Wysokość podłoża pod punktem (wierzch bloczka albo blat). */
  floorAt(x: number, z: number): number {
    if (this.flying) return 0.004;
    return this.inBox(x, z) ? this.topAt(z) : 0.003;
  }

  /** Wypycha punkt z bryły bloczka (dla celu przeciągania). */
  clampPoint(v: THREE.Vector3): void {
    if (this.flying) {
      if (v.y < 0.004) v.y = 0.004;
      return;
    }
    if (this.inBox(v.x, v.z)) {
      const top = this.topAt(v.z);
      if (v.y < top) v.y = top;
    } else if (v.y < 0.003) v.y = 0.003;
  }

  wake(): void {
    this.sleeping = false;
    this.quiet = 0;
  }

  startGrab(idx: number, at: THREE.Vector3): void {
    this.wake();
    this.grab = idx;
    this.inv[idx] = 0;
    this.gFrom.copy(at);
    this.gTo.copy(at);
  }

  setTarget(t: THREE.Vector3): void {
    this.gFrom.copy(this.gTo);
    this.gTo.copy(t);
  }

  endGrab(): void {
    if (this.grab >= 0) this.inv[this.grab] = this.wgt[this.grab];
    this.grab = -1;
    this.wake();
  }

  release(i: number): void {
    if (!this.glued[i]) return;
    this.glued[i] = false;
    this.inv[i] = this.wgt[i];
    this.inv[this.s.NX + i] = this.wgt[this.s.NX + i];
    this.wake();
  }

  /** Ile kolumn z klejem już puściło. */
  releasedCount(): number {
    let n = 0;
    for (let i = 0; i < this.glued.length; i++) if (this.glueAt[i] && !this.glued[i]) n++;
    return n;
  }

  /** Czy sąsiednia kolumna z klejem (z pominięciem przerw bez papieru) już puściła. */
  neighbourReleased(i: number): boolean {
    for (const dir of [-1, 1]) {
      for (let k = i + dir; k >= 0 && k < this.glueAt.length; k += dir) {
        if (!this.glueAt[k]) continue;
        if (!this.glued[k]) return true;
        break;
      }
    }
    return false;
  }

  pointAt(u: number, v: number, out: THREE.Vector3): THREE.Vector3 {
    const { NX, NY } = this.s;
    const fx = clamp(u, 0, 1) * (NX - 1);
    const fy = rowOfV(this.s, v);
    const i = Math.min(Math.floor(fx), NX - 2);
    const j = Math.min(Math.floor(fy), NY - 2);
    const tx = fx - i;
    const ty = fy - j;
    const P = this.pos;
    const a = (j * NX + i) * 3;
    const b = a + 3;
    const c = a + NX * 3;
    const d = c + 3;
    for (let k = 0; k < 3; k++)
      out.setComponent(k, lerp(lerp(P[a + k], P[b + k], tx), lerp(P[c + k], P[d + k], tx), ty));
    return out;
  }

  step(dt: number, alpha: number): void {
    if (this.sleeping) return;
    this.time += dt;
    if (this.flying) this.flyT += dt;
    const { pos, prev, inv, acc, n } = this;
    acc.fill(0);
    this.aero(dt);
    // pamięć kształtu: kartka sklejona w bloczku wraca na swoje miejsce, gdy nikt jej nie trzyma
    if (!this.flying && this.grab < 0) {
      const R = this.rest;
      const K = this.flipped ? this.cfg.memoryFlipped : this.cfg.memory;
      for (let p = 0; p < n; p++) {
        if (inv[p] === 0) continue;
        const o = p * 3;
        acc[o] += (R[o] - pos[o]) * K;
        acc[o + 1] += (R[o + 1] - pos[o + 1]) * K;
        acc[o + 2] += (R[o + 2] - pos[o + 2]) * K;
      }
    }
    const grav = this.flying ? this.cfg.gravity * 0.3 : this.cfg.gravity;
    const damp = this.flying ? Math.max(this.cfg.damping, 0.999) : this.cfg.damping;
    const dt2 = dt * dt;
    for (let p = 0; p < n; p++) {
      if (inv[p] === 0) continue;
      const o = p * 3;
      const vx = (pos[o] - prev[o]) * damp;
      const vy = (pos[o + 1] - prev[o + 1]) * damp;
      const vz = (pos[o + 2] - prev[o + 2]) * damp;
      prev[o] = pos[o];
      prev[o + 1] = pos[o + 1];
      prev[o + 2] = pos[o + 2];
      pos[o] += vx + acc[o] * dt2;
      pos[o + 1] += vy + (acc[o + 1] - grav) * dt2;
      pos[o + 2] += vz + acc[o + 2] * dt2;
    }
    let gx = 0;
    let gy = 0;
    let gz = 0;
    if (this.grab >= 0) {
      gx = lerp(this.gFrom.x, this.gTo.x, alpha);
      gy = lerp(this.gFrom.y, this.gTo.y, alpha);
      gz = lerp(this.gFrom.z, this.gTo.z, alpha);
      const o = this.grab * 3;
      prev[o] = pos[o];
      prev[o + 1] = pos[o + 1];
      prev[o + 2] = pos[o + 2];
    }
    if (this.hover >= 0 && this.hoverAmt > 0.001 && this.grab < 0) {
      const o = this.hover * 3;
      pos[o + 1] += (this.floorY + 0.095 * this.hoverAmt - pos[o + 1]) * 0.4;
    }
    const iters = Math.max(1, Math.round(this.cfg.iterations));
    for (let it = 0; it < iters; it++) {
      this.solve();
      if (this.grab >= 0) {
        const o = this.grab * 3;
        pos[o] = gx;
        pos[o + 1] = gy;
        pos[o + 2] = gz;
      }
      this.collide(it === iters - 1);
    }
    let maxMove = 0;
    let maxY = -1e9;
    for (let p = 0; p < n; p++) {
      const o = p * 3;
      const m =
        Math.abs(pos[o] - prev[o]) +
        Math.abs(pos[o + 1] - prev[o + 1]) +
        Math.abs(pos[o + 2] - prev[o + 2]);
      if (m > maxMove) maxMove = m;
      if (pos[o + 1] > maxY) maxY = pos[o + 1];
    }
    this.maxLift = maxY - this.floorY;
    this.moved = true;
    if (!this.flying && this.grab < 0 && this.hoverAmt < 0.001) {
      if (maxMove < 2e-5) {
        if (++this.quiet > 50) this.sleeping = true;
      } else this.quiet = 0;
    }
  }

  /** Kartka przewrócona za grzbiet (leży tyłem do góry). */
  get flipped(): boolean {
    const { NX, NY } = this.s;
    const o = ((NY - 1) * NX + (NX >> 1)) * 3;
    return this.pos[o + 2] < this.hingeZ;
  }

  private solve(): void {
    const { pos, inv, ca, cb, len, k } = this;
    for (let c = 0, nc = ca.length; c < nc; c++) {
      const a = ca[c];
      const b = cb[c];
      const wa = inv[a];
      const wb = inv[b];
      const w = wa + wb;
      if (w === 0) continue;
      const oa = a * 3;
      const ob = b * 3;
      const dx = pos[ob] - pos[oa];
      const dy = pos[ob + 1] - pos[oa + 1];
      const dz = pos[ob + 2] - pos[oa + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < 1e-9) continue;
      const s = ((d - len[c]) / (d * w)) * k[c];
      pos[oa] += dx * s * wa;
      pos[oa + 1] += dy * s * wa;
      pos[oa + 2] += dz * s * wa;
      pos[ob] -= dx * s * wb;
      pos[ob + 1] -= dy * s * wb;
      pos[ob + 2] -= dz * s * wb;
    }
  }

  private collide(last: boolean): void {
    const { pos, prev, inv, n } = this;
    const bx = this.boxX;
    const zb = this.boxBack;
    const zf = this.boxFront;
    for (let p = 0; p < n; p++) {
      if (inv[p] === 0) continue;
      const o = p * 3;
      const x = pos[o];
      const y = pos[o + 1];
      const z = pos[o + 2];
      if (this.flying || !this.inBox(x, z)) {
        const fl = this.flying ? 0.004 : 0.003;
        if (y < fl) {
          pos[o + 1] = fl;
          if (last) this.friction(o);
        }
        continue;
      }
      const top = this.topAt(z);
      if (y >= top) continue;
      // punkt wszedł w bryłę: wypchnij go ścianą, przez którą wszedł
      const px = prev[o];
      const py = prev[o + 1];
      const pz = prev[o + 2];
      let face: 'up' | 'back' | 'front' | 'left' | 'right';
      if (pz < zb) face = 'back';
      else if (pz > zf) face = 'front';
      else if (px < -bx) face = 'left';
      else if (px > bx) face = 'right';
      else if (py >= this.topAt(pz) - 0.004) face = 'up';
      else {
        const d = { up: top - y, back: z - zb, front: zf - z, left: x + bx, right: bx - x };
        face = (Object.keys(d) as (keyof typeof d)[]).reduce((a, b) => (d[a] <= d[b] ? a : b));
      }
      if (face === 'up') {
        pos[o + 1] = top;
        if (last) this.friction(o);
      } else if (face === 'back') pos[o + 2] = zb - 0.001;
      else if (face === 'front') pos[o + 2] = zf + 0.001;
      else if (face === 'left') pos[o] = -bx - 0.001;
      else pos[o] = bx + 0.001;
    }
  }

  private friction(o: number): void {
    const { pos, prev } = this;
    prev[o] = pos[o] - (pos[o] - prev[o]) * 0.35;
    prev[o + 2] = pos[o + 2] - (pos[o + 2] - prev[o + 2]) * 0.35;
    prev[o + 1] = pos[o + 1];
  }

  private aero(dt: number): void {
    const { NX, NY } = this.s;
    const S = this.flying ? this.cfg.wind * smooth(clamp(this.flyT / 0.7, 0, 1)) : 0;
    const invDt = 1 / dt;
    for (let j = 0; j < NY - 1; j++) {
      for (let i = 0; i < NX - 1; i++) {
        const cv = this.cov[j * (NX - 1) + i];
        if (cv <= 0.002) continue;
        const a = j * NX + i;
        this.tri(a, a + NX, a + 1, S, invDt, cv);
        this.tri(a + 1, a + NX, a + NX + 1, S, invDt, cv);
      }
    }
  }

  private tri(a: number, b: number, c: number, S: number, invDt: number, cv: number): void {
    const P = this.pos;
    const Q = this.prev;
    const A = this.acc;
    const oa = a * 3;
    const ob = b * 3;
    const oc = c * 3;
    const e1x = P[ob] - P[oa];
    const e1y = P[ob + 1] - P[oa + 1];
    const e1z = P[ob + 2] - P[oa + 2];
    const e2x = P[oc] - P[oa];
    const e2y = P[oc + 1] - P[oa + 1];
    const e2z = P[oc + 2] - P[oa + 2];
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (nl < 1e-12) return;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    const k3 = invDt / 3;
    const vx = (P[oa] - Q[oa] + P[ob] - Q[ob] + P[oc] - Q[oc]) * k3;
    const vy = (P[oa + 1] - Q[oa + 1] + P[ob + 1] - Q[ob + 1] + P[oc + 1] - Q[oc + 1]) * k3;
    const vz = (P[oa + 2] - Q[oa + 2] + P[ob + 2] - Q[ob + 2] + P[oc + 2] - Q[oc + 2]) * k3;
    let wx = 0;
    let wy = 0;
    let wz = 0;
    if (S > 0) {
      const cx = (P[oa] + P[ob] + P[oc]) / 3;
      const cy = (P[oa + 1] + P[ob + 1] + P[oc + 1]) / 3;
      const cz = (P[oa + 2] + P[ob + 2] + P[oc + 2]) / 3;
      const t = this.time;
      const tx = Math.sin(cy * 1.7 + t * 4.3) + 0.6 * Math.sin(cz * 2.1 - t * 3.1);
      const ty = 0.8 * Math.sin(cx * 1.9 + t * 3.6);
      const tz = Math.cos(cx * 1.3 - t * 2.7) + 0.5 * Math.sin(cy * 2.6 + t * 5.3);
      wx = this.wind.x * S + tx * S * 0.32;
      wy = this.wind.y * S + ty * S * 0.32;
      wz = this.wind.z * S + tz * S * 0.32;
    }
    const rx = vx - wx;
    const ry = vy - wy;
    const rz = vz - wz;
    const f = (-this.cfg.air * cv * (rx * nx + ry * ny + rz * nz)) / 3;
    let fx = nx * f;
    let fy = ny * f;
    let fz = nz * f;
    if (S > 0) {
      fx -= rx * 0.55 * cv;
      fy -= ry * 0.55 * cv;
      fz -= rz * 0.55 * cv;
    }
    A[oa] += fx;
    A[oa + 1] += fy;
    A[oa + 2] += fz;
    A[ob] += fx;
    A[ob + 1] += fy;
    A[ob + 2] += fz;
    A[oc] += fx;
    A[oc + 1] += fy;
    A[oc + 2] += fz;
  }
}
