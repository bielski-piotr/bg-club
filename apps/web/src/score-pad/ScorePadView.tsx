import type {
  ScorePadEventMap,
  ScorePadFile,
  ScorePadSaveDetail,
  ScorePadTemplate,
} from '@bg-club/score-pad';
import { useEffect, useRef } from 'react';
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
  readonly onReady?: (() => void) | undefined;
  readonly onSave?: ((detail: ScorePadSaveDetail) => void) | undefined;
  readonly className?: string | undefined;
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
  onReady,
  onSave,
  className,
}: ScorePadViewProps) {
  const { resolved } = useTheme();
  const handlers = useRef({ onReady, onSave });

  useEffect(() => {
    handlers.current = { onReady, onSave };
  });

  const { hostRef, state, retry } = useScorePadElement(
    'pad',
    resolved,
    () => {
      const element = document.createElement('score-pad');
      element.options = { club: true, config, templates, template, controls };
      element.addEventListener('scorepad:ready', () => handlers.current.onReady?.());
      element.addEventListener('scorepad:save', (event: ScorePadEventMap['scorepad:save']) =>
        handlers.current.onSave?.(event.detail),
      );
      return element;
    },
    [config, templates, template, controls],
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
