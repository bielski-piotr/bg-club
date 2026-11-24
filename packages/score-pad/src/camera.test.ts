import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM,
  clonePose,
  eyeOf,
  lerpPose,
  panPose,
  poseLookingAt,
  twoFinger,
  zoomPose,
} from './core/camera';
import { texSize } from './core/print';
import type { PadTemplate } from './core/templates';

/** Widok z góry jak w notesie: kamera nad punktem (0, top, 0), góra kadru w stronę −Z (grzbiet). */
function topView(dist = 10, top = 0.2) {
  return poseLookingAt(
    new THREE.Vector3(0, top + dist, 0),
    new THREE.Vector3(0, top, 0),
    new THREE.Vector3(0, 0, -1),
  );
}

/** Widok pod kątem: kamera odchylona od pionu w stronę widza (+Z). */
function angledView(deg: number, dist = 10, top = 0.2) {
  const a = THREE.MathUtils.degToRad(deg);
  return poseLookingAt(
    new THREE.Vector3(0, top + dist * Math.cos(a), dist * Math.sin(a)),
    new THREE.Vector3(0, top, 0),
    new THREE.Vector3(0, 0, -1),
  );
}

const FOV = 30;
const SIZE = 600;

function project(pose: ReturnType<typeof topView>, point: THREE.Vector3) {
  const cam = new THREE.PerspectiveCamera(FOV, 1, 0.01, 100);
  eyeOf(pose, cam.position);
  cam.quaternion.copy(pose.quat);
  cam.updateMatrixWorld();
  return point.clone().project(cam);
}

describe('kamera notesu (PAD-11, PAD-12)', () => {
  it('widok z góry patrzy prostopadle w dół z zadanej odległości', () => {
    const p = topView(10);
    const eye = eyeOf(p);
    expect(eye.x).toBeCloseTo(0);
    expect(eye.y).toBeCloseTo(10.2);
    expect(eye.z).toBeCloseTo(0);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quat);
    expect(fwd.y).toBeCloseTo(-1);
  });

  it('widok pod kątem patrzy w dół, lekko od strony widza', () => {
    const p = angledView(10);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quat);
    expect(fwd.y).toBeCloseTo(-Math.cos(THREE.MathUtils.degToRad(10)));
    expect(fwd.z).toBeLessThan(0);
    expect(eyeOf(p).distanceTo(new THREE.Vector3(0, 0.2, 0))).toBeCloseTo(10);
  });

  it('zoom zostawia punkt pod kursorem w tym samym miejscu kadru i ma granice', () => {
    const p = topView(10);
    const point = new THREE.Vector3(1.2, 0.2, 0.7);
    const before = project(p, point);
    const k = zoomPose(p, point, 0.25, 10 / MAX_ZOOM, 12);
    expect(k).toBeCloseTo(0.25);
    expect(p.dist).toBeCloseTo(2.5);
    const after = project(p, point);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    // dalsze przybliżanie zatrzymuje się na MAX_ZOOM (co najmniej 6×)
    zoomPose(p, point, 0.01, 10 / MAX_ZOOM, 12);
    expect(p.dist).toBeCloseTo(10 / MAX_ZOOM);
    expect(MAX_ZOOM).toBeGreaterThanOrEqual(6);
    zoomPose(p, point, 100, 10 / MAX_ZOOM, 12);
    expect(p.dist).toBeCloseTo(12);
  });

  it('zoom i przesunięcie nie zmieniają orientacji kamery', () => {
    const p = angledView(10);
    const q = p.quat.clone();
    zoomPose(p, new THREE.Vector3(0.5, 0.2, 0.3), 0.4, 1, 20);
    panPose(p, 40, -25, p.dist, FOV, SIZE);
    expect(p.quat.angleTo(q)).toBeLessThan(1e-9);
  });

  it('przesunięcie o piksele przesuwa punkt na płaszczyźnie kartki o tyle samo pikseli', () => {
    const p = topView(10);
    const point = new THREE.Vector3(0.4, 0.2, -0.3);
    const before = project(p, point);
    // kamera w prawo i w dół o 60 i 30 px: punkt na ekranie idzie w lewo i w górę
    panPose(p, 60, 30, 10, FOV, SIZE);
    const after = project(p, point);
    expect(((before.x - after.x) * SIZE) / 2).toBeCloseTo(60, 4);
    expect(((after.y - before.y) * SIZE) / 2).toBeCloseTo(30, 4);
  });

  it('płynne przejście do widoku domyślnego kończy się dokładnie w nim', () => {
    const home = topView(10);
    const from = angledView(10);
    zoomPose(from, new THREE.Vector3(0.5, 0.2, 0), 0.3, 1, 20);
    const out = clonePose(from);
    lerpPose(from, home, 0.5, out);
    expect(out.dist).toBeGreaterThan(Math.min(from.dist, home.dist));
    expect(out.dist).toBeLessThan(Math.max(from.dist, home.dist));
    lerpPose(from, home, 1, out);
    expect(eyeOf(out).distanceTo(eyeOf(home))).toBeLessThan(1e-6);
    expect(out.quat.angleTo(home.quat)).toBeLessThan(1e-6);
  });

  it('gest dwoma palcami: przesunięcie środka i szczypanie', () => {
    const m = twoFinger(
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 110, y: 90 },
      { x: 110, y: 290 },
    );
    expect(m.dx).toBeCloseTo((110 + 110 - 100 - 200) / 2);
    expect(m.dy).toBeCloseTo((90 + 290 - 200) / 2);
    expect(m.scale).toBeCloseTo(2);
    expect(m).toMatchObject({ x: 110, y: 190 });
  });
});

describe('tekstura kartki (PAD-16)', () => {
  const photo = { size: { w: 10, h: 14 }, image: 'data:' } as PadTemplate;

  it('ma rozdzielczość zdjęcia z edytora, bez zmniejszania do 1600 px', () => {
    expect(texSize(photo, 4096, 4096)).toEqual([Math.round(4096 * (10 / 14)), 4096]);
    expect(texSize(photo, 3000, 16384)).toEqual([Math.round(3000 * (10 / 14)), 3000]);
  });

  it('nie przekracza maxTextureSize urządzenia ani 4096 px', () => {
    expect(texSize(photo, 4096, 2048)[1]).toBe(2048);
    expect(texSize({ ...photo, size: { w: 20, h: 10 } }, 5000, 4096)).toEqual([4096, 2048]);
  });

  it('małe zdjęcie dostaje co najmniej 1600 px, żeby pismo było czytelne', () => {
    expect(texSize(photo, 900, 4096)[1]).toBe(1600);
  });
});
