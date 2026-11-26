import {
  type Direction,
  type Ranking,
  type ScorePadEditorCategories,
  type ScorePadEditorCategoriesAction,
  type ScorePadEditorCategory,
  type ScorePadEditorCategoryPatch,
  type ScorePadLineKind,
  type ScorePadRangeMode,
  type ScorePadEditorStatus,
  type ScorePadZoomAction,
  type TiebreakRule,
  FINAL_TOTAL,
  isNumeric,
} from '@bg-club/score-pad';
import { createMemo, createSignal, createUniqueId, For, Show } from 'solid-js';
import { format, t } from '../i18n';
import {
  Button,
  Checkbox,
  ChipGroup,
  IconButton,
  SegmentedControl,
  Select,
  Tabs,
  TextField,
  Tray,
  type SelectOption,
} from '../ui';
import {
  categoryIssueMessages,
  issueMessages,
  lineLabel,
  parseInteger,
  parseIntegers,
} from './categories';
import { createDraft } from './createDraft';
import { ZoomButtons } from './ZoomButtons';

const text = t.scorepads.wizard.categories;

type Action = (action: ScorePadEditorCategoriesAction) => void;

/** Pływający pasek sceny w kroku 4 (DS §18): powiększenie i dopasowanie widoku kartki. */
export function CategoriesToolbar(props: {
  readonly zoomed: boolean;
  readonly zoom: ScorePadEditorStatus['zoom'];
  readonly disabled: boolean;
  readonly onAction: Action;
  readonly onZoom: (by: ScorePadZoomAction) => void;
}) {
  return (
    <div class="wizard-toolbar" role="toolbar" aria-label={text.toolbar}>
      <ZoomButtons zoom={props.zoom} disabled={props.disabled} onZoom={(by) => props.onZoom(by)} />
      <IconButton
        icon="target"
        label={text.fit}
        class="wizard-toolbar__btn"
        disabled={props.disabled || !props.zoomed}
        onClick={() => props.onAction({ type: 'fit' })}
      />
    </div>
  );
}

const TAB_ITEMS = (['lines', 'ranking'] as const).map((id) => ({ id, label: text.tabs[id] }));

/**
 * Panel kroku 4 „Kategorie” (EDT-13, EDT-2…EDT-4, DS §18). Dwie zakładki: *Kategorie* (nazwa,
 * typ, zakres, sumy i opis wybranej kategorii; kategorię wybiera się też na kartce) oraz
 * *Wygrana i remisy* (kategoria decydująca, kierunek i uporządkowane reguły remisów
 * z końcowym wspólnym miejscem). Stan trzyma edytor; zmiany od razu trafiają do szablonu
 * w formacie `template.ranking` i przechodzą walidator zapisu.
 */
export function CategoriesPanel(props: {
  readonly categories: ScorePadEditorCategories;
  /** Problem pól z kroku 3 (np. punktacja bez pól po zmianie typu). */
  readonly fieldsProblem: string | null;
  readonly onAction: Action;
}) {
  const problems = createMemo(() => {
    const list = [...issueMessages(props.categories.issues, props.categories.lines)];
    const fieldsProblem = props.fieldsProblem;
    if (fieldsProblem && !list.includes(fieldsProblem)) list.unshift(fieldsProblem);
    return list;
  });
  const onAction: Action = (action) => props.onAction(action);
  return (
    <div class="wizard-panel">
      <Tabs
        label={text.tabsLabel}
        items={TAB_ITEMS}
        value={props.categories.view}
        onChange={(view) => props.onAction({ type: 'view', view })}
        class="wizard-tabs"
      >
        {(view) =>
          view === 'lines' ? (
            <LineDetails categories={props.categories} onAction={onAction} />
          ) : (
            <RankingDetails categories={props.categories} onAction={onAction} />
          )
        }
      </Tabs>
      <Show when={problems().length > 0}>
        <div class="wizard-problems" aria-live="polite">
          <p class="wizard-problems__title">{text.problems}</p>
          <ul class="wizard-problems__list">
            <For each={problems()}>
              {(message) => <li class="wizard-hint wizard-hint--problem">{message}</li>}
            </For>
          </ul>
        </div>
      </Show>
    </div>
  );
}

/** Zakładka *Kategorie*: nawigator ‹ „Kategoria 5 z 8” › i szczegóły wybranej kategorii. */
function LineDetails(props: {
  readonly categories: ScorePadEditorCategories;
  readonly onAction: Action;
}) {
  const active = () => props.categories.active;
  const line = () => props.categories.lines[active()];
  const labelId = createUniqueId();
  return (
    <Show when={line()}>
      <div class="wizard-tab-body">
        <div class="wizard-field">
          <span class="field__label" id={labelId}>
            {text.category}
          </span>
          <div class="wizard-navigator" role="group" aria-labelledby={labelId}>
            <IconButton
              icon="chevron-left"
              label={text.previous}
              disabled={active() <= 0}
              onClick={() => props.onAction({ type: 'select', index: active() - 1 })}
            />
            <span class="wizard-navigator__label" aria-live="polite">
              {format(text.categoryOf, { n: active() + 1, total: props.categories.lines.length })}
            </span>
            <IconButton
              icon="chevron-right"
              label={text.next}
              disabled={active() >= props.categories.lines.length - 1}
              onClick={() => props.onAction({ type: 'select', index: active() + 1 })}
            />
          </div>
          <p class="wizard-hint">{text.hint}</p>
        </div>
        {/* Klucz: szkice pól (nazwa, zakres) należą do jednej kategorii. */}
        <Show when={line()?.id} keyed>
          {(_id) => (
            <Show when={line()}>
              {(current) => (
                <LineForm
                  line={current()}
                  index={active()}
                  categories={props.categories}
                  onPatch={(patch) => props.onAction({ type: 'update', index: active(), patch })}
                />
              )}
            </Show>
          )}
        </Show>
      </div>
    </Show>
  );
}

const KIND_OPTIONS: readonly ScorePadLineKind[] = ['names', 'input', 'total', 'skip'];

function LineForm(props: {
  readonly line: ScorePadEditorCategory;
  readonly index: number;
  readonly categories: ScorePadEditorCategories;
  readonly onPatch: (patch: ScorePadEditorCategoryPatch) => void;
}) {
  const name = createDraft(() => props.line.label);
  const hint = createDraft(() => props.line.hint);
  const errors = createMemo(() =>
    categoryIssueMessages(props.categories.issues, props.categories.lines, props.index),
  );
  const kindOptions = createMemo(() => {
    const kind = props.line.kind;
    // Starsze notesy: suma odcinka (`sum`) i premia (`bonus`) zostają, dopóki typ się nie zmieni.
    const kinds = KIND_OPTIONS.map((option) =>
      option === 'total' && kind === 'sum' ? 'sum' : option,
    );
    if (kind === 'bonus') kinds.push('bonus');
    return kinds.map((value) => ({ value, label: text.kinds[value] }));
  });
  const isSum = () =>
    props.line.kind === 'total' || props.line.kind === 'sum' || props.line.kind === 'bonus';
  return (
    <>
      <TextField
        label={text.name}
        value={name.draft()}
        maxlength={30}
        hint={name.draft().trim() ? undefined : text.nameHint}
        onFocus={name.onFocus}
        onBlur={name.onBlur}
        onInput={(event) => {
          name.setDraft(event.currentTarget.value);
          props.onPatch({ label: event.currentTarget.value });
        }}
      />
      <div class="wizard-field">
        <SegmentedControl
          legend={text.kind}
          hideLegend={false}
          options={kindOptions()}
          value={props.line.kind}
          onChange={(kind) => props.onPatch({ kind })}
        />
        <p class="wizard-hint">{text.kindHints[props.line.kind]}</p>
        <Show when={!props.line.placed && props.line.kind !== 'skip'}>
          <p class="wizard-hint">{text.notPlaced}</p>
        </Show>
      </div>
      <Show when={props.line.kind === 'names'}>
        <div class="wizard-field">
          <Checkbox
            label={text.team}
            checked={props.line.team}
            onCheckedChange={(team) => props.onPatch({ team })}
          />
          <p class="wizard-hint">{text.teamHint}</p>
        </div>
      </Show>
      <Show when={props.line.kind === 'input'}>
        <RangeFields
          line={props.line}
          error={errors()[0]}
          onPatch={(patch) => props.onPatch(patch)}
        />
      </Show>
      <Show when={isSum()}>
        <SumFields
          line={props.line}
          lines={props.categories.lines}
          onPatch={(patch) => props.onPatch(patch)}
        />
      </Show>
      <Show when={props.line.kind !== 'input' && errors().length > 0}>
        <p class="wizard-hint wizard-hint--problem">{errors()[0]}</p>
      </Show>
      <Show when={props.line.kind !== 'skip'}>
        <TextField
          label={text.description}
          optional
          value={hint.draft()}
          maxlength={160}
          hint={text.descriptionHint}
          onFocus={hint.onFocus}
          onBlur={hint.onBlur}
          onInput={(event) => {
            hint.setDraft(event.currentTarget.value);
            props.onPatch({ hint: event.currentTarget.value });
          }}
        />
      </Show>
    </>
  );
}

type Draft = ReturnType<typeof createDraft<string>>;

const RANGE_OPTIONS = (['free', 'range', 'list'] as const).map((range) => ({
  value: range,
  label: text.ranges[range],
}));

/** Punktacja: zakres dowolny, min–max–krok albo lista dozwolonych wartości (EDT-13). */
function RangeFields(props: {
  readonly line: ScorePadEditorCategory;
  readonly error: string | undefined;
  readonly onPatch: (patch: ScorePadEditorCategoryPatch) => void;
}) {
  const min = createDraft(() => String(props.line.min));
  const max = createDraft(() => String(props.line.max));
  const step = createDraft(() => String(props.line.step));
  const values = createDraft(() => props.line.values.join(', '));
  const number = (key: 'min' | 'max' | 'step', field: Draft) => (raw: string) => {
    field.setDraft(raw);
    const value = parseInteger(raw);
    if (value !== null) props.onPatch({ [key]: value });
  };
  const invalid = (raw: string) => (parseInteger(raw) === null ? text.notInteger : undefined);
  const valuesError = () => (parseIntegers(values.draft()) === null ? text.notIntegers : undefined);
  const numberFields = [
    ['min', min],
    ['max', max],
    ['step', step],
  ] as const;
  return (
    <div class="wizard-field">
      <SegmentedControl
        legend={text.range}
        hideLegend={false}
        options={RANGE_OPTIONS}
        value={props.line.range}
        onChange={(range: ScorePadRangeMode) => props.onPatch({ range })}
      />
      <p class="wizard-hint">{text.rangeHints[props.line.range]}</p>
      <Show when={props.line.range === 'range'}>
        <div class="wizard-row wizard-row--three">
          <For each={numberFields}>
            {([key, field]) => (
              <TextField
                label={text[key]}
                value={field.draft()}
                numeric
                inputmode="numeric"
                error={invalid(field.draft())}
                onFocus={field.onFocus}
                onBlur={field.onBlur}
                onInput={(event) => number(key, field)(event.currentTarget.value)}
              />
            )}
          </For>
        </div>
      </Show>
      <Show when={props.line.range === 'list'}>
        <TextField
          label={text.values}
          value={values.draft()}
          inputmode="numeric"
          hint={text.valuesHint}
          error={valuesError()}
          onFocus={values.onFocus}
          onBlur={values.onBlur}
          onInput={(event) => {
            values.setDraft(event.currentTarget.value);
            const parsed = parseIntegers(event.currentTarget.value);
            if (parsed !== null) props.onPatch({ values: parsed });
          }}
        />
      </Show>
      <Show when={props.error}>
        {(error) => <p class="wizard-hint wizard-hint--problem">{error()}</p>}
      </Show>
    </div>
  );
}

/** Suma: z których kategorii jest liczona (także z innych sum, bez cykli). */
function SumFields(props: {
  readonly line: ScorePadEditorCategory;
  readonly lines: readonly ScorePadEditorCategory[];
  readonly onPatch: (patch: ScorePadEditorCategoryPatch) => void;
}) {
  // Zaznaczone kategorie spoza możliwych (np. z pliku) też są widoczne, żeby dało się je odznaczyć.
  const options = createMemo(() =>
    props.lines
      .map((other, index) => ({ other, index }))
      .filter(
        ({ other }) => props.line.sumOptions.includes(other.id) || props.line.of.includes(other.id),
      )
      .map(({ other, index }) => ({ value: other.id, label: lineLabel(other, index) })),
  );
  return (
    <Show when={options().length > 0} fallback={<p class="wizard-hint">{text.sumsEmpty}</p>}>
      <div class="wizard-field">
        <ChipGroup
          legend={text.sums}
          options={options()}
          values={props.line.of}
          onChange={(of) => props.onPatch({ of })}
        />
        <p class="wizard-hint">{text.sumsHint}</p>
      </div>
    </Show>
  );
}

/** Edytowana reguła remisu (nowa albo istniejąca o indeksie `index`). */
interface RuleDraft {
  readonly index: number | null;
  readonly line: string;
  readonly dir: Direction;
}

const DIRECTION_OPTIONS = (['desc', 'asc'] as const).map((dir) => ({
  value: dir,
  label: text.directions[dir],
}));

/**
 * Zakładka *Wygrana i remisy* (EDT-2…EDT-4): kategoria decydująca, kierunek i reguły remisów.
 * Reguły działają hierarchicznie, a za ostatnią jest stałe „Wspólne miejsce”.
 */
function RankingDetails(props: {
  readonly categories: ScorePadEditorCategories;
  readonly onAction: Action;
}) {
  const ranking = () => props.categories.ranking;
  const lines = () => props.categories.lines;
  const [editing, setEditing] = createSignal<RuleDraft | null>(null);
  const numeric = createMemo(() =>
    lines()
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => isNumeric(line.kind)),
  );
  const label = (id: string) => {
    const index = lines().findIndex((l) => l.id === id);
    const line = lines()[index];
    return line ? lineLabel(line, index) : text.decidingDefault;
  };
  const implicitTotal = () => ranking().line === FINAL_TOTAL;
  const setRanking = (next: Ranking) => props.onAction({ type: 'ranking', ranking: next });
  const rules = () => ranking().tiebreak;
  const decidingOptions = createMemo(() =>
    numeric().map(({ line, index }) => ({
      value: line.id,
      label: lineLabel(line, index),
      meta: text.kinds[line.kind],
    })),
  );
  // Kategorie dla reguły: liczbowe, bez kategorii decydującej.
  const ruleOptions = createMemo((): SelectOption<string>[] =>
    decidingOptions().filter((option) => option.value !== ranking().line),
  );
  const used = createMemo(
    () => new Set(rules().flatMap((rule) => (rule.type === 'line' ? [rule.line] : []))),
  );
  // Druga reguła na tej samej kategorii nigdy nie rozstrzygnie remisu: każda kategoria raz.
  const firstFree = () => ruleOptions().find((option) => !used().has(option.value));
  const optionsFor = (draft: RuleDraft) =>
    ruleOptions().filter((option) => !used().has(option.value) || option.value === draft.line);
  // W trakcie zmiany reguły pozostałe wiersze czekają (indeks edytowanej reguły się nie zmienia).
  const locked = () => editing() !== null;

  const saveRule = (draft: RuleDraft) => {
    const current = rules();
    const rule: TiebreakRule = { type: 'line', line: draft.line, dir: draft.dir };
    const next =
      draft.index === null
        ? [
            ...current.filter((r) => r.type === 'line'),
            rule,
            ...current.filter((r) => r.type !== 'line'),
          ]
        : current.map((r, k) => (k === draft.index ? rule : r));
    setRanking({ ...ranking(), tiebreak: next });
    setEditing(null);
  };
  const move = (index: number, by: -1 | 1) => {
    const next = [...rules()];
    const [rule] = next.splice(index, 1);
    if (!rule) return;
    next.splice(index + by, 0, rule);
    setRanking({ ...ranking(), tiebreak: next });
  };
  const remove = (index: number) => {
    setRanking({ ...ranking(), tiebreak: rules().filter((_, k) => k !== index) });
    setEditing(null);
  };
  // Reguły „wspólne miejsce” i „rozstrzyga prowadzący” kończą listę; przesuwa się tylko kategorie.
  const lineRules = () => rules().filter((r) => r.type === 'line').length;
  const editor = (draft: () => RuleDraft) => (
    <RuleEditor
      draft={draft()}
      options={optionsFor(draft())}
      onChange={(next) => setEditing(next)}
      onSave={saveRule}
      onCancel={() => setEditing(null)}
    />
  );

  return (
    <div class="wizard-tab-body">
      <Select
        label={text.deciding}
        options={decidingOptions()}
        value={implicitTotal() ? null : ranking().line}
        placeholder={text.decidingDefault}
        hint={implicitTotal() ? text.decidingDefaultHint : undefined}
        onChange={(line) =>
          setRanking({
            line,
            dir: ranking().dir,
            tiebreak: rules().filter((rule) => rule.type !== 'line' || rule.line !== line),
          })
        }
      />
      <SegmentedControl
        legend={text.direction}
        hideLegend={false}
        disabled={implicitTotal()}
        options={DIRECTION_OPTIONS}
        value={ranking().dir}
        onChange={(dir) => setRanking({ ...ranking(), dir })}
      />
      <div class="wizard-field">
        <span class="field__label">{text.tiebreak}</span>
        <p class="wizard-hint">{text.tiebreakHint}</p>
        <Tray label={text.tiebreak} class="wizard-rules">
          {/* Wiersze po indeksie: przesunięcie zostawia fokus na miejscu. */}
          <For each={rules()} keyed={false}>
            {(rule, index) => {
              const n = index + 1;
              const lineRule = () => {
                const current = rule();
                return current.type === 'line' ? current : undefined;
              };
              const otherRule = () => {
                const current = rule();
                return current.type === 'line' ? undefined : current;
              };
              const draft = () => {
                const current = editing();
                return current?.index === index ? current : undefined;
              };
              return (
                <Show
                  when={draft()}
                  fallback={
                    <li class="wizard-rule">
                      <span class="wizard-rule__number" aria-hidden="true">
                        {n}
                      </span>
                      <Show when={lineRule()}>
                        {(line) => (
                          <button
                            type="button"
                            class="wizard-rule__body"
                            aria-label={format(text.editRule, { n })}
                            disabled={locked()}
                            onClick={() =>
                              setEditing({ index, line: line().line, dir: line().dir })
                            }
                          >
                            <span class="wizard-rule__title">{label(line().line)}</span>
                            <span class="wizard-rule__sub">
                              {format(text.ruleLine, { direction: text.directions[line().dir] })}
                            </span>
                          </button>
                        )}
                      </Show>
                      <Show when={otherRule()}>
                        {(other) => (
                          <span class="wizard-rule__body">
                            <span class="wizard-rule__title">
                              {other().type === 'manual' ? text.manual : text.shared}
                            </span>
                            <span class="wizard-rule__sub">
                              {other().type === 'manual' ? text.manualSub : text.sharedSub}
                            </span>
                          </span>
                        )}
                      </Show>
                      <Show when={lineRule()}>
                        <IconButton
                          icon="chevron-up"
                          size={32}
                          label={format(text.moveUp, { n })}
                          disabled={locked() || index === 0}
                          onClick={() => move(index, -1)}
                        />
                        <IconButton
                          icon="chevron-down"
                          size={32}
                          label={format(text.moveDown, { n })}
                          disabled={locked() || index >= lineRules() - 1}
                          onClick={() => move(index, 1)}
                        />
                      </Show>
                      <IconButton
                        icon="trash"
                        size={32}
                        label={format(text.removeRule, { n })}
                        disabled={locked()}
                        onClick={() => remove(index)}
                      />
                    </li>
                  }
                >
                  {(current) => <li class="wizard-rule wizard-rule--editing">{editor(current)}</li>}
                </Show>
              );
            }}
          </For>
          <Show when={editing()?.index === null ? editing() : undefined}>
            {(current) => <li class="wizard-rule wizard-rule--editing">{editor(current)}</li>}
          </Show>
          <Show when={!rules().some((rule) => rule.type !== 'line')}>
            <li class="wizard-rule wizard-rule--fixed">
              <span class="wizard-rule__number" aria-hidden="true">
                {rules().length + 1}
              </span>
              <span class="wizard-rule__body">
                <span class="wizard-rule__title">{text.shared}</span>
                <span class="wizard-rule__sub">{text.sharedSub}</span>
              </span>
            </li>
          </Show>
        </Tray>
        <Show when={ruleOptions().length === 0}>
          <p class="wizard-hint">{text.noRuleCategories}</p>
        </Show>
        <Button
          variant="secondary"
          icon="plus"
          class="wizard-panel__action"
          disabled={implicitTotal() || !firstFree() || locked()}
          onClick={() => {
            const free = firstFree();
            if (free) setEditing({ index: null, line: free.value, dir: 'desc' });
          }}
        >
          {text.addRule}
        </Button>
        <Button
          variant="secondary"
          icon="plus"
          class="wizard-panel__action"
          disabled={implicitTotal() || locked() || rules().some((r) => r.type === 'manual')}
          onClick={() =>
            setRanking({
              ...ranking(),
              tiebreak: [...rules().filter((r) => r.type === 'line'), { type: 'manual' }],
            })
          }
        >
          {text.addManual}
        </Button>
      </div>
    </div>
  );
}

/** Wybór kategorii i kierunku reguły remisu (dodanie albo zmiana). */
function RuleEditor(props: {
  readonly draft: RuleDraft;
  readonly options: readonly SelectOption<string>[];
  readonly onChange: (draft: RuleDraft) => void;
  readonly onSave: (draft: RuleDraft) => void;
  readonly onCancel: () => void;
}) {
  return (
    <div class="wizard-rule-editor">
      <Select
        label={text.ruleCategory}
        options={props.options}
        value={props.draft.line}
        onChange={(line) => props.onChange({ ...props.draft, line })}
      />
      <SegmentedControl
        legend={text.direction}
        options={DIRECTION_OPTIONS}
        value={props.draft.dir}
        onChange={(dir) => props.onChange({ ...props.draft, dir })}
      />
      <div class="wizard-actions">
        <Button size="sm" icon="check" onClick={() => props.onSave(props.draft)}>
          {props.draft.index === null ? text.ruleAdd : text.ruleSave}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => props.onCancel()}>
          {text.ruleCancel}
        </Button>
      </div>
    </div>
  );
}
