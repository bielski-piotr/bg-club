import type {
  Direction,
  Ranking,
  ScorePadEditorCategories,
  ScorePadEditorCategoriesAction,
  ScorePadEditorCategory,
  ScorePadEditorCategoryPatch,
  ScorePadLineKind,
  ScorePadRangeMode,
  TiebreakRule,
} from '@bg-club/score-pad';
import { useId, useState } from 'react';
import { format, t } from '../i18n';
import {
  Button,
  ChipGroup,
  IconButton,
  SegmentedControl,
  Select,
  Tabs,
  TextField,
  Tray,
  type SelectOption,
} from '../ui';
import { FINAL_TOTAL, isNumeric } from '@bg-club/score-pad';
import {
  categoryIssueMessages,
  issueMessages,
  lineLabel,
  parseInteger,
  parseIntegers,
} from './categories';
import { useDraft } from './useDraft';

const text = t.scorepads.wizard.categories;

type Action = (action: ScorePadEditorCategoriesAction) => void;

/** Pływający pasek sceny w kroku 4 (DS §18): dopasowanie widoku kartki. */
export function CategoriesToolbar({
  zoomed,
  disabled,
  onAction,
}: {
  readonly zoomed: boolean;
  readonly disabled: boolean;
  readonly onAction: Action;
}) {
  return (
    <div className="wizard-toolbar" role="toolbar" aria-label={text.toolbar}>
      <IconButton
        icon="target"
        label={text.fit}
        className="wizard-toolbar__btn"
        disabled={disabled || !zoomed}
        onClick={() => onAction({ type: 'fit' })}
      />
    </div>
  );
}

/**
 * Panel kroku 4 „Kategorie” (EDT-13, EDT-2…EDT-4, DS §18). Dwie zakładki: *Kategorie* (nazwa,
 * typ, zakres, sumy i opis wybranej kategorii; kategorię wybiera się też na kartce) oraz
 * *Wygrana i remisy* (kategoria decydująca, kierunek i uporządkowane reguły remisów
 * z końcowym wspólnym miejscem). Stan trzyma edytor; zmiany od razu trafiają do szablonu
 * w formacie `template.ranking` i przechodzą walidator zapisu.
 */
export function CategoriesPanel({
  categories,
  fieldsProblem,
  onAction,
}: {
  readonly categories: ScorePadEditorCategories;
  /** Problem pól z kroku 3 (np. punktacja bez pól po zmianie typu). */
  readonly fieldsProblem: string | null;
  readonly onAction: Action;
}) {
  const problems = issueMessages(categories.issues, categories.lines);
  if (fieldsProblem && !problems.includes(fieldsProblem)) problems.unshift(fieldsProblem);
  return (
    <div className="wizard-panel">
      <Tabs
        label={text.tabsLabel}
        items={(['lines', 'ranking'] as const).map((id) => ({ id, label: text.tabs[id] }))}
        value={categories.view}
        onChange={(view) => onAction({ type: 'view', view })}
        className="wizard-tabs"
      >
        {(view) =>
          view === 'lines' ? (
            <LineDetails categories={categories} onAction={onAction} />
          ) : (
            <RankingDetails categories={categories} onAction={onAction} />
          )
        }
      </Tabs>
      {problems.length > 0 ? (
        <div className="wizard-problems" aria-live="polite">
          <p className="wizard-problems__title">{text.problems}</p>
          <ul className="wizard-problems__list">
            {problems.map((message) => (
              <li key={message} className="wizard-hint wizard-hint--problem">
                {message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Zakładka *Kategorie*: nawigator ‹ „Kategoria 5 z 8” › i szczegóły wybranej kategorii. */
function LineDetails({
  categories,
  onAction,
}: {
  readonly categories: ScorePadEditorCategories;
  readonly onAction: Action;
}) {
  const { lines, active } = categories;
  const line = lines[active];
  const labelId = useId();
  if (!line) return null;
  return (
    <div className="wizard-tab-body">
      <div className="wizard-field">
        <span className="field__label" id={labelId}>
          {text.category}
        </span>
        <div className="wizard-navigator" role="group" aria-labelledby={labelId}>
          <IconButton
            icon="chevron-left"
            label={text.previous}
            disabled={active <= 0}
            onClick={() => onAction({ type: 'select', index: active - 1 })}
          />
          <span className="wizard-navigator__label" aria-live="polite">
            {format(text.categoryOf, { n: active + 1, total: lines.length })}
          </span>
          <IconButton
            icon="chevron-right"
            label={text.next}
            disabled={active >= lines.length - 1}
            onClick={() => onAction({ type: 'select', index: active + 1 })}
          />
        </div>
        <p className="wizard-hint">{text.hint}</p>
      </div>
      {/* Klucz: szkice pól (nazwa, zakres) należą do jednej kategorii. */}
      <LineForm
        key={line.id}
        line={line}
        index={active}
        categories={categories}
        onPatch={(patch) => onAction({ type: 'update', index: active, patch })}
      />
    </div>
  );
}

const KIND_OPTIONS: readonly ScorePadLineKind[] = ['names', 'input', 'total', 'skip'];

function LineForm({
  line,
  index,
  categories,
  onPatch,
}: {
  readonly line: ScorePadEditorCategory;
  readonly index: number;
  readonly categories: ScorePadEditorCategories;
  readonly onPatch: (patch: ScorePadEditorCategoryPatch) => void;
}) {
  const name = useDraft(line.label);
  const hint = useDraft(line.hint);
  const errors = categoryIssueMessages(categories.issues, categories.lines, index);
  // Starsze notesy: suma odcinka (`sum`) i premia (`bonus`) zostają, dopóki typ się nie zmieni.
  const kinds = KIND_OPTIONS.map((kind) =>
    kind === 'total' && line.kind === 'sum' ? 'sum' : kind,
  );
  if (line.kind === 'bonus') kinds.push('bonus');
  return (
    <>
      <TextField
        label={text.name}
        value={name.draft}
        maxLength={30}
        hint={name.draft.trim() ? undefined : text.nameHint}
        onFocus={name.onFocus}
        onBlur={name.onBlur}
        onChange={(event) => {
          name.setDraft(event.target.value);
          onPatch({ label: event.target.value });
        }}
      />
      <div className="wizard-field">
        <SegmentedControl
          legend={text.kind}
          hideLegend={false}
          options={kinds.map((kind) => ({ value: kind, label: text.kinds[kind] }))}
          value={line.kind}
          onChange={(kind) => onPatch({ kind })}
        />
        <p className="wizard-hint">{text.kindHints[line.kind]}</p>
        {!line.placed && line.kind !== 'skip' ? (
          <p className="wizard-hint">{text.notPlaced}</p>
        ) : null}
      </div>
      {line.kind === 'input' ? (
        <RangeFields line={line} error={errors[0]} onPatch={onPatch} />
      ) : null}
      {line.kind === 'total' || line.kind === 'sum' || line.kind === 'bonus' ? (
        <SumFields line={line} lines={categories.lines} onPatch={onPatch} />
      ) : null}
      {line.kind !== 'input' && errors.length > 0 ? (
        <p className="wizard-hint wizard-hint--problem">{errors[0]}</p>
      ) : null}
      {line.kind !== 'skip' ? (
        <TextField
          label={text.description}
          optional
          value={hint.draft}
          maxLength={160}
          hint={text.descriptionHint}
          onFocus={hint.onFocus}
          onBlur={hint.onBlur}
          onChange={(event) => {
            hint.setDraft(event.target.value);
            onPatch({ hint: event.target.value });
          }}
        />
      ) : null}
    </>
  );
}

/** Punktacja: zakres dowolny, min–max–krok albo lista dozwolonych wartości (EDT-13). */
function RangeFields({
  line,
  error,
  onPatch,
}: {
  readonly line: ScorePadEditorCategory;
  readonly error: string | undefined;
  readonly onPatch: (patch: ScorePadEditorCategoryPatch) => void;
}) {
  const min = useDraft(String(line.min));
  const max = useDraft(String(line.max));
  const step = useDraft(String(line.step));
  const values = useDraft(line.values.join(', '));
  const number =
    (key: 'min' | 'max' | 'step', field: ReturnType<typeof useDraft<string>>) => (raw: string) => {
      field.setDraft(raw);
      const value = parseInteger(raw);
      if (value !== null) onPatch({ [key]: value });
    };
  const invalid = (raw: string) => (parseInteger(raw) === null ? text.notInteger : undefined);
  const valuesError = parseIntegers(values.draft) === null ? text.notIntegers : undefined;
  return (
    <div className="wizard-field">
      <SegmentedControl
        legend={text.range}
        hideLegend={false}
        options={(['free', 'range', 'list'] as const).map((range) => ({
          value: range,
          label: text.ranges[range],
        }))}
        value={line.range}
        onChange={(range: ScorePadRangeMode) => onPatch({ range })}
      />
      <p className="wizard-hint">{text.rangeHints[line.range]}</p>
      {line.range === 'range' ? (
        <div className="wizard-row wizard-row--three">
          {(
            [
              ['min', min],
              ['max', max],
              ['step', step],
            ] as const
          ).map(([key, field]) => (
            <TextField
              key={key}
              label={text[key]}
              value={field.draft}
              numeric
              inputMode="numeric"
              error={invalid(field.draft)}
              onFocus={field.onFocus}
              onBlur={field.onBlur}
              onChange={(event) => number(key, field)(event.target.value)}
            />
          ))}
        </div>
      ) : null}
      {line.range === 'list' ? (
        <TextField
          label={text.values}
          value={values.draft}
          inputMode="numeric"
          hint={text.valuesHint}
          error={valuesError}
          onFocus={values.onFocus}
          onBlur={values.onBlur}
          onChange={(event) => {
            values.setDraft(event.target.value);
            const parsed = parseIntegers(event.target.value);
            if (parsed !== null) onPatch({ values: parsed });
          }}
        />
      ) : null}
      {error ? <p className="wizard-hint wizard-hint--problem">{error}</p> : null}
    </div>
  );
}

/** Suma: z których kategorii jest liczona (także z innych sum, bez cykli). */
function SumFields({
  line,
  lines,
  onPatch,
}: {
  readonly line: ScorePadEditorCategory;
  readonly lines: readonly ScorePadEditorCategory[];
  readonly onPatch: (patch: ScorePadEditorCategoryPatch) => void;
}) {
  // Zaznaczone kategorie spoza możliwych (np. z pliku) też są widoczne, żeby dało się je odznaczyć.
  const options = lines
    .map((other, index) => ({ other, index }))
    .filter(({ other }) => line.sumOptions.includes(other.id) || line.of.includes(other.id))
    .map(({ other, index }) => ({ value: other.id, label: lineLabel(other, index) }));
  if (options.length === 0) return <p className="wizard-hint">{text.sumsEmpty}</p>;
  return (
    <div className="wizard-field">
      <ChipGroup
        legend={text.sums}
        options={options}
        values={line.of}
        onChange={(of) => onPatch({ of })}
      />
      <p className="wizard-hint">{text.sumsHint}</p>
    </div>
  );
}

/** Edytowana reguła remisu (nowa albo istniejąca o indeksie `index`). */
interface RuleDraft {
  readonly index: number | null;
  readonly line: string;
  readonly dir: Direction;
}

/**
 * Zakładka *Wygrana i remisy* (EDT-2…EDT-4): kategoria decydująca, kierunek i reguły remisów.
 * Reguły działają hierarchicznie, a za ostatnią jest stałe „Wspólne miejsce”.
 */
function RankingDetails({
  categories,
  onAction,
}: {
  readonly categories: ScorePadEditorCategories;
  readonly onAction: Action;
}) {
  const { ranking, lines } = categories;
  const [editing, setEditing] = useState<RuleDraft | null>(null);
  const numeric = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => isNumeric(line.kind));
  const label = (id: string) => {
    const index = lines.findIndex((l) => l.id === id);
    const line = lines[index];
    return line ? lineLabel(line, index) : text.decidingDefault;
  };
  const implicitTotal = ranking.line === FINAL_TOTAL;
  const setRanking = (next: Ranking) => onAction({ type: 'ranking', ranking: next });
  const rules = ranking.tiebreak;
  // Kategorie dla reguły: liczbowe, bez kategorii decydującej.
  const ruleOptions: SelectOption<string>[] = numeric
    .filter(({ line }) => line.id !== ranking.line)
    .map(({ line, index }) => ({
      value: line.id,
      label: lineLabel(line, index),
      meta: text.kinds[line.kind],
    }));
  const used = new Set(rules.flatMap((rule) => (rule.type === 'line' ? [rule.line] : [])));
  // Druga reguła na tej samej kategorii nigdy nie rozstrzygnie remisu: każda kategoria raz.
  const firstFree = ruleOptions.find((option) => !used.has(option.value));
  const optionsFor = (draft: RuleDraft) =>
    ruleOptions.filter((option) => !used.has(option.value) || option.value === draft.line);
  // W trakcie zmiany reguły pozostałe wiersze czekają (indeks edytowanej reguły się nie zmienia).
  const locked = editing !== null;

  const saveRule = (draft: RuleDraft) => {
    const rule: TiebreakRule = { type: 'line', line: draft.line, dir: draft.dir };
    const next =
      draft.index === null
        ? [
            ...rules.filter((r) => r.type === 'line'),
            rule,
            ...rules.filter((r) => r.type !== 'line'),
          ]
        : rules.map((r, k) => (k === draft.index ? rule : r));
    setRanking({ ...ranking, tiebreak: next });
    setEditing(null);
  };
  const move = (index: number, by: -1 | 1) => {
    const next = [...rules];
    const [rule] = next.splice(index, 1);
    if (!rule) return;
    next.splice(index + by, 0, rule);
    setRanking({ ...ranking, tiebreak: next });
  };
  const remove = (index: number) => {
    setRanking({ ...ranking, tiebreak: rules.filter((_, k) => k !== index) });
    setEditing(null);
  };
  // Reguły „wspólne miejsce” i „rozstrzyga prowadzący” kończą listę; przesuwa się tylko kategorie.
  const lineRules = rules.filter((r) => r.type === 'line').length;

  return (
    <div className="wizard-tab-body">
      <Select
        label={text.deciding}
        options={numeric.map(({ line, index }) => ({
          value: line.id,
          label: lineLabel(line, index),
          meta: text.kinds[line.kind],
        }))}
        value={implicitTotal ? null : ranking.line}
        placeholder={text.decidingDefault}
        hint={implicitTotal ? text.decidingDefaultHint : undefined}
        onChange={(line) =>
          setRanking({
            line,
            dir: ranking.dir,
            tiebreak: rules.filter((rule) => rule.type !== 'line' || rule.line !== line),
          })
        }
      />
      <SegmentedControl
        legend={text.direction}
        hideLegend={false}
        disabled={implicitTotal}
        options={(['desc', 'asc'] as const).map((dir) => ({
          value: dir,
          label: text.directions[dir],
        }))}
        value={ranking.dir}
        onChange={(dir) => setRanking({ ...ranking, dir })}
      />
      <div className="wizard-field">
        <span className="field__label">{text.tiebreak}</span>
        <p className="wizard-hint">{text.tiebreakHint}</p>
        <Tray label={text.tiebreak} className="wizard-rules">
          {rules.map((rule, index) => {
            const n = index + 1;
            if (editing?.index === index) {
              return (
                <li key={`edit-${index}`} className="wizard-rule wizard-rule--editing">
                  <RuleEditor
                    draft={editing}
                    options={optionsFor(editing)}
                    onChange={setEditing}
                    onSave={saveRule}
                    onCancel={() => setEditing(null)}
                  />
                </li>
              );
            }
            const isLine = rule.type === 'line';
            return (
              <li key={`${rule.type}-${index}`} className="wizard-rule">
                <span className="wizard-rule__number" aria-hidden="true">
                  {n}
                </span>
                {isLine ? (
                  <button
                    type="button"
                    className="wizard-rule__body"
                    aria-label={format(text.editRule, { n })}
                    disabled={locked}
                    onClick={() => setEditing({ index, line: rule.line, dir: rule.dir })}
                  >
                    <span className="wizard-rule__title">{label(rule.line)}</span>
                    <span className="wizard-rule__sub">
                      {format(text.ruleLine, { direction: text.directions[rule.dir] })}
                    </span>
                  </button>
                ) : (
                  <span className="wizard-rule__body">
                    <span className="wizard-rule__title">
                      {rule.type === 'manual' ? text.manual : text.shared}
                    </span>
                    <span className="wizard-rule__sub">
                      {rule.type === 'manual' ? text.manualSub : text.sharedSub}
                    </span>
                  </span>
                )}
                {isLine ? (
                  <>
                    <IconButton
                      icon="chevron-up"
                      size={32}
                      label={format(text.moveUp, { n })}
                      disabled={locked || index === 0}
                      onClick={() => move(index, -1)}
                    />
                    <IconButton
                      icon="chevron-down"
                      size={32}
                      label={format(text.moveDown, { n })}
                      disabled={locked || index >= lineRules - 1}
                      onClick={() => move(index, 1)}
                    />
                  </>
                ) : null}
                <IconButton
                  icon="trash"
                  size={32}
                  label={format(text.removeRule, { n })}
                  disabled={locked}
                  onClick={() => remove(index)}
                />
              </li>
            );
          })}
          {editing?.index === null ? (
            <li className="wizard-rule wizard-rule--editing">
              <RuleEditor
                draft={editing}
                options={optionsFor(editing)}
                onChange={setEditing}
                onSave={saveRule}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : null}
          {rules.some((rule) => rule.type !== 'line') ? null : (
            <li className="wizard-rule wizard-rule--fixed">
              <span className="wizard-rule__number" aria-hidden="true">
                {rules.length + 1}
              </span>
              <span className="wizard-rule__body">
                <span className="wizard-rule__title">{text.shared}</span>
                <span className="wizard-rule__sub">{text.sharedSub}</span>
              </span>
            </li>
          )}
        </Tray>
        {ruleOptions.length === 0 ? <p className="wizard-hint">{text.noRuleCategories}</p> : null}
        <Button
          variant="secondary"
          icon="plus"
          className="wizard-panel__action"
          disabled={implicitTotal || !firstFree || locked}
          onClick={() =>
            firstFree && setEditing({ index: null, line: firstFree.value, dir: 'desc' })
          }
        >
          {text.addRule}
        </Button>
        <Button
          variant="secondary"
          icon="plus"
          className="wizard-panel__action"
          disabled={implicitTotal || locked || rules.some((r) => r.type === 'manual')}
          onClick={() =>
            setRanking({
              ...ranking,
              tiebreak: [...rules.filter((r) => r.type === 'line'), { type: 'manual' }],
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
function RuleEditor({
  draft,
  options,
  onChange,
  onSave,
  onCancel,
}: {
  readonly draft: RuleDraft;
  readonly options: readonly SelectOption<string>[];
  readonly onChange: (draft: RuleDraft) => void;
  readonly onSave: (draft: RuleDraft) => void;
  readonly onCancel: () => void;
}) {
  return (
    <div className="wizard-rule-editor">
      <Select
        label={text.ruleCategory}
        options={options}
        value={draft.line}
        onChange={(line) => onChange({ ...draft, line })}
      />
      <SegmentedControl
        legend={text.direction}
        options={(['desc', 'asc'] as const).map((dir) => ({
          value: dir,
          label: text.directions[dir],
        }))}
        value={draft.dir}
        onChange={(dir) => onChange({ ...draft, dir })}
      />
      <div className="wizard-actions">
        <Button size="sm" icon="check" onClick={() => onSave(draft)}>
          {draft.index === null ? text.ruleAdd : text.ruleSave}
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancel}>
          {text.ruleCancel}
        </Button>
      </div>
    </div>
  );
}
