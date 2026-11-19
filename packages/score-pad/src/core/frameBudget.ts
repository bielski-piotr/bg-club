/**
 * Ograniczenia GPU. Notes rysuje w pełnej gęstości ekranu (do
 * 3), a tekstura kartki ma pełną rozdzielczość z edytora. Na słabym GPU pełna gęstość może
 * zejść poniżej 30 kl./s; wtedy obniżamy tylko gęstość renderu (devicePixelRatio płótna)
 * stopniami do 1, nigdy rozdzielczość tekstury. Obniżamy, gdy średni czas klatki w dwóch
 * kolejnych oknach po `FRAME_WINDOW` klatek przekracza budżet 30 kl./s (pojedynczy skok, np.
 * wgranie tekstury, nie wystarcza), i nie wracamy w górę (bez migotania ostrości). Klatki po
 * przerwie (karta w tle, debugger) i rozgrzewka po (ponownym) starcie pętli (kompilacja
 * shaderów, wgrywanie tekstur, `restart`) są pomijane.
 */

/** Budżet klatki dla minimum 30 kl./s, z małym zapasem na pomiar. */
export const FRAME_BUDGET_MS = 1000 / 30 + 2;
/** Liczba kolejnych klatek, z których liczymy średnią. */
export const FRAME_WINDOW = 45;
/** Klatki dłuższe niż to są przerwą, nie miarą wydajności. */
export const FRAME_GAP_MS = 250;
/** Czas po starcie, którego nie mierzymy (kompilacja shaderów, wgrywanie tekstur). */
export const WARMUP_MS = 1500;
/** Kolejne stopnie gęstości renderu po przekroczeniu budżetu. */
const STEPS = [2, 1.5, 1];

export class FrameBudget {
  private sum = 0;
  private count = 0;
  private start: number | null = null;
  private slowWindows = 0;

  /** `ratio`: gęstość startowa (min(devicePixelRatio, 3)). */
  constructor(private ratio: number) {}

  /** Nowa rozgrzewka: pętla ruszyła od nowa albo notes wczytał nowy szablon. */
  restart(): void {
    this.start = null;
    this.sum = 0;
    this.count = 0;
    this.slowWindows = 0;
  }

  get pixelRatio(): number {
    return this.ratio;
  }

  /**
   * Czas klatki `ms` w chwili `now`. Zwraca nową gęstość renderu, gdy trzeba ją obniżyć,
   * inaczej `null`.
   */
  sample(now: number, ms: number): number | null {
    this.start ??= now;
    if (now - this.start < WARMUP_MS || ms <= 0 || ms > FRAME_GAP_MS || this.ratio <= 1) {
      return null;
    }
    this.sum += ms;
    this.count += 1;
    if (this.count < FRAME_WINDOW) return null;
    const average = this.sum / this.count;
    this.sum = 0;
    this.count = 0;
    this.slowWindows = average > FRAME_BUDGET_MS ? this.slowWindows + 1 : 0;
    if (this.slowWindows < 2) return null;
    this.slowWindows = 0;
    this.ratio = STEPS.find((step) => step < this.ratio) ?? 1;
    return this.ratio;
  }
}
