import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM,
  clonePose,
  eyeOf,
  lerpPose,
  poseLookingAt,
  rotatePose,
  seesTop,
  twoFinger,
  zoomPose,
} from './core/orbit';
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

function project(pose: ReturnType<typeof topView>, point: THREE.Vector3) {
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
  eyeOf(pose, cam.position);
  cam.quaternion.copy(pose.quat);
  cam.updateMatrixWorld();
  return point.clone().project(cam);
}

describe('kamera notesu', () => {
  it('widok z góry patrzy prostopadle w dół z zadanej odległości', () => {
    const p = topView(10);
    const eye = eyeOf(p);
    expect(eye.x).toBeCloseTo(0);
    expect(eye.y).toBeCloseTo(10.2);
    expect(eye.z).toBeCloseTo(0);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quat);
    expect(fwd.y).toBeCloseTo(-1);
    expect(seesTop(eye, 0.2)).toBe(true);
  });

  it('obrót nie ma ograniczeń: pionowy ruch pokazuje tył notesu i wraca na wierzch', () => {
    const p = topView(10);
    // pół obrotu w pionie: kamera pod notesem, patrzy w górę
    rotatePose(p, 0, Math.PI, 0);
    const below = eyeOf(p);
    expect(below.y).toBeLessThan(0);
    expect(seesTop(below, 0.2)).toBe(false);
    // drugie pół: z powrotem nad notesem
    rotatePose(p, 0, Math.PI, 0);
    expect(eyeOf(p).y).toBeCloseTo(10.2);
    expect(p.dist).toBeCloseTo(10);
  });

  it('poziomy ruch obraca notes w kierunku ruchu, a skręt wokół osi patrzenia', () => {
    const p = topView(10);
    const before = project(p, new THREE.Vector3(1, 0.2, 0));
    const raised = new THREE.Vector3(0, 1.2, 0);
    expect(project(p, raised).x).toBeCloseTo(0, 6);
    rotatePose(p, 0.3, 0, 0);
    // ruch w prawo obraca notes w prawo: bliższa widzowi część (punkt nad środkiem) idzie w prawo
    expect(project(p, raised).x).toBeGreaterThan(0.05);
    // ruch w dół nachyla notes jak chwycony: bliższa część idzie w dół, grzbiet przechyla się do
    // widza
    const t = topView(10);
    rotatePose(t, 0, 0.3, 0);
    expect(project(t, raised).y).toBeLessThan(-0.05);

    const q = topView(10);
    rotatePose(q, 0, 0, Math.PI / 2);
    const after = project(q, new THREE.Vector3(1, 0.2, 0));
    // skręt o 90° zgodnie ze wskazówkami zegara: punkt z prawej trafia na dół kadru
    expect(after.x).toBeCloseTo(0, 5);
    expect(after.y).toBeLessThan(0);
    expect(Math.abs(after.y)).toBeCloseTo(Math.abs(before.x), 5);
    // obrót wokół osi patrzenia nie zmienia położenia kamery
    expect(eyeOf(q).y).toBeCloseTo(10.2);
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

  it('powrót do widoku z góry przechodzi płynnie i kończy się dokładnie w nim', () => {
    const home = topView(10);
    const from = topView(10);
    rotatePose(from, 1.1, -0.7, 0.4);
    zoomPose(from, new THREE.Vector3(0.5, 0.2, 0), 0.3, 1, 20);
    const out = clonePose(from);
    lerpPose(from, home, 0.5, out);
    expect(out.dist).toBeGreaterThan(Math.min(from.dist, home.dist));
    expect(out.dist).toBeLessThan(Math.max(from.dist, home.dist));
    lerpPose(from, home, 1, out);
    expect(eyeOf(out).distanceTo(eyeOf(home))).toBeLessThan(1e-6);
    expect(out.quat.angleTo(home.quat)).toBeLessThan(1e-6);
  });

  it('gest dwoma palcami: przesunięcie środka, szczypanie i skręt', () => {
    const m = twoFinger(
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 110, y: 90 },
      { x: 110, y: 290 },
    );
    expect(m.dx).toBeCloseTo((110 + 110 - 100 - 200) / 2);
    expect(m.dy).toBeCloseTo((90 + 290 - 200) / 2);
    expect(m.scale).toBeCloseTo(2);
    expect(m.twist).toBeCloseTo(Math.PI / 2);
    // palce prawie w jednym punkcie: bez skrętu
    expect(twoFinger({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 5 }).twist).toBe(0);
  });
});

describe('tekstura kartki', () => {
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
