import type { ScorePadEditorStatus, ScorePadZoomAction } from '@bg-club/score-pad';
import { t } from '../i18n';
import { IconButton } from '../ui';

const text = t.scorepads.wizard.zoom;

/**
 * Przybliżenie i oddalenie podglądu w pływającym pasku sceny (kroki 2–4), żeby precyzyjniej
 * ustawiać punkty obszaru, linie tabeli i pola kategorii.
 */
export function ZoomButtons({
  zoom,
  disabled,
  onZoom,
}: {
  readonly zoom: ScorePadEditorStatus['zoom'];
  readonly disabled: boolean;
  readonly onZoom: (by: ScorePadZoomAction) => void;
}) {
  return (
    <>
      <IconButton
        icon="zoom-out"
        label={text.out}
        className="wizard-toolbar__btn"
        disabled={disabled || zoom.level <= 1}
        onClick={() => onZoom('out')}
      />
      <IconButton
        icon="zoom-in"
        label={text.in}
        className="wizard-toolbar__btn"
        disabled={disabled || zoom.level >= zoom.max}
        onClick={() => onZoom('in')}
      />
    </>
  );
}
