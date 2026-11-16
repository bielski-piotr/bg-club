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
import { ManualTieControls } from './ManualTieControls';
import { useEffect, useMemo, useRef, useState } from 'react';
import { format, t } from '../i18n';
import { Banner, Button, Checkbox, IconButton, Spinner } from '../ui';
import { cx } from '../ui/cx';
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

/**
 * Krok 5 kreatora „Test i zapis” (EDT-14, EDT-1, DS §18): notes 3D jak w partii (PAD-10…PAD-16)
 * z fikcyjnymi graczami. „Wypełnij losowo” wpisuje wartości zgodne z zakresami kategorii,
 * opcjonalnie z remisem na kategorii decydującej. Oderwanie karteczki (gestem albo przyciskiem)
 * pokazuje miejsca policzone tymi samymi regułami co partia; nic nie trafia do bazy ani historii.
 * Test jest opcjonalny: „Zapisz notes” w stopce działa od razu.
 */
export function TestStep({ template, status, maxPlayers, versionNote, error }: TestStepProps) {
  const pad = useRef<ScorePadHandle>(null);
  const [tools, setTools] = useState<Tools | null>(null);
  const [toolsFailed, setToolsFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [tie, setTie] = useState(false);
  const [results, setResults] = useState<readonly SheetResult[] | null>(null);
  const manualRevision = useRef(0);
  const [manual, setManual] = useState<{
    ranked: readonly RankedPlayer[];
    rows: readonly SheetResult[];
    key: number;
  } | null>(null);
  // Stabilny plik notesu: nowa referencja utworzyłaby notes od nowa (i wyczyściła kartkę).
  // Kartka startowa ma tylko fikcyjnych graczy „Gracz 1…n”, po jednym na miejsce notesu.
  const config = useMemo<ScorePadFile | null>(() => {
    const sheet = tools?.testSheet(template);
    return sheet ? { format: 'score-pad', version: 2, template, active: template.id, sheet } : null;
  }, [tools, template]);
  const deciding = useMemo(
    () => (tools ? lineLabel(template, tools.rankingLine(template)) : null),
    [tools, template],
  );

  useEffect(() => {
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
  }, []);

  const onSave = (detail: ScorePadSaveDetail) => {
    if (tools) {
      const rows = tools.sheetResults(template, detail.sheet);
      setResults(rows);
      manualRevision.current += 1;
      setManual({ ranked: detail.results, rows, key: manualRevision.current });
    }
  };

  const fill = () => {
    const sheet = tools?.testSheet(template, { fill: true, tie });
    if (!sheet) return;
    setResults(null);
    setManual(null);
    pad.current?.setSheet(sheet);
  };

  const warning = fewerSeatsMessage(status.seats, maxPlayers);
  const canTest = ready && tools !== null;

  return (
    <div className="wizard-body">
      <div className="wizard-stage wizard-test" role="group" aria-label={text.stage}>
        {config ? (
          <ScorePadView
            ref={pad}
            config={config}
            controls={false}
            help={false}
            test
            summary={!hasManualTiebreak(template)}
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
            className="wizard-test__pad"
          />
        ) : toolsFailed ? null : (
          <div className="wizard-test__loading">
            <Spinner label={t.scorePad.loadingPad} />
          </div>
        )}
        {ready ? (
          <div className="wizard-toolbar" role="toolbar" aria-label={text.toolbar}>
            <IconButton
              icon="target"
              label={text.topView}
              className="wizard-toolbar__btn"
              onClick={() => pad.current?.resetView()}
            />
          </div>
        ) : null}
      </div>
      <div className="wizard-panel">
        {error ? <Banner variant="error">{error}</Banner> : null}
        <Banner variant="info">{text.intro}</Banner>
        {toolsFailed ? <Banner variant="warning">{text.toolsError}</Banner> : null}
        <div className="wizard-actions">
          <Button variant="secondary" icon="dice" disabled={!canTest} onClick={fill}>
            {text.fill}
          </Button>
          <Button
            variant="secondary"
            icon="tear-off"
            disabled={!canTest}
            onClick={() => pad.current?.tear()}
          >
            {text.tear}
          </Button>
        </div>
        <Checkbox label={text.tie} checked={tie} onCheckedChange={setTie} />
        {manual ? (
          <ManualTieControls
            key={manual.key}
            groups={manualTieGroups(template, manual.ranked)}
            nameOf={(seat) => manual.rows.find((row) => row.seat === seat)?.name ?? ''}
            onChange={(decisions) => {
              const ranked = resolveManualTies(template, manual.ranked, decisions);
              setResults(
                ranked.flatMap((row) => {
                  const original = manual.rows.find((r) => r.seat === row.seat);
                  return original ? [{ ...original, place: row.place, tied: row.tied }] : [];
                }),
              );
            }}
          />
        ) : null}
        <section className="wizard-result" aria-labelledby="wizard-result-title">
          <h3 id="wizard-result-title" className="wizard-panel__title">
            {text.result}
          </h3>
          {deciding ? (
            <p className="wizard-hint">{format(text.resultBy, { line: deciding })}</p>
          ) : null}
          <div className="wizard-result__tray" aria-live="polite">
            {results && results.length > 0 ? (
              <ol className="wizard-result__list">
                {results.map((row) => (
                  <ResultRow key={row.seat} row={row} template={template} />
                ))}
              </ol>
            ) : (
              <p className="wizard-result__empty">{text.resultEmpty}</p>
            )}
          </div>
        </section>
        {warning ? <Banner variant="warning">{warning}</Banner> : null}
        <p className="wizard-hint">{text.optional}</p>
        {versionNote ? <p className="scorepads__note">{versionNote}</p> : null}
      </div>
    </div>
  );
}

function ResultRow({
  row,
  template,
}: {
  readonly row: SheetResult;
  readonly template: ScorePadTemplate;
}) {
  const note = row.tied
    ? text.shared
    : row.decidedBy
      ? format(text.decidedBy, { line: lineLabel(template, row.decidedBy) })
      : undefined;
  const value = row.value === null ? text.noValue : String(row.value);
  return (
    <li className={cx('wizard-result__row', row.place === 1 && 'is-first')}>
      <span className="wizard-result__place">{format(text.place, { place: row.place })}</span>
      <span className="wizard-result__player">
        <span className="wizard-result__name">{row.name}</span>
        {note ? <span className="wizard-result__note">{note}</span> : null}
      </span>
      <span className="wizard-result__score">{value}</span>
    </li>
  );
}
