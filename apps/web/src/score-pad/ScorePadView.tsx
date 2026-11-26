/** @jsxImportSource @solidjs/web */
import type {
  ScorePadChangeDetail,
  ScorePadEventMap,
  ScorePadFile,
  ScorePadSaveDetail,
  ScorePadSheet,
  ScorePadTemplate,
} from '@bg-club/score-pad';
import { createEffect } from 'solid-js';
import { t } from '../i18n';
import { createTheme } from '../solid/theme';
import { ariaBool, type ClassValue } from '../solid/ui/dom';
import { createScorePadElement, type ScorePadLoadState } from './createScorePadElement';
import { ScorePadStatus } from './ScorePadStatus';
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
  readonly class?: ClassValue;
  /** Uchwyt do notesu (test w kreatorze: losowe wpisy, oderwanie, widok z góry). */
  readonly ref?: ScorePadHandle | ((handle: ScorePadHandle) => void) | undefined;
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
 * bez lokalnej biblioteki i historii POC. Motyw idzie za motywem aplikacji. Wersja React
 * dla strony design systemu (do etapu 8): `react-shared/ScorePadView.tsx` (ten sam DOM).
 * Nowy `config`, `templates` lub `template` (inna referencja) tworzy notes od nowa i czyści
 * kartkę, więc rodzic przekazuje stabilne obiekty (dane z zapytania albo memo).
 */
export function ScorePadView(props: ScorePadViewProps) {
  const theme = createTheme();
  const pad = createScorePadElement(
    'pad',
    theme.resolved,
    () => {
      const element = document.createElement('score-pad');
      element.options = {
        club: true,
        config: props.config,
        templates: props.templates,
        template: props.template,
        controls: props.controls,
        help: props.help,
        test: props.test,
        tear: props.tear,
        summary: props.summary,
        readOnly: props.readOnly,
      };
      element.addEventListener('scorepad:ready', () => props.onReady?.());
      element.addEventListener('scorepad:tear', () => props.onTear?.());
      element.addEventListener('scorepad:change', (event: ScorePadEventMap['scorepad:change']) =>
        props.onChange?.(event.detail),
      );
      element.addEventListener('scorepad:save', (event: ScorePadEventMap['scorepad:save']) =>
        props.onSave?.(event.detail),
      );
      return element;
    },
    () => [
      props.config,
      props.templates,
      props.template,
      props.controls,
      props.help,
      props.test,
      props.tear,
      props.summary,
      props.readOnly,
    ],
  );

  createEffect(pad.state, (state) => {
    props.onLoadState?.(state);
  });

  const handle: ScorePadHandle = {
    setSheet: (sheet) => pad.element()?.pad?.setSheet(sheet),
    tear: () => pad.element()?.pad?.tear(),
    restoreSheet: (sheet) => pad.element()?.pad?.restoreSheet(sheet) ?? false,
    resetView: () => pad.element()?.pad?.resetView(),
  };

  return (
    <div
      class={['score-pad-view', props.class]}
      role="region"
      aria-label={t.scorePad.padLabel}
      aria-busy={ariaBool(pad.state() === 'loading')}
    >
      <div
        ref={(el) => {
          pad.hostRef(el);
          // Uchwyt dla rodzica (`ref` komponentu) razem z kontenerem elementu.
          const ref = props.ref;
          if (typeof ref === 'function') ref(handle);
        }}
        class="score-pad-view__host"
      />
      <ScorePadStatus
        state={pad.state()}
        loadingLabel={t.scorePad.loadingPad}
        onRetry={pad.retry}
      />
    </div>
  );
}
