// Kamera notesu: stała orientacja (z góry albo pod lekkim kątem), zoom względem
// punktu pod kursorem albo palcami, przesuwanie i płynne przejścia. Sama matematyka, bez sceny i DOM.

import * as THREE from 'three';

/** Najmocniejsze przybliżenie względem widoku domyślnego (wymaga co najmniej 6×). */
export const MAX_ZOOM = 8;
/** Najdalsze oddalenie względem widoku domyślnego. */
export const MIN_ZOOM = 0.8;
/** Czas płynnego przejścia kamery (powrót do widoku, zmiana kąta, dojazd do pola) w ms. */
export const MOVE_MS = 450;

/** Położenie kamery: punkt, na który patrzy, orientacja i odległość od tego punktu. */
export interface CameraPose {
  target: THREE.Vector3;
  quat: THREE.Quaternion;
  dist: number;
}

const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

export function clonePose(p: CameraPose): CameraPose {
  return { target: p.target.clone(), quat: p.quat.clone(), dist: p.dist };
}

/** Pozycja kamery: kamera patrzy wzdłuż swojej osi −Z, więc stoi na +Z od punktu, na który patrzy. */
export function eyeOf(p: CameraPose, out = new THREE.Vector3()): THREE.Vector3 {
  return out.copy(AXIS_Z).multiplyScalar(p.dist).applyQuaternion(p.quat).add(p.target);
}

/** Położenie kamery stojącej w `eye`, patrzącej na `target`, z górą kadru `up`. */
export function poseLookingAt(
  eye: THREE.Vector3,
  target: THREE.Vector3,
  up: THREE.Vector3,
): CameraPose {
  const m = new THREE.Matrix4().lookAt(eye, target, up);
  return {
    target: target.clone(),
    quat: new THREE.Quaternion().setFromRotationMatrix(m),
    dist: eye.distanceTo(target),
  };
}

export function applyPose(p: CameraPose, cam: THREE.Camera): void {
  eyeOf(p, cam.position);
  cam.quaternion.copy(p.quat);
  cam.up.copy(AXIS_Y).applyQuaternion(p.quat);
}

/**
 * Zoom względem punktu `point`: kamera i punkt, na który patrzy, przesuwają się po prostych przez
 * `point`, więc punkt zostaje w tym samym miejscu kadru. `k` < 1 przybliża. Zwraca użyty
 * współczynnik (ograniczony do zakresu odległości).
 */
export function zoomPose(
  p: CameraPose,
  point: THREE.Vector3,
  k: number,
  minDist: number,
  maxDist: number,
): number {
  const dist = THREE.MathUtils.clamp(p.dist * k, minDist, maxDist);
  const kk = dist / p.dist;
  p.target.sub(point).multiplyScalar(kk).add(point);
  p.dist = dist;
  return kk;
}

/**
 * Przesuwa kamerę w płaszczyźnie kadru o `dx`, `dy` pikseli ekranu (w prawo, w dół), mierzonych
 * na głębokości `depth` od kamery; `fov` w stopniach, `height` to wysokość kadru w pikselach.
 */
export function panPose(
  p: CameraPose,
  dx: number,
  dy: number,
  depth: number,
  fov: number,
  height: number,
): void {
  const wpp = (2 * depth * Math.tan(THREE.MathUtils.degToRad(fov / 2))) / Math.max(1, height);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(p.quat);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(p.quat);
  p.target.addScaledVector(right, dx * wpp).addScaledVector(up, -dy * wpp);
}

/** Położenie pośrednie przy płynnym przejściu (`t` od 0 do 1). */
export function lerpPose(a: CameraPose, b: CameraPose, t: number, out: CameraPose): CameraPose {
  out.target.lerpVectors(a.target, b.target, t);
  out.quat.slerpQuaternions(a.quat, b.quat, t);
  // odległość w skali logarytmicznej: zoom zmienia się równomiernie
  out.dist = Math.exp(THREE.MathUtils.lerp(Math.log(a.dist), Math.log(b.dist), t));
  return out;
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export interface Touch2 {
  x: number;
  y: number;
}

/** Ruch dwóch palców między dwoma odczytami: przesunięcie środka, zmiana rozstawu i nowy środek. */
export function twoFinger(
  a0: Touch2,
  b0: Touch2,
  a1: Touch2,
  b1: Touch2,
): { dx: number; dy: number; scale: number; x: number; y: number } {
  const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y);
  const d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
  return {
    dx: (a1.x + b1.x - a0.x - b0.x) / 2,
    dy: (a1.y + b1.y - a0.y - b0.y) / 2,
    scale: d0 > 1 && d1 > 1 ? d1 / d0 : 1,
    x: (a1.x + b1.x) / 2,
    y: (a1.y + b1.y) / 2,
  };
}
