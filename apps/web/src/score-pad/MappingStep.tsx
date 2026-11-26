/** @jsxImportSource @solidjs/web */
import type {
  ScorePadEditorMapping,
  ScorePadEditorMappingAction,
  ScorePadMappingMode,
  ScorePadEditorStatus,
  ScorePadZoomAction,
} from '@bg-club/score-pad';
import { For, Show } from 'solid-js';
import { format, plural, t } from '../i18n';
import { Banner, Button, IconButton, SegmentedControl, Stepper } from '../solid/ui';
import { fewerSeatsMessage } from './messages';
import { ZoomButtons } from './ZoomButtons';

const text = t.scorepads.wizard.mapping;

/** Pływający pasek sceny w kroku 3 (DS §18): cofnij, powiększenie i dopasuj widok. */
export function MappingToolbar(props: {
  readonly mapping: ScorePadEditorMapping;
  readonly zoom: ScorePadEditorStatus['zoom'];
  readonly disabled: boolean;
  readonly onAction: (action: ScorePadEditorMappingAction) => void;
  readonly onZoom: (by: ScorePadZoomAction) => void;
}) {
  return (
    <div class="wizard-toolbar" role="toolbar" aria-label={text.toolbar}>
      <IconButton
        icon="undo"
        label={text.undo}
        class="wizard-toolbar__btn"
        disabled={props.disabled || !props.mapping.canUndo}
        onClick={() => props.onAction({ type: 'undo' })}
      />
      <ZoomButtons zoom={props.zoom} disabled={props.disabled} onZoom={(by) => props.onZoom(by)} />
      <IconButton
        icon="target"
        label={text.fit}
        class="wizard-toolbar__btn"
        disabled={props.disabled || !props.mapping.zoomed}
        onClick={() => props.onAction({ type: 'fit' })}
      />
    </div>
  );
}

/** Kafelki liczby miejsc i kategorii (DS §18 „Stat tile”). */
function MappingStats(props: { readonly mapping: ScorePadEditorMapping }) {
  return (
    <div class="wizard-stats" aria-live="polite">
      <div class="wizard-stat">
        <span class="wizard-stat__number">{props.mapping.seats}</span>
        <span class="wizard-stat__label">{text.seats}</span>
      </div>
      <div class="wizard-stat">
        <span class="wizard-stat__number">{props.mapping.categories}</span>
        <span class="wizard-stat__label">{text.categories}</span>
      </div>
    </div>
  );
}

/**
 * Panel kroku 3 „Mapowanie pól” (EDT-11, EDT-6, DS §18): sposób mapowania, liczba miejsc
 * i kategorii, ostrzeżenie o mniejszej liczbie miejsc niż max. graczy gry i narzędzia trybu.
 * Zmianę sposobu przy istniejących polach potwierdza popup (`onModeChange`).
 */
export function MappingPanel(props: {
  readonly mapping: ScorePadEditorMapping;
  readonly maxPlayers: number;
  readonly onAction: (action: ScorePadEditorMappingAction) => void;
  readonly onModeChange: (mode: ScorePadMappingMode) => void;
}) {
  const warning = () => fewerSeatsMessage(props.mapping.seats, props.maxPlayers);
  const onAction = (action: ScorePadEditorMappingAction) => props.onAction(action);
  return (
    <div class="wizard-panel">
      <div class="wizard-field">
        <SegmentedControl
          legend={text.mode}
          hideLegend={false}
          options={(['rects', 'table'] as const).map((mode) => ({
            value: mode,
            label: text.modes[mode],
          }))}
          value={props.mapping.mode}
          onChange={(mode) => props.onModeChange(mode)}
        />
        <p class="wizard-hint">{text.hints[props.mapping.mode]}</p>
      </div>
      <Show when={props.mapping.mode === 'table'}>
        <TableTools mapping={props.mapping} onAction={onAction} />
      </Show>
      <MappingStats mapping={props.mapping} />
      <Show when={warning()}>{(message) => <Banner variant="warning">{message()}</Banner>}</Show>
      <Show when={props.mapping.mode === 'rects'}>
        <RectTools mapping={props.mapping} onAction={onAction} />
      </Show>
      <Show when={props.mapping.problem}>
        {(problem) => (
          <p class="wizard-hint wizard-hint--problem" aria-live="polite">
            {problem()}
          </p>
        )}
      </Show>
      <p class="wizard-hint">{text.hints.zoom}</p>
    </div>
  );
}

/** Tryb tabeli: oś graczy, liczba miejsc, kategorii i kolumn opisu. */
function TableTools(props: {
  readonly mapping: ScorePadEditorMapping;
  readonly onAction: (action: ScorePadEditorMappingAction) => void;
}) {
  // Stepper może zmienić wartość o więcej niż 1 (PageUp, Home): edytor dostaje kolejne kroki.
  const steps = (type: 'seats' | 'categories' | 'labels', next: number, current: number) => {
    const delta = next > current ? 1 : -1;
    for (let i = 0; i < Math.abs(next - current); i++) props.onAction({ type, delta });
  };
  return (
    <>
      <SegmentedControl
        legend={text.playersIn}
        hideLegend={false}
        options={(['cols', 'rows'] as const).map((axis) => ({
          value: axis,
          label: text.playersAxis[axis],
        }))}
        value={props.mapping.players}
        onChange={(players) => props.onAction({ type: 'players', players })}
      />
      <div class="wizard-row">
        <Stepper
          label={text.seats}
          value={props.mapping.seats}
          min={1}
          onChange={(next) => steps('seats', next, props.mapping.seats)}
        />
        <Stepper
          label={text.rows[props.mapping.players]}
          value={props.mapping.rows}
          min={1}
          onChange={(next) => steps('categories', next, props.mapping.rows)}
        />
      </div>
      <Stepper
        label={text.labels[props.mapping.players]}
        value={props.mapping.labels}
        min={0}
        max={props.mapping.maxLabels}
        hint={props.mapping.players === 'cols' ? text.labelsHint : text.labelsHintRows}
        onChange={(next) => steps('labels', next, props.mapping.labels)}
      />
    </>
  );
}

/** Tryb prostokątów: miejsce gracza, kategoria następnego pola, powielenie i usuwanie. */
function RectTools(props: {
  readonly mapping: ScorePadEditorMapping;
  readonly onAction: (action: ScorePadEditorMappingAction) => void;
}) {
  const seat = () => props.mapping.activeSeat;
  const category = () => props.mapping.activeCategory;
  const isNew = () => category() >= props.mapping.categories;
  // Liczby jako elementy listy: ta sama liczba miejsc zachowuje istniejące przyciski (fokus).
  const seatIndexes = () => Array.from({ length: props.mapping.seats }, (_, index) => index);
  return (
    <>
      <fieldset class="group">
        <legend class="group__legend">{text.seat}</legend>
        {/* Miejsca zawijają się w wiersze: działa przy dowolnej liczbie graczy (EDT-8). */}
        <div class="pills wizard-seats">
          <For each={seatIndexes()}>
            {(index) => (
              <label class="pill-choice">
                <input
                  type="radio"
                  class="choice__input"
                  name="wizard-seat"
                  checked={index === seat()}
                  onChange={() => props.onAction({ type: 'seat', seat: index })}
                />
                <span class="pill">{format(text.seatOption, { n: index + 1 })}</span>
              </label>
            )}
          </For>
          <Button
            variant="secondary"
            size="sm"
            icon="plus"
            onClick={() => props.onAction({ type: 'seats', delta: 1 })}
          >
            {text.addSeat}
          </Button>
        </div>
      </fieldset>
      <div class="wizard-field">
        <span class="field__label" id="wizard-category-label">
          {text.category}
        </span>
        <div class="wizard-navigator" role="group" aria-labelledby="wizard-category-label">
          <IconButton
            icon="chevron-left"
            label={text.previousCategory}
            disabled={category() <= 0}
            onClick={() => props.onAction({ type: 'category', category: category() - 1 })}
          />
          <span class={['wizard-navigator__label', { 'is-new': isNew() }]} aria-live="polite">
            {isNew()
              ? format(text.newCategory, { n: props.mapping.categories + 1 })
              : format(text.categoryOf, { n: category() + 1, total: props.mapping.categories })}
          </span>
          <IconButton
            icon="chevron-right"
            label={text.nextCategory}
            disabled={isNew()}
            onClick={() => props.onAction({ type: 'category', category: category() + 1 })}
          />
        </div>
      </div>
      <div class="wizard-actions">
        <Button
          variant="secondary"
          icon="copy"
          disabled={!props.mapping.canDuplicate}
          onClick={() => props.onAction({ type: 'duplicate' })}
        >
          {format(text.duplicate, { n: seat() + 2 })}
        </Button>
        <Show when={props.mapping.selected > 0}>
          <Button
            variant="secondary"
            icon="trash"
            onClick={() => props.onAction({ type: 'delete' })}
          >
            {plural(props.mapping.selected, text.deleteSelected)}
          </Button>
        </Show>
        <Show when={!isNew()}>
          <Button
            variant="secondary"
            icon="trash"
            onClick={() => props.onAction({ type: 'removeCategory' })}
          >
            {format(text.removeCategory, { n: category() + 1 })}
          </Button>
        </Show>
        <Show when={props.mapping.seats > 1}>
          <Button
            variant="secondary"
            icon="trash"
            onClick={() => props.onAction({ type: 'seats', delta: -1 })}
          >
            {format(text.removeSeat, { n: props.mapping.seats })}
          </Button>
        </Show>
      </div>
      <Show when={props.mapping.selected > 0 && props.mapping.activeSeat > 0}>
        <p class="wizard-hint">{text.duplicateHint}</p>
      </Show>
    </>
  );
}
