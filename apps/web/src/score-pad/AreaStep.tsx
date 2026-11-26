import type {
  ScorePadEditorArea,
  ScorePadEditorAreaPatch,
  ScorePadEditorStatus,
  ScorePadZoomAction,
} from '@bg-club/score-pad';
import { Show, createMemo } from 'solid-js';
import { format, plural, t } from '../i18n';
import { ColorSwatches, IconButton, SegmentedControl, Slider, Switch, TextField } from '../ui';
import { SCOREPAD_NAME_MAX } from './scorepads';
import { SPINE_COLORS, areaHint, clampCm, formatCm, parseCm } from './area';
import { createDraft } from './createDraft';
import { ZoomButtons } from './ZoomButtons';

const text = t.scorepads.wizard.area;

/**
 * Pływający pasek sceny w kroku 2: obrót o 90° w lewo i w prawo, cofnij
 * powiększenie zdjęcia (precyzyjne ustawianie punktów obszaru).
 */
export function AreaToolbar(props: {
  readonly canUndo: boolean;
  readonly disabled: boolean;
  readonly zoom: ScorePadEditorStatus['zoom'];
  readonly onRotate: (dir: 1 | -1) => void;
  readonly onUndo: () => void;
  readonly onZoom: (by: ScorePadZoomAction) => void;
}) {
  return (
    <div class="wizard-toolbar" role="toolbar" aria-label={text.toolbar}>
      <IconButton
        icon="rotate-left"
        label={text.rotateLeft}
        class="wizard-toolbar__btn"
        disabled={props.disabled}
        onClick={() => props.onRotate(-1)}
      />
      <IconButton
        icon="rotate-right"
        label={text.rotateRight}
        class="wizard-toolbar__btn"
        disabled={props.disabled}
        onClick={() => props.onRotate(1)}
      />
      <IconButton
        icon="undo"
        label={text.undo}
        class="wizard-toolbar__btn"
        disabled={props.disabled || !props.canUndo}
        onClick={() => props.onUndo()}
      />
      <ZoomButtons zoom={props.zoom} disabled={props.disabled} onZoom={(by) => props.onZoom(by)} />
      <IconButton
        icon="target"
        label={text.fit}
        class="wizard-toolbar__btn"
        disabled={props.disabled || props.zoom.level <= 1}
        onClick={() => props.onZoom('fit')}
      />
    </div>
  );
}

/**
 * Panel kroku 2 „Obszar kartki”: nazwa notesu, kolor grzbietu, sposób
 * wyznaczenia obszaru z podpowiedzią, wygładzanie krawędzi, rozmiar kartki w centymetrach
 * i strona grzbietu. Zmiany idą od razu do edytora (`onChange`), który trzyma stan.
 */
export function AreaPanel(props: {
  readonly settings: ScorePadEditorArea;
  readonly onChange: (patch: ScorePadEditorAreaPatch) => void;
}) {
  const name = createDraft(() => props.settings.name);
  const width = createDraft(() => formatCm(props.settings.size.w));
  const height = createDraft(() => formatCm(props.settings.size.h));
  const strength = createDraft(() => props.settings.strength);

  const swatches = createMemo(() => {
    const tape = props.settings.tape;
    const known = SPINE_COLORS.includes(tape);
    return [
      ...(known
        ? []
        : [{ value: tape, label: format(text.spineCustom, { hex: tape }), color: tape }]),
      ...SPINE_COLORS.map((color, index) => ({
        value: color,
        label: text.spineColors[index] ?? color,
        color,
      })),
    ];
  });

  const commitSize = (key: 'w' | 'h', raw: string) => {
    const value = parseCm(raw);
    const field = key === 'w' ? width : height;
    if (value === null) {
      // Niepoprawna wartość wraca do bieżącego rozmiaru.
      field.setDraft(formatCm(props.settings.size[key]));
      return;
    }
    // Pole pokazuje wartość tak, jak ją zapisze edytor (zakres i zaokrąglenie), także wtedy,
    // gdy rozmiar się nie zmienia (np. 100 przy 60 cm).
    const size = clampCm(value);
    field.setDraft(formatCm(size));
    props.onChange({ size: { [key]: size } });
  };
  const onSizeKey =
    (key: 'w' | 'h') => (event: KeyboardEvent & { currentTarget: HTMLInputElement }) => {
      if (event.key === 'Enter') commitSize(key, event.currentTarget.value);
    };

  const nameError = () => (name.draft().trim() === '' ? text.nameRequired : undefined);

  return (
    <div class="wizard-panel">
      <TextField
        label={text.name}
        value={name.draft()}
        onFocus={name.onFocus}
        onBlur={name.onBlur}
        maxlength={SCOREPAD_NAME_MAX}
        error={nameError()}
        onInput={(event) => {
          const value = event.currentTarget.value;
          name.setDraft(value);
          props.onChange({ name: value });
        }}
      />
      <ColorSwatches
        legend={text.spine}
        options={swatches()}
        value={props.settings.tape}
        onChange={(tape) => props.onChange({ tape })}
      />
      <div class="wizard-field">
        <SegmentedControl
          legend={text.mode}
          hideLegend={false}
          options={(['full', 'manual'] as const).map((mode) => ({
            value: mode,
            label: text.modes[mode],
          }))}
          value={props.settings.mode}
          onChange={(mode) => props.onChange({ mode })}
        />
        <p class="wizard-hint" aria-live="polite">
          {format(areaHint(props.settings), {
            points: plural(props.settings.points, text.points),
          })}
        </p>
      </div>
      <div class="wizard-field">
        <Switch
          label={text.smoothing}
          description={text.smoothingHint}
          checked={props.settings.smoothing}
          onCheckedChange={(smoothing) => props.onChange({ smoothing })}
        />
        <Show when={props.settings.smoothing}>
          <Slider
            label={text.strength}
            min={0}
            max={10}
            step={1}
            value={strength.draft()}
            onFocus={strength.onFocus}
            onBlur={strength.onBlur}
            onValueChange={(value) => {
              strength.setDraft(value);
              props.onChange({ strength: value });
            }}
          />
        </Show>
      </div>
      <div class="wizard-row">
        <TextField
          label={text.width}
          inputmode="decimal"
          numeric
          trailing={text.unit}
          value={width.draft()}
          onInput={(event) => width.setDraft(event.currentTarget.value)}
          onFocus={width.onFocus}
          onBlur={(event) => {
            width.onBlur();
            commitSize('w', event.currentTarget.value);
          }}
          onKeyDown={onSizeKey('w')}
        />
        <TextField
          label={text.height}
          inputmode="decimal"
          numeric
          trailing={text.unit}
          value={height.draft()}
          onInput={(event) => height.setDraft(event.currentTarget.value)}
          onFocus={height.onFocus}
          onBlur={(event) => {
            height.onBlur();
            commitSize('h', event.currentTarget.value);
          }}
          onKeyDown={onSizeKey('h')}
        />
      </div>
      <p class="wizard-hint wizard-hint--tight">{text.sizeHint}</p>
      <SegmentedControl
        legend={text.spineSide}
        hideLegend={false}
        options={(['top', 'left'] as const).map((side) => ({
          value: side,
          label: text.spineSides[side],
        }))}
        value={props.settings.binding}
        onChange={(binding) => props.onChange({ binding })}
      />
    </div>
  );
}
