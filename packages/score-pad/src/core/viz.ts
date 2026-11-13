// Podgląd fizyki w scenie (tryb debugowania): węzły i więzy kartki oraz bryła kolizji.

import * as THREE from 'three';
import type { Cloth } from './cloth';

/** Podgląd fizyki w scenie: węzły i więzy kartki oraz bryła, z którą kartka się zderza. */
export class DebugViz {
  readonly group = new THREE.Group();
  private pts: THREE.Points | null = null;
  private lines: THREE.LineSegments | null = null;
  private box: THREE.LineSegments | null = null;
  private tape: THREE.LineSegments | null = null;
  private cloth: Cloth | null = null;
  private segs: Uint16Array = new Uint16Array(0);

  constructor() {
    this.group.renderOrder = 20;
  }

  setCloth(cl: Cloth | null): void {
    if (cl === this.cloth) return;
    this.cloth = cl;
    for (const o of [this.pts, this.lines]) {
      if (!o) continue;
      this.group.remove(o);
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
    this.pts = this.lines = null;
    if (!cl) return;
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cl.n * 3), 3));
    pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cl.n * 3), 3));
    this.pts = new THREE.Points(
      pg,
      new THREE.PointsMaterial({
        size: 6,
        sizeAttenuation: false,
        vertexColors: true,
        depthTest: false,
        transparent: true,
      }),
    );
    this.pts.renderOrder = 21;
    // tylko więzy rozciągania (siatka), żeby obraz był czytelny
    const idx: number[] = [];
    for (let c = 0; c < cl.kind.length; c++) if (cl.kind[c] === 0) idx.push(cl.ca[c], cl.cb[c]);
    this.segs = Uint16Array.from(idx);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(this.segs.length * 3), 3),
    );
    this.lines = new THREE.LineSegments(
      lg,
      new THREE.LineBasicMaterial({
        color: 0x4fd1ff,
        transparent: true,
        opacity: 0.55,
        depthTest: false,
      }),
    );
    this.lines.renderOrder = 20;
    this.group.add(this.lines, this.pts);
    this.rebuildCollider();
  }

  rebuildCollider(): void {
    const cl = this.cloth;
    for (const o of [this.box, this.tape]) {
      if (!o) continue;
      this.group.remove(o);
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
    this.box = this.tape = null;
    if (!cl) return;
    const mat = (c: number): THREE.LineBasicMaterial =>
      new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.9, depthTest: false });
    const w = cl.boxX * 2;
    const top = cl.topAt(cl.boxFront);
    const d = cl.boxFront - cl.boxBack;
    this.box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(w, top, d)),
      mat(0xffa94d),
    );
    this.box.position.set(0, top / 2, (cl.boxFront + cl.boxBack) / 2);
    const tt = cl.topAt(cl.boxBack);
    const td = cl.tapeEdge + 0.004 - cl.boxBack;
    this.tape = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(w, tt, td)),
      mat(0xff6b6b),
    );
    this.tape.position.set(0, tt / 2, cl.boxBack + td / 2);
    this.box.renderOrder = this.tape.renderOrder = 19;
    this.group.add(this.box, this.tape);
  }

  show(particles: boolean, collider: boolean): void {
    if (this.pts) this.pts.visible = particles;
    if (this.lines) this.lines.visible = particles;
    if (this.box) this.box.visible = collider;
    if (this.tape) this.tape.visible = collider;
    this.group.visible = particles || collider;
  }

  update(): void {
    const cl = this.cloth;
    if (!cl || !this.pts || !this.lines || !this.pts.visible) return;
    const P = cl.pos;
    const pa = this.pts.geometry.attributes.position as THREE.BufferAttribute;
    const ca = this.pts.geometry.attributes.color as THREE.BufferAttribute;
    (pa.array as Float32Array).set(P);
    const col = ca.array as Float32Array;
    for (let i = 0; i < cl.n; i++) {
      const pinned = cl.inv[i] === 0;
      if (!cl.real[i] && !pinned && i !== cl.grab) {
        // węzeł poza kształtem kartki („duch”)
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0.35;
        continue;
      }
      const grabbed = i === cl.grab;
      col[i * 3] = grabbed ? 1 : pinned ? 1 : 0.92;
      col[i * 3 + 1] = grabbed ? 0.85 : pinned ? 0.3 : 0.96;
      col[i * 3 + 2] = grabbed ? 0.2 : pinned ? 0.3 : 1;
    }
    pa.needsUpdate = true;
    ca.needsUpdate = true;
    const la = this.lines.geometry.attributes.position as THREE.BufferAttribute;
    const L = la.array as Float32Array;
    for (let k = 0; k < this.segs.length; k++) {
      const o = this.segs[k] * 3;
      L[k * 3] = P[o];
      L[k * 3 + 1] = P[o + 1];
      L[k * 3 + 2] = P[o + 2];
    }
    la.needsUpdate = true;
    this.pts.geometry.computeBoundingSphere();
    this.lines.geometry.computeBoundingSphere();
  }
}
