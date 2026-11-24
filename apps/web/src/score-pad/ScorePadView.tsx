import type {
  ScorePadChangeDetail,
  ScorePadEventMap,
  ScorePadFile,
  ScorePadSaveDetail,
  ScorePadSheet,
  ScorePadTemplate,
} from '@bg-club/score-pad';
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import type { ScorePadLoadState } from './useScorePadElement';
import { t } from '../i18n';
import { cx } from '../ui/cx';
import { useTheme } from '../theme/useTheme';
import { ScorePadStatus } from './ScorePadStatus';
import { useScorePadElement } from './useScorePadElement';
import './scorePad.css';

export interface ScorePadViewProps {
  /** Plik notesu v2: szablon z bazy, opcjonalnie z wpisami kartki (szkic). */
  readonly config?: ScorePadFile | undefined;
  /** Dodatkowe szablony do wyboru na pasku notesu. */
  readonly templates?: ScorePadTemplate[] | undefined;
  /** Identyfikator notesu pokazanego na start. */
  readonly template?: string | undefined;
  /** Pasek notesu (wybór notesu, dźwięk). */
  readonly controls?: boolean | undefined;
  /** Karta wskazówek notesu (domyślnie według notesu). */
  readonly help?: boolean | undefined;
  /** Notes testowy kreatora (EDT-14): podsumowanie mówi, że karteczki nie zapisano. */
  readonly test?: boolean | undefined;
  /** `false`: kartki nie da się oderwać (np. partia bez zapisu wyników). */
  readonly tear?: boolean | undefined;
  /** `false`: po oderwaniu bez karteczki z wynikiem notesu (podsumowanie pokazuje aplikacja). */
  readonly summary?: boolean | undefined;
  /** Podgląd zapisanej karteczki (PAD-6): bez wpisów i odrywania; zoom i widoki kamery działają. */
  readonly readOnly?: boolean | undefined;
  readonly onReady?: (() => void) | undefined;
  readonly onSave?: ((detail: ScorePadSaveDetail) => void) | undefined;
  /** Kartka oderwana, także pusta (wtedy bez `onSave`); wywoływane przed `onSave`. */
  readonly onTear?: (() => void) | undefined;
  /** Zmiana stanu notesu z bieżącymi wpisami kartki (szkic partii, PAD-4). */
  readonly onChange?: ((detail: ScorePadChangeDetail) => void) | undefined;
  /** Stan ładowania modułu notesu (np. żeby wyłączyć przyciski do czasu wczytania). */
  readonly onLoadState?: ((state: ScorePadLoadState) => void) | undefined;
  readonly className?: string | undefined;
  /** Uchwyt do notesu (test w kreatorze: losowe wpisy, oderwanie, widok z góry). */
  readonly ref?: Ref<ScorePadHandle> | undefined;
}

export interface ScorePadHandle {
  /** Zastępuje wpisy na wierzchniej kartce; `null` daje czystą kartkę. */
  setSheet(sheet: ScorePadSheet | null): void;
  /** Odrywa wierzchnią kartkę (wynik w `onSave`). */
  tear(): void;
  /**
   * Kładzie oderwaną kartkę z powrotem na wierzch (anulowanie podsumowania, PAD-5); `false`,
   * gdy notesu nie ma albo nie jest gotowy.
   */
  restoreSheet(sheet: ScorePadSheet): boolean;
  /** Płynnie wraca do widoku domyślnego (PAD-12). */
  resetView(): void;
}

/**
 * Notes 3D `<score-pad>` w trybie klubowym (PAD-1, PRD §8.5): szablony tylko z propsów,
 * bez lokalnej biblioteki i historii POC. Motyw idzie za motywem aplikacji.
 * Nowy `config`, `templates` lub `template` (inna referencja) tworzy notes od nowa i czyści
 * kartkę, więc rodzic przekazuje stabilne obiekty (dane z zapytania albo `useMemo`).
 */
export function ScorePadView({
  config,
  templates,
  template,
  controls,
  help,
  test,
  tear,
  summary,
  readOnly,
  onReady,
  onSave,
  onTear,
  onChange,
  onLoadState,
  className,
  ref,
}: ScorePadViewProps) {
  const { resolved } = useTheme();
  const handlers = useRef({ onReady, onSave, onTear, onChange });

  useEffect(() => {
    handlers.current = { onReady, onSave, onTear, onChange };
  });

  const { hostRef, elementRef, state, retry } = useScorePadElement(
    'pad',
    resolved,
    () => {
      const element = document.createElement('score-pad');
      element.options = {
        club: true,
        config,
        templates,
        template,
        controls,
        help,
        test,
        tear,
        summary,
        readOnly,
      };
      element.addEventListener('scorepad:ready', () => handlers.current.onReady?.());
      element.addEventListener('scorepad:tear', () => handlers.current.onTear?.());
      element.addEventListener('scorepad:change', (event: ScorePadEventMap['scorepad:change']) =>
        handlers.current.onChange?.(event.detail),
      );
      element.addEventListener('scorepad:save', (event: ScorePadEventMap['scorepad:save']) =>
        handlers.current.onSave?.(event.detail),
      );
      return element;
    },
    [config, templates, template, controls, help, test, tear, summary, readOnly],
  );

  const onLoadStateRef = useRef(onLoadState);
  useEffect(() => {
    onLoadStateRef.current = onLoadState;
  });
  useEffect(() => onLoadStateRef.current?.(state), [state]);

  useImperativeHandle(
    ref,
    () => ({
      setSheet: (sheet) => elementRef.current?.pad?.setSheet(sheet),
      tear: () => elementRef.current?.pad?.tear(),
      restoreSheet: (sheet) => elementRef.current?.pad?.restoreSheet(sheet) ?? false,
      resetView: () => elementRef.current?.pad?.resetView(),
    }),
    [elementRef],
  );

  return (
    <div
      className={cx('score-pad-view', className)}
      role="region"
      aria-label={t.scorePad.padLabel}
      aria-busy={state === 'loading'}
    >
      <div ref={hostRef} className="score-pad-view__host" />
      <ScorePadStatus state={state} loadingLabel={t.scorePad.loadingPad} onRetry={retry} />
    </div>
  );
}
