import type {
  ScorePadEditorArea,
  ScorePadEditorAreaPatch,
  ScorePadEditorStatus,
  ScorePadZoomAction,
} from '@bg-club/score-pad';
import type { KeyboardEvent } from 'react';
import { format, plural, t } from '../i18n';
import { ColorSwatches, IconButton, SegmentedControl, Slider, Switch, TextField } from '../ui';
import { SCOREPAD_NAME_MAX } from './scorepads';
import { SPINE_COLORS, areaHint, clampCm, formatCm, parseCm } from './area';
import { useDraft } from './useDraft';
import { ZoomButtons } from './ZoomButtons';

const text = t.scorepads.wizard.area;

/**
 * Pływający pasek sceny w kroku 2 (DS §18): obrót o 90° w lewo i w prawo, cofnij oraz
 * powiększenie zdjęcia (precyzyjne ustawianie punktów obszaru).
 */
export function AreaToolbar({
  canUndo,
  disabled,
  zoom,
  onRotate,
  onUndo,
  onZoom,
}: {
  readonly canUndo: boolean;
  readonly disabled: boolean;
  readonly zoom: ScorePadEditorStatus['zoom'];
  readonly onRotate: (dir: 1 | -1) => void;
  readonly onUndo: () => void;
  readonly onZoom: (by: ScorePadZoomAction) => void;
}) {
  return (
    <div className="wizard-toolbar" role="toolbar" aria-label={text.toolbar}>
      <IconButton
        icon="rotate-left"
        label={text.rotateLeft}
        className="wizard-toolbar__btn"
        disabled={disabled}
        onClick={() => onRotate(-1)}
      />
      <IconButton
        icon="rotate-right"
        label={text.rotateRight}
        className="wizard-toolbar__btn"
        disabled={disabled}
        onClick={() => onRotate(1)}
      />
      <IconButton
        icon="undo"
        label={text.undo}
        className="wizard-toolbar__btn"
        disabled={disabled || !canUndo}
        onClick={onUndo}
      />
      <ZoomButtons zoom={zoom} disabled={disabled} onZoom={onZoom} />
      <IconButton
        icon="target"
        label={text.fit}
        className="wizard-toolbar__btn"
        disabled={disabled || zoom.level <= 1}
        onClick={() => onZoom('fit')}
      />
    </div>
  );
}

/**
 * Panel kroku 2 „Obszar kartki” (EDT-10, DS §18): nazwa notesu, kolor grzbietu, sposób
 * wyznaczenia obszaru z podpowiedzią, wygładzanie krawędzi, rozmiar kartki w centymetrach
 * i strona grzbietu. Zmiany idą od razu do edytora (`onChange`), który trzyma stan.
 */
export function AreaPanel({
  settings,
  onChange,
}: {
  readonly settings: ScorePadEditorArea;
  readonly onChange: (patch: ScorePadEditorAreaPatch) => void;
}) {
  const name = useDraft(settings.name);
  const width = useDraft(formatCm(settings.size.w));
  const height = useDraft(formatCm(settings.size.h));
  const strength = useDraft(settings.strength);

  const known = SPINE_COLORS.includes(settings.tape);
  const swatches = [
    ...(known
      ? []
      : [
          {
            value: settings.tape,
            label: format(text.spineCustom, { hex: settings.tape }),
            color: settings.tape,
          },
        ]),
    ...SPINE_COLORS.map((color, index) => ({
      value: color,
      label: text.spineColors[index] ?? color,
      color,
    })),
  ];

  const commitSize = (key: 'w' | 'h', raw: string) => {
    const value = parseCm(raw);
    const field = key === 'w' ? width : height;
    if (value === null) {
      // Niepoprawna wartość wraca do bieżącego rozmiaru.
      field.setDraft(formatCm(settings.size[key]));
      return;
    }
    // Pole pokazuje wartość tak, jak ją zapisze edytor (zakres i zaokrąglenie), także wtedy,
    // gdy rozmiar się nie zmienia (np. 100 przy 60 cm).
    const size = clampCm(value);
    field.setDraft(formatCm(size));
    onChange({ size: { [key]: size } });
  };
  const onSizeKey = (key: 'w' | 'h') => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') commitSize(key, event.currentTarget.value);
  };

  const nameError = name.draft.trim() === '' ? text.nameRequired : undefined;

  return (
    <div className="wizard-panel">
      <TextField
        label={text.name}
        value={name.draft}
        onFocus={name.onFocus}
        onBlur={name.onBlur}
        maxLength={SCOREPAD_NAME_MAX}
        error={nameError}
        onChange={(event) => {
          name.setDraft(event.target.value);
          onChange({ name: event.target.value });
        }}
      />
      <ColorSwatches
        legend={text.spine}
        options={swatches}
        value={settings.tape}
        onChange={(tape) => onChange({ tape })}
      />
      <div className="wizard-field">
        <SegmentedControl
          legend={text.mode}
          hideLegend={false}
          options={(['full', 'manual'] as const).map((mode) => ({
            value: mode,
            label: text.modes[mode],
          }))}
          value={settings.mode}
          onChange={(mode) => onChange({ mode })}
        />
        <p className="wizard-hint" aria-live="polite">
          {format(areaHint(settings), {
            points: plural(settings.points, text.points),
          })}
        </p>
      </div>
      <div className="wizard-field">
        <Switch
          label={text.smoothing}
          description={text.smoothingHint}
          checked={settings.smoothing}
          onCheckedChange={(smoothing) => onChange({ smoothing })}
        />
        {settings.smoothing ? (
          <Slider
            label={text.strength}
            min={0}
            max={10}
            step={1}
            value={strength.draft}
            onFocus={strength.onFocus}
            onBlur={strength.onBlur}
            onValueChange={(value) => {
              strength.setDraft(value);
              onChange({ strength: value });
            }}
          />
        ) : null}
      </div>
      <div className="wizard-row">
        <TextField
          label={text.width}
          inputMode="decimal"
          numeric
          trailing={text.unit}
          value={width.draft}
          onChange={(event) => width.setDraft(event.target.value)}
          onFocus={width.onFocus}
          onBlur={(event) => {
            width.onBlur();
            commitSize('w', event.target.value);
          }}
          onKeyDown={onSizeKey('w')}
        />
        <TextField
          label={text.height}
          inputMode="decimal"
          numeric
          trailing={text.unit}
          value={height.draft}
          onChange={(event) => height.setDraft(event.target.value)}
          onFocus={height.onFocus}
          onBlur={(event) => {
            height.onBlur();
            commitSize('h', event.target.value);
          }}
          onKeyDown={onSizeKey('h')}
        />
      </div>
      <p className="wizard-hint wizard-hint--tight">{text.sizeHint}</p>
      <SegmentedControl
        legend={text.spineSide}
        hideLegend={false}
        options={(['top', 'left'] as const).map((side) => ({
          value: side,
          label: text.spineSides[side],
        }))}
        value={settings.binding}
        onChange={(binding) => onChange({ binding })}
      />
    </div>
  );
}
