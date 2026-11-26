/** @jsxImportSource @solidjs/web */
import type { ScorePadEditorStatus, ScorePadZoomAction } from '@bg-club/score-pad';
import { t } from '../i18n';
import { IconButton } from '../solid/ui';

const text = t.scorepads.wizard.zoom;

/**
 * Przybliżenie i oddalenie podglądu w pływającym pasku sceny (kroki 2–4), żeby precyzyjniej
 * ustawiać punkty obszaru, linie tabeli i pola kategorii.
 */
export function ZoomButtons(props: {
  readonly zoom: ScorePadEditorStatus['zoom'];
  readonly disabled: boolean;
  readonly onZoom: (by: ScorePadZoomAction) => void;
}) {
  return (
    <>
      <IconButton
        icon="zoom-out"
        label={text.out}
        class="wizard-toolbar__btn"
        disabled={props.disabled || props.zoom.level <= 1}
        onClick={() => props.onZoom('out')}
      />
      <IconButton
        icon="zoom-in"
        label={text.in}
        class="wizard-toolbar__btn"
        disabled={props.disabled || props.zoom.level >= props.zoom.max}
        onClick={() => props.onZoom('in')}
      />
    </>
  );
}
