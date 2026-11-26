/** Powód, dla którego kamera nie działa; kreator pokazuje wtedy ścieżkę z plikiem. */
export type CameraProblem = 'unsupported' | 'denied' | 'missing' | 'failed';

/** Rozpoznaje błąd `getUserMedia`. */
export function cameraProblem(error: unknown): CameraProblem {
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return 'denied';
  }
  if (
    name === 'NotFoundError' ||
    name === 'DevicesNotFoundError' ||
    name === 'OverconstrainedError'
  ) {
    return 'missing';
  }
  return 'failed';
}

/** Czy przeglądarka w ogóle udostępnia kamerę (bezpieczny kontekst, `mediaDevices`). */
export function cameraSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}
