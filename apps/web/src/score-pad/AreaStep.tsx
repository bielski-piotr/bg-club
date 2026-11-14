import type { ScorePadEditorArea, ScorePadEditorAreaPatch } from '@bg-club/score-pad';
import { useState, type KeyboardEvent } from 'react';
import { format, plural, t } from '../i18n';
import { ColorSwatches, IconButton, SegmentedControl, Slider, Switch, TextField } from '../ui';
import { SCOREPAD_NAME_MAX } from './scorepads';
import { SPINE_COLORS, areaHint, parseCm } from './area';

const text = t.scorepads.wizard.area;

/**
 * Pływający pasek sceny w kroku 2 (DS §18): obrót o 90° w lewo i w prawo oraz cofnij.
 */
export function AreaToolbar({
  canUndo,
  disabled,
  onRotate,
  onUndo,
}: {
  readonly canUndo: boolean;
  readonly disabled: boolean;
  readonly onRotate: (dir: 1 | -1) => void;
  readonly onUndo: () => void;
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
    </div>
  );
}

/**
 * Wartość pola z edytora, którą użytkownik może swobodnie wpisywać: lokalny stan, a wartość
 * z edytora (np. po imporcie, obrocie albo poprawce zakresu) wraca, gdy pole nie ma fokusu.
 */
function useDraft<T>(value: T) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const [seen, setSeen] = useState(value);
  if (!editing && seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  return {
    draft,
    setDraft,
    onFocus: () => setEditing(true),
    onBlur: () => setEditing(false),
  };
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
  const width = useDraft(String(settings.size.w).replace('.', ','));
  const height = useDraft(String(settings.size.h).replace('.', ','));
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
    if (value === null) {
      // Niepoprawna wartość wraca do bieżącego rozmiaru.
      (key === 'w' ? width : height).setDraft(String(settings.size[key]).replace('.', ','));
      return;
    }
    onChange({ size: { [key]: value } });
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
          options={(['full', 'auto', 'manual'] as const).map((mode) => ({
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
