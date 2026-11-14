// Kamera orbitująca wokół notesu (PAD-10…PAD-12): obrót bez ograniczeń, zoom względem punktu
// pod kursorem albo palcami i płynny powrót do widoku z góry. Sama matematyka, bez sceny i DOM.

import * as THREE from 'three';

/** Najmocniejsze przybliżenie względem widoku domyślnego (PAD-11 wymaga co najmniej 6×). */
export const MAX_ZOOM = 8;
/** Najdalsze oddalenie względem widoku domyślnego. */
export const MIN_ZOOM = 0.8;
/** Czas płynnego powrotu do widoku z góry (ms). */
export const HOME_MS = 450;

/** Położenie kamery: punkt, wokół którego się obraca, orientacja i odległość od tego punktu. */
export interface OrbitPose {
  target: THREE.Vector3;
  quat: THREE.Quaternion;
  dist: number;
}

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

export function clonePose(p: OrbitPose): OrbitPose {
  return { target: p.target.clone(), quat: p.quat.clone(), dist: p.dist };
}

/** Pozycja kamery: kamera patrzy wzdłuż swojej osi −Z, więc stoi na +Z od punktu obrotu. */
export function eyeOf(p: OrbitPose, out = new THREE.Vector3()): THREE.Vector3 {
  return out.copy(AXIS_Z).multiplyScalar(p.dist).applyQuaternion(p.quat).add(p.target);
}

/** Położenie kamery stojącej w `eye`, patrzącej na `target`, z górą kadru `up`. */
export function poseLookingAt(
  eye: THREE.Vector3,
  target: THREE.Vector3,
  up: THREE.Vector3,
): OrbitPose {
  const m = new THREE.Matrix4().lookAt(eye, target, up);
  return {
    target: target.clone(),
    quat: new THREE.Quaternion().setFromRotationMatrix(m),
    dist: eye.distanceTo(target),
  };
}

export function applyPose(p: OrbitPose, cam: THREE.Camera): void {
  eyeOf(p, cam.position);
  cam.quaternion.copy(p.quat);
  cam.up.copy(AXIS_Y).applyQuaternion(p.quat);
}

/**
 * Obrót w osiach kadru (jak chwycenie notesu): `dx` w prawo obraca notes w prawo, `dy` w dół
 * nachyla jego górę do widza, `twist` (radiany, zgodnie ze wskazówkami zegara na ekranie)
 * obraca notes wokół osi patrzenia. Bez ograniczeń kąta, także pod spód notesu.
 */
export function rotatePose(p: OrbitPose, ax: number, ay: number, twist: number): void {
  const r = new THREE.Quaternion();
  const turn = (axis: THREE.Vector3, angle: number): void => {
    if (!angle) return;
    const world = axis.clone().applyQuaternion(p.quat);
    r.setFromAxisAngle(world, angle);
    p.quat.premultiply(r);
  };
  turn(AXIS_Y, -ax);
  turn(AXIS_X, -ay);
  turn(AXIS_Z, twist);
  p.quat.normalize();
}

/**
 * Zoom względem punktu `point`: kamera i punkt obrotu przesuwają się po prostych przez `point`,
 * więc punkt zostaje w tym samym miejscu kadru. `k` < 1 przybliża. Zwraca użyty współczynnik
 * (ograniczony do zakresu odległości).
 */
export function zoomPose(
  p: OrbitPose,
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

/** Położenie pośrednie przy płynnym powrocie (`t` od 0 do 1). */
export function lerpPose(a: OrbitPose, b: OrbitPose, t: number, out: OrbitPose): OrbitPose {
  out.target.lerpVectors(a.target, b.target, t);
  out.quat.slerpQuaternions(a.quat, b.quat, t);
  // odległość w skali logarytmicznej: zoom zmienia się równomiernie
  out.dist = Math.exp(THREE.MathUtils.lerp(Math.log(a.dist), Math.log(b.dist), t));
  return out;
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Czy kamera widzi wierzchnią kartkę (stoi nad płaszczyzną wierzchu bloczka). */
export function seesTop(eye: THREE.Vector3, topY: number): boolean {
  return eye.y > topY + 0.02;
}

export interface Touch2 {
  x: number;
  y: number;
}

/** Ruch dwóch palców między dwoma odczytami: przesunięcie środka, zmiana rozstawu i skręt. */
export function twoFinger(
  a0: Touch2,
  b0: Touch2,
  a1: Touch2,
  b1: Touch2,
): { dx: number; dy: number; scale: number; twist: number; x: number; y: number } {
  const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y);
  const d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
  let twist = Math.atan2(b1.y - a1.y, b1.x - a1.x) - Math.atan2(b0.y - a0.y, b0.x - a0.x);
  if (twist > Math.PI) twist -= 2 * Math.PI;
  if (twist < -Math.PI) twist += 2 * Math.PI;
  return {
    dx: (a1.x + b1.x - a0.x - b0.x) / 2,
    dy: (a1.y + b1.y - a0.y - b0.y) / 2,
    scale: d0 > 1 && d1 > 1 ? d1 / d0 : 1,
    // przy palcach blisko siebie kąt jest niepewny
    twist: d0 > 24 && d1 > 24 ? twist : 0,
    x: (a1.x + b1.x) / 2,
    y: (a1.y + b1.y) / 2,
  };
}
