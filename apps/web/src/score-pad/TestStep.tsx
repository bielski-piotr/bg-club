import {
  FINAL_TOTAL,
  type ScorePadEditorStatus,
  type ScorePadFile,
  type ScorePadSaveDetail,
  type ScorePadTemplate,
} from '@bg-club/score-pad';
import type * as TemplateTools from '@bg-club/score-pad/template';
import type { SheetResult } from '@bg-club/score-pad/template';
import {
  hasManualTiebreak,
  manualTieGroups,
  resolveManualTies,
  type RankedPlayer,
} from '@bg-club/scoring';
import { createMemo, createSignal, For, onSettled, Show } from 'solid-js';
import { format, t } from '../i18n';
import { Banner, Button, Checkbox, Spinner } from '../ui';
import { ManualTieControls } from './ManualTieControls';
import { fewerSeatsMessage } from './messages';
import { ScorePadView, type ScorePadHandle } from './ScorePadView';

const text = t.scorepads.wizard.test;

type Tools = typeof TemplateTools;

/** Nazwa kategorii szablonu do opisu wyniku testu. */
function lineLabel(template: ScorePadTemplate, id: string): string {
  if (id === FINAL_TOTAL) return text.finalTotal;
  return template.lines.find((line) => line.id === id)?.label || id;
}

interface TestStepProps {
  /** Szablon z edytora (ze zdjęciem kartki) z chwili wejścia w krok. */
  readonly template: ScorePadTemplate;
  readonly status: ScorePadEditorStatus;
  readonly maxPlayers: number;
  readonly versionNote: string | undefined;
  readonly error: string | undefined;
}

interface ManualState {
  readonly ranked: readonly RankedPlayer[];
  readonly rows: readonly SheetResult[];
}

/**
 * Krok 5 kreatora „Test i zapis”: notes 3D jak w partii
 * z fikcyjnymi graczami. „Wypełnij losowo” wpisuje wartości zgodne z zakresami kategorii,
 * opcjonalnie z remisem na kategorii decydującej. Oderwanie karteczki (gestem albo przyciskiem)
 * pokazuje miejsca policzone tymi samymi regułami co partia; nic nie trafia do bazy ani historii.
 * Test jest opcjonalny: „Zapisz notes” w stopce działa od razu.
 */
export function TestStep(props: TestStepProps) {
  let pad: ScorePadHandle | undefined;
  const [tools, setTools] = createSignal<Tools | null>(null);
  const [toolsFailed, setToolsFailed] = createSignal(false);
  const [ready, setReady] = createSignal(false);
  const [tie, setTie] = createSignal(false);
  const [results, setResults] = createSignal<readonly SheetResult[] | null>(null);
  // Nowy obiekt = nowe kontrolki remisów: `<Show keyed>` tworzy je od nowa.
  const [manual, setManual] = createSignal<ManualState | null>(null);
  // Stabilny plik notesu: nowa referencja utworzyłaby notes od nowa (i wyczyściła kartkę).
  // Kartka startowa ma tylko fikcyjnych graczy „Gracz 1…n”, po jednym na miejsce notesu.
  const config = createMemo<ScorePadFile | null>(() => {
    const template = props.template;
    const sheet = tools()?.testSheet(template);
    return sheet ? { format: 'score-pad', version: 2, template, active: template.id, sheet } : null;
  });
  const deciding = createMemo(() => {
    const loaded = tools();
    return loaded ? lineLabel(props.template, loaded.rankingLine(props.template)) : null;
  });
  const warning = () => fewerSeatsMessage(props.status.seats, props.maxPlayers);
  const canTest = () => ready() && tools() !== null;

  onSettled(() => {
    let cancelled = false;
    import('@bg-club/score-pad/template').then(
      (module) => {
        if (!cancelled) setTools(module);
      },
      () => {
        if (!cancelled) setToolsFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  });

  const onSave = (detail: ScorePadSaveDetail) => {
    const loaded = tools();
    if (loaded) {
      const rows = loaded.sheetResults(props.template, detail.sheet);
      setResults(rows);
      setManual({ ranked: detail.results, rows });
    }
  };

  const fill = () => {
    const sheet = tools()?.testSheet(props.template, { fill: true, tie: tie() });
    if (!sheet) return;
    setResults(null);
    setManual(null);
    pad?.setSheet(sheet);
  };

  return (
    <div class="wizard-body">
      <div class="wizard-stage wizard-test" role="group" aria-label={text.stage}>
        <Show
          when={config()}
          fallback={
            <Show when={!toolsFailed()}>
              <div class="wizard-test__loading">
                <Spinner label={t.scorePad.loadingPad} />
              </div>
            </Show>
          }
        >
          {(file) => (
            <ScorePadView
              ref={(handle) => (pad = handle)}
              config={file()}
              controls={false}
              help={false}
              test
              summary={!hasManualTiebreak(props.template)}
              onReady={() => setReady(true)}
              onLoadState={(state) => {
                if (state !== 'ready') setReady(false);
              }}
              // Każde oderwanie (także pustej kartki) kończy poprzedni wynik testu.
              onTear={() => {
                setResults(null);
                setManual(null);
              }}
              onSave={onSave}
              class="wizard-test__pad"
            />
          )}
        </Show>
      </div>
      <div class="wizard-panel">
        <Show when={props.error}>{(error) => <Banner variant="error">{error()}</Banner>}</Show>
        <Banner variant="info">{text.intro}</Banner>
        <Show when={toolsFailed()}>
          <Banner variant="warning">{text.toolsError}</Banner>
        </Show>
        <div class="wizard-actions">
          <Button variant="secondary" icon="dice" disabled={!canTest()} onClick={fill}>
            {text.fill}
          </Button>
          <Button
            variant="secondary"
            icon="tear-off"
            disabled={!canTest()}
            onClick={() => pad?.tear()}
          >
            {text.tear}
          </Button>
        </div>
        <Checkbox label={text.tie} checked={tie()} onCheckedChange={setTie} />
        <Show when={manual()} keyed>
          {(current) => (
            <ManualTieControls
              groups={manualTieGroups(props.template, current.ranked)}
              nameOf={(seat) => current.rows.find((row) => row.seat === seat)?.name ?? ''}
              onChange={(decisions) => {
                const ranked = resolveManualTies(props.template, current.ranked, decisions);
                setResults(
                  ranked.flatMap((row) => {
                    const original = current.rows.find((r) => r.seat === row.seat);
                    return original ? [{ ...original, place: row.place, tied: row.tied }] : [];
                  }),
                );
              }}
            />
          )}
        </Show>
        <section class="wizard-result" aria-labelledby="wizard-result-title">
          <h3 id="wizard-result-title" class="wizard-panel__title">
            {text.result}
          </h3>
          <Show when={deciding()}>
            {(line) => <p class="wizard-hint">{format(text.resultBy, { line: line() })}</p>}
          </Show>
          <div class="wizard-result__tray" aria-live="polite">
            <Show
              when={(results()?.length ?? 0) > 0}
              fallback={<p class="wizard-result__empty">{text.resultEmpty}</p>}
            >
              <ol class="wizard-result__list">
                <For each={results() ?? []} keyed={(row) => row.seat}>
                  {(row) => <ResultRow row={row()} template={props.template} />}
                </For>
              </ol>
            </Show>
          </div>
        </section>
        <Show when={warning()}>{(message) => <Banner variant="warning">{message()}</Banner>}</Show>
        <p class="wizard-hint">{text.optional}</p>
        <Show when={props.versionNote}>{(note) => <p class="scorepads__note">{note()}</p>}</Show>
      </div>
    </div>
  );
}

function ResultRow(props: { readonly row: SheetResult; readonly template: ScorePadTemplate }) {
  const note = () =>
    props.row.tied
      ? text.shared
      : props.row.decidedBy
        ? format(text.decidedBy, { line: lineLabel(props.template, props.row.decidedBy) })
        : undefined;
  return (
    <li class={['wizard-result__row', { 'is-first': props.row.place === 1 }]}>
      <span class="wizard-result__place">{format(text.place, { place: props.row.place })}</span>
      <span class="wizard-result__player">
        <span class="wizard-result__name">{props.row.name}</span>
        <Show when={note()}>{(value) => <span class="wizard-result__note">{value()}</span>}</Show>
      </span>
      <span class="wizard-result__score">
        {props.row.value === null ? text.noValue : String(props.row.value)}
      </span>
    </li>
  );
}
