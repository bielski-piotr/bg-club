import type {
  ScorePadEditorMapping,
  ScorePadEditorMappingAction,
  ScorePadMappingMode,
} from '@bg-club/score-pad';
import { format, plural, t } from '../i18n';
import { Banner, Button, IconButton, SegmentedControl, Stepper } from '../ui';
import { cx } from '../ui/cx';
import { fewerSeatsMessage } from './messages';

const text = t.scorepads.wizard.mapping;

/** Pływający pasek sceny w kroku 3 (DS §18): cofnij i dopasuj widok. */
export function MappingToolbar({
  mapping,
  disabled,
  onAction,
}: {
  readonly mapping: ScorePadEditorMapping;
  readonly disabled: boolean;
  readonly onAction: (action: ScorePadEditorMappingAction) => void;
}) {
  return (
    <div className="wizard-toolbar" role="toolbar" aria-label={text.toolbar}>
      <IconButton
        icon="undo"
        label={text.undo}
        className="wizard-toolbar__btn"
        disabled={disabled || !mapping.canUndo}
        onClick={() => onAction({ type: 'undo' })}
      />
      <IconButton
        icon="target"
        label={text.fit}
        className="wizard-toolbar__btn"
        disabled={disabled || !mapping.zoomed}
        onClick={() => onAction({ type: 'fit' })}
      />
    </div>
  );
}

/** Kafelki liczby miejsc i kategorii (DS §18 „Stat tile”). */
function MappingStats({ mapping }: { readonly mapping: ScorePadEditorMapping }) {
  return (
    <div className="wizard-stats" aria-live="polite">
      <div className="wizard-stat">
        <span className="wizard-stat__number">{mapping.seats}</span>
        <span className="wizard-stat__label">{text.seats}</span>
      </div>
      <div className="wizard-stat">
        <span className="wizard-stat__number">{mapping.categories}</span>
        <span className="wizard-stat__label">{text.categories}</span>
      </div>
    </div>
  );
}

/**
 * Panel kroku 3 „Mapowanie pól” (EDT-11, EDT-6, DS §18): sposób mapowania, liczba miejsc
 * i kategorii, ostrzeżenie o mniejszej liczbie miejsc niż max. graczy gry i narzędzia trybu.
 * Zmianę sposobu przy istniejących polach potwierdza popup (`onModeChange`).
 */
export function MappingPanel({
  mapping,
  maxPlayers,
  onAction,
  onModeChange,
}: {
  readonly mapping: ScorePadEditorMapping;
  readonly maxPlayers: number;
  readonly onAction: (action: ScorePadEditorMappingAction) => void;
  readonly onModeChange: (mode: ScorePadMappingMode) => void;
}) {
  const warning = fewerSeatsMessage(mapping.seats, maxPlayers);
  return (
    <div className="wizard-panel">
      <div className="wizard-field">
        <SegmentedControl
          legend={text.mode}
          hideLegend={false}
          options={(['rects', 'table'] as const).map((mode) => ({
            value: mode,
            label: text.modes[mode],
          }))}
          value={mapping.mode}
          onChange={onModeChange}
        />
        <p className="wizard-hint">{text.hints[mapping.mode]}</p>
      </div>
      {mapping.mode === 'table' ? <TableTools mapping={mapping} onAction={onAction} /> : null}
      <MappingStats mapping={mapping} />
      {warning ? <Banner variant="warning">{warning}</Banner> : null}
      {mapping.mode === 'rects' ? <RectTools mapping={mapping} onAction={onAction} /> : null}
      {mapping.problem ? (
        <p className="wizard-hint wizard-hint--problem" aria-live="polite">
          {mapping.problem}
        </p>
      ) : null}
      <p className="wizard-hint">{text.hints.zoom}</p>
    </div>
  );
}

/** Tryb tabeli: oś graczy, liczba miejsc, kategorii i kolumn opisu, ponowne wykrycie. */
function TableTools({
  mapping,
  onAction,
}: {
  readonly mapping: ScorePadEditorMapping;
  readonly onAction: (action: ScorePadEditorMappingAction) => void;
}) {
  // Stepper może zmienić wartość o więcej niż 1 (PageUp, Home): edytor dostaje kolejne kroki.
  const steps = (type: 'seats' | 'categories' | 'labels', next: number, current: number) => {
    const delta = next > current ? 1 : -1;
    for (let i = 0; i < Math.abs(next - current); i++) onAction({ type, delta });
  };
  return (
    <>
      {mapping.detected === false ? <Banner variant="warning">{text.notDetected}</Banner> : null}
      <SegmentedControl
        legend={text.playersIn}
        hideLegend={false}
        options={(['cols', 'rows'] as const).map((axis) => ({
          value: axis,
          label: text.playersAxis[axis],
        }))}
        value={mapping.players}
        onChange={(players) => onAction({ type: 'players', players })}
      />
      <div className="wizard-row">
        <Stepper
          label={text.seats}
          value={mapping.seats}
          min={1}
          onChange={(next) => steps('seats', next, mapping.seats)}
        />
        <Stepper
          label={text.rows[mapping.players]}
          value={mapping.rows}
          min={1}
          onChange={(next) => steps('categories', next, mapping.rows)}
        />
      </div>
      <Stepper
        label={text.labels[mapping.players]}
        value={mapping.labels}
        min={0}
        max={mapping.maxLabels}
        hint={mapping.players === 'cols' ? text.labelsHint : text.labelsHintRows}
        onChange={(next) => steps('labels', next, mapping.labels)}
      />
      <Button
        variant="secondary"
        icon="refresh"
        className="wizard-panel__action"
        onClick={() => onAction({ type: 'detect' })}
      >
        {text.redetect}
      </Button>
    </>
  );
}

/** Tryb prostokątów: miejsce gracza, kategoria następnego pola, powielenie i usuwanie. */
function RectTools({
  mapping,
  onAction,
}: {
  readonly mapping: ScorePadEditorMapping;
  readonly onAction: (action: ScorePadEditorMappingAction) => void;
}) {
  const seat = mapping.activeSeat;
  const category = mapping.activeCategory;
  const isNew = category >= mapping.categories;
  return (
    <>
      <fieldset className="group">
        <legend className="group__legend">{text.seat}</legend>
        {/* Miejsca zawijają się w wiersze: działa przy dowolnej liczbie graczy (EDT-8). */}
        <div className="pills wizard-seats">
          {Array.from({ length: mapping.seats }, (_, index) => (
            <label key={index} className="pill-choice">
              <input
                type="radio"
                className="choice__input"
                name="wizard-seat"
                checked={index === seat}
                onChange={() => onAction({ type: 'seat', seat: index })}
              />
              <span className="pill">{format(text.seatOption, { n: index + 1 })}</span>
            </label>
          ))}
          <Button
            variant="secondary"
            size="sm"
            icon="plus"
            onClick={() => onAction({ type: 'seats', delta: 1 })}
          >
            {text.addSeat}
          </Button>
        </div>
      </fieldset>
      <div className="wizard-field">
        <span className="field__label" id="wizard-category-label">
          {text.category}
        </span>
        <div className="wizard-navigator" role="group" aria-labelledby="wizard-category-label">
          <IconButton
            icon="chevron-left"
            label={text.previousCategory}
            disabled={category <= 0}
            onClick={() => onAction({ type: 'category', category: category - 1 })}
          />
          <span className={cx('wizard-navigator__label', isNew && 'is-new')} aria-live="polite">
            {isNew
              ? format(text.newCategory, { n: mapping.categories + 1 })
              : format(text.categoryOf, { n: category + 1, total: mapping.categories })}
          </span>
          <IconButton
            icon="chevron-right"
            label={text.nextCategory}
            disabled={isNew}
            onClick={() => onAction({ type: 'category', category: category + 1 })}
          />
        </div>
      </div>
      <div className="wizard-actions">
        <Button
          variant="secondary"
          icon="copy"
          disabled={!mapping.canDuplicate}
          onClick={() => onAction({ type: 'duplicate' })}
        >
          {format(text.duplicate, { n: seat + 2 })}
        </Button>
        {mapping.selected > 0 ? (
          <Button variant="secondary" icon="trash" onClick={() => onAction({ type: 'delete' })}>
            {plural(mapping.selected, text.deleteSelected)}
          </Button>
        ) : null}
        {!isNew ? (
          <Button
            variant="secondary"
            icon="trash"
            onClick={() => onAction({ type: 'removeCategory' })}
          >
            {format(text.removeCategory, { n: category + 1 })}
          </Button>
        ) : null}
        {mapping.seats > 1 ? (
          <Button
            variant="secondary"
            icon="trash"
            onClick={() => onAction({ type: 'seats', delta: -1 })}
          >
            {format(text.removeSeat, { n: mapping.seats })}
          </Button>
        ) : null}
      </div>
      {mapping.selected > 0 && mapping.activeSeat > 0 ? (
        <p className="wizard-hint">{text.duplicateHint}</p>
      ) : null}
    </>
  );
}
