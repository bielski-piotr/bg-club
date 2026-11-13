import type { ScorePadEditorEventMap, ScorePadFile, ScorePadTemplate } from '@bg-club/score-pad';
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { t } from '../i18n';
import { cx } from '../ui/cx';
import { useTheme } from '../theme/useTheme';
import { ScorePadStatus } from './ScorePadStatus';
import { useScorePadElement } from './useScorePadElement';
import './scorePad.css';

export interface ScorePadEditorViewProps {
  /** Notes do poprawienia; bez niego edytor zaczyna od zdjęcia. */
  readonly template?: ScorePadTemplate | undefined;
  /** Plik notesu po „Zapisz do pliku” lub „Kopiuj do schowka” (zapis w bazie: EDT-1). */
  readonly onExport?: ((config: ScorePadFile, via: 'file' | 'clipboard') => void) | undefined;
  readonly className?: string | undefined;
  /** Uchwyt do bieżącego notesu z edytora (zapis w bazie, EDT-1). */
  readonly ref?: Ref<ScorePadEditorHandle> | undefined;
}

export interface ScorePadEditorHandle {
  /** Plik notesu z edytora albo `null`, gdy notes nie jest gotowy (brak zdjęcia lub pól). */
  exportConfig(): ScorePadFile | null;
}

/** Edytor `<score-pad-editor>` z motywem aplikacji (PRD §8.5). */
export function ScorePadEditorView({
  template,
  onExport,
  className,
  ref,
}: ScorePadEditorViewProps) {
  const { resolved } = useTheme();
  const onExportRef = useRef(onExport);

  useEffect(() => {
    onExportRef.current = onExport;
  });

  const { hostRef, elementRef, state, retry } = useScorePadElement(
    'editor',
    resolved,
    () => {
      const element = document.createElement('score-pad-editor');
      element.template = template;
      element.addEventListener(
        'scorepad-editor:export',
        (event: ScorePadEditorEventMap['scorepad-editor:export']) =>
          onExportRef.current?.(event.detail.config, event.detail.via),
      );
      return element;
    },
    [template],
  );

  useImperativeHandle(
    ref,
    () => ({ exportConfig: () => elementRef.current?.exportConfig() ?? null }),
    [elementRef],
  );

  return (
    <div
      className={cx('score-pad-view', 'score-pad-view--editor', className)}
      role="region"
      aria-label={t.scorePad.editorLabel}
      aria-busy={state === 'loading'}
    >
      <div ref={hostRef} className="score-pad-view__host" />
      <ScorePadStatus state={state} loadingLabel={t.scorePad.loadingEditor} onRetry={retry} />
    </div>
  );
}
