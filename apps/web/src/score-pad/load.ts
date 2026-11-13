/**
 * Leniwe ładowanie web componentów notesu i edytora (NFR-2, PRD §8.5).
 *
 * Moduły pakietu `@bg-club/score-pad` razem z Three.js i fontami kartki trafiają do osobnych
 * chunków, pobieranych dopiero przy pierwszym otwarciu notesu lub edytora. Nieudane pobranie
 * (np. brak sieci) nie zostaje zapamiętane, więc „Spróbuj ponownie” pobiera moduł od nowa.
 */
export type ScorePadPart = 'pad' | 'editor';

const importers: Readonly<Record<ScorePadPart, () => Promise<unknown>>> = {
  pad: () => import('@bg-club/score-pad/pad'),
  editor: () => import('@bg-club/score-pad/editor'),
};

const pending = new Map<ScorePadPart, Promise<void>>();

export function loadScorePadPart(part: ScorePadPart): Promise<void> {
  let promise = pending.get(part);
  if (!promise) {
    promise = importers[part]().then(
      () => undefined,
      (error: unknown) => {
        pending.delete(part);
        throw error;
      },
    );
    pending.set(part, promise);
  }
  return promise;
}
