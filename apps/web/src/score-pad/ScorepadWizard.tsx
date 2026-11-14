import type {
  ScorePadEditorCategoriesAction,
  ScorePadEditorMappingAction,
  ScorePadEditorStatus,
  ScorePadMappingMode,
  ScorePadTemplate,
} from '@bg-club/score-pad';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useAuth } from '../auth/authContext';
import type { Game } from '../games/games';
import { format, t } from '../i18n';
import type { LeaveGuard } from '../popups/popupContext';
import { usePopups } from '../popups/popupContext';
import { PopupModal } from '../popups/PopupModal';
import { useLeaveGuard } from '../popups/useLeaveGuard';
import { Banner, Button, Dialog, Icon, useToast } from '../ui';
import { cx } from '../ui/cx';
import { AreaPanel, AreaToolbar } from './AreaStep';
import { CategoriesPanel, CategoriesToolbar } from './CategoriesStep';
import { MappingPanel, MappingToolbar } from './MappingStep';
import { fewerSeatsMessage, scorepadErrorMessage } from './messages';
import { PhotoStep } from './PhotoStep';
import { ScorePadEditorView, type ScorePadEditorHandle } from './ScorePadEditorView';
import {
  ScorepadError,
  readImportFile,
  saveScorepad,
  scorepadsKey,
  type Scorepad,
} from './scorepads';
import type { ScorePadLoadState } from './useScorePadElement';
import {
  LAST_STEP,
  WIZARD_STEPS,
  canOpenStep,
  editorStepFor,
  isJsonFile,
  isNotImage,
  isStepValid,
  nextStep,
  previousStep,
  stepState,
  type WizardStep,
} from './wizard';
import './wizard.css';

const text = t.scorepads.editor;
const wizard = t.scorepads.wizard;
const area = wizard.area;
const mapping = wizard.mapping;
const categories = wizard.categories;

interface ScorepadWizardProps {
  readonly game: Game;
  readonly scorepadId: string;
  readonly pad: Scorepad | null;
  readonly template: ScorePadTemplate | undefined;
}

/**
 * Potwierdzenie w kreatorze: opuszczenie ze zmianami, zastąpienie bieżącej pracy albo zmiana
 * sposobu mapowania, która usuwa pola i kategorie (EDT-11).
 */
interface Confirm {
  readonly kind: 'leave' | 'replacePhoto' | 'replaceFile' | 'changeMapping';
  readonly run: () => void;
}

/** Edytor był zajęty (np. prostował kartkę): wczytanie pominięte, nic się nie zmieniło. */
const editorBusy = (error: unknown) => (error as { reason?: unknown }).reason === 'busy';

/**
 * Kreator edytora notesu (PRD §5.5.2, EDT-1, EDT-9, DS §18): pięć kroków nad jednym edytorem
 * `<score-pad-editor>`, więc powrót do wcześniejszego kroku nie gubi danych. Na desktopie
 * modal 1120 px z pigułkami kroków, na telefonie arkusz z paskiem postępu.
 *
 * - Krok 1 (Zdjęcie) prowadzi aplikacja: plik, przeciągnięcie, schowek, aparat lub kamera
 *   i import `.json`. Krok 2 (Obszar kartki, EDT-10) to scena edytora z punktami obszaru
 *   i panel aplikacji. Krok 3 (Mapowanie pól, EDT-11) to scena edytora z polami i panel
 *   aplikacji: prostokąty ręczne albo wykryta tabela; zmiana sposobu z polami pyta o zgodę.
 *   Krok 4 (Kategorie, EDT-13) to kartka z numerami kategorii i panel aplikacji: nazwa, typ,
 *   zakres, sumy i opis kategorii oraz kategoria decydująca, kierunek i reguły remisów.
 *   Krok 5 (Test i zapis) to na razie podsumowanie (zadanie [022]).
 * - „Dalej” jest wyłączone, dopóki bieżący krok nie jest poprawny. Pigułki odwiedzonych kroków
 *   są klikalne; edycja notesu i import pliku otwierają kreator z wszystkimi krokami wykonanymi.
 * - Zmiany są chronione: zamknięcie (Esc, ←, ×, tło, Wstecz w przeglądarce) pyta o odrzucenie
 *   zmian, a zastąpienie zdjęcia po mapowaniu pól pyta o potwierdzenie.
 */
export function ScorepadWizard({ game, scorepadId, pad, template }: ScorepadWizardProps) {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { back } = usePopups();
  const editor = useRef<ScorePadEditorHandle>(null);
  // Szablon z chwili otwarcia: odświeżenie danych w tle (np. zmiana nazwy w innym oknie) nie
  // tworzy edytora od nowa i nie gubi niezapisanych zmian.
  const [initial] = useState(() => ({
    template,
    previousImage:
      template?.image && pad?.current?.image_path
        ? { url: template.image, path: pad.current.image_path }
        : undefined,
    nextVersion: (pad?.current?.version ?? 0) + 1,
  }));
  const [step, setStep] = useState<WizardStep>(1);
  const [reached, setReached] = useState<WizardStep>(template ? LAST_STEP : 1);
  const [status, setStatus] = useState<ScorePadEditorStatus | null>(null);
  const [editorLoad, setEditorLoad] = useState<{ state: ScorePadLoadState; retry: () => void }>({
    state: 'loading',
    retry: () => undefined,
  });
  const [loading, setLoading] = useState(false);
  const [photoError, setPhotoError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);
  const [confirm, setConfirm] = useState<Confirm | undefined>(undefined);
  const restoreFocus = useRef<Element | null>(null);

  const dirty = status?.dirty ?? false;
  const guard = useCallback<LeaveGuard>((leave) => {
    restoreFocus.current = document.activeElement;
    setConfirm({ kind: 'leave', run: leave });
  }, []);
  const { release } = useLeaveGuard(dirty ? guard : null);

  const onStatus = useCallback((next: ScorePadEditorStatus) => setStatus(next), []);
  const onLoadState = useCallback((state: ScorePadLoadState, retry: () => void) => {
    setEditorLoad({ state, retry });
  }, []);

  // Krok edytora idzie za krokiem kreatora (kroki 4 i 5 potrzebują kartki z kroku 3).
  useEffect(() => {
    if (editorLoad.state !== 'ready' || !status?.photo || status.busy) return;
    const want = editorStepFor(step);
    if (status.step !== want) editor.current?.goStep(want);
  }, [step, editorLoad.state, status]);

  const goTo = (target: WizardStep) => {
    if (target === step || !canOpenStep(target, step, reached, status)) return;
    setStep(target);
    if (target > reached) setReached(target);
    setSaveError(undefined);
  };

  const ask = (kind: 'replacePhoto' | 'replaceFile', run: () => void) => {
    // Bez zmapowanych pól nie ma czego tracić: zdjęcie zmienia się od razu.
    if (!status?.photo || reached < 3) {
      run();
      return;
    }
    restoreFocus.current = document.activeElement;
    setConfirm({ kind, run });
  };

  const loadPhoto = (file: File | Blob) => {
    if (isJsonFile(file)) {
      importFile(file);
      return;
    }
    setNotice(undefined);
    if (isNotImage(file)) {
      setPhotoError(wizard.errors.type);
      return;
    }
    ask('replacePhoto', () => {
      setPhotoError(undefined);
      setLoading(true);
      (editor.current?.loadPhoto(file) ?? Promise.reject(new Error('editor')))
        .then(() => {
          // Nowe zdjęcie: obszar, pola i kategorie od nowa.
          setReached(1);
          setStep(1);
        })
        .catch((error: unknown) => {
          if (editorBusy(error)) return;
          const reason = (error as { reason?: unknown }).reason;
          setPhotoError(reason === 'type' ? wizard.errors.type : wizard.errors.image);
        })
        .finally(() => setLoading(false));
    });
  };

  const importFile = (file: File | Blob) => {
    setNotice(undefined);
    ask('replaceFile', () => {
      setPhotoError(undefined);
      setLoading(true);
      readImportFile(file)
        .then(async (value) => {
          const imported = value as ScorePadTemplate;
          if (!imported.image) {
            setPhotoError(wizard.errors.noImage);
            return;
          }
          const handle = editor.current;
          if (!handle) throw new Error('editor');
          await handle.loadTemplate(imported);
          setReached(LAST_STEP);
          setStep(1);
          setNotice(format(wizard.imported, { name: imported.name }));
        })
        .catch((error: unknown) => {
          if (editorBusy(error)) return;
          setPhotoError(
            error instanceof ScorepadError ? scorepadErrorMessage(error) : wizard.errors.image,
          );
        })
        .finally(() => setLoading(false));
    });
  };

  const save = useMutation({
    mutationFn: () => {
      const config = editor.current?.exportConfig();
      if (!config?.template) throw new ScorepadError('incomplete');
      return saveScorepad(client, {
        gameId: game.id,
        scorepadId,
        template: config.template,
        previousImage: initial.previousImage,
      });
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: scorepadsKey });
      toast.show(
        pad
          ? format(t.scorepads.toasts.saved, { name: saved.name, version: saved.version })
          : format(t.scorepads.toasts.created, { name: saved.name }),
        'success',
      );
      const warning = fewerSeatsMessage(saved.playerSlots, game.max_players);
      if (warning) toast.show(warning, 'neutral');
      // Zapisany notes nie ma już czego chronić.
      release();
      back();
    },
    onError: (failure) => {
      if (failure instanceof ScorepadError && failure.reason === 'gone') {
        void queryClient.invalidateQueries({ queryKey: scorepadsKey });
      }
      setSaveError(scorepadErrorMessage(failure));
    },
  });

  const busy =
    loading ||
    (status?.busy ?? false) ||
    (!!initial.template && !status?.photo && !status?.openFailed && editorLoad.state !== 'error');
  const valid = isStepValid(step, status);
  // Ctrl+Z w panelu obszaru (poza polami tekstowymi) cofa zmianę obszaru jak na scenie.
  const onAreaKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (event.key.toLowerCase() !== 'z' || event.shiftKey) return;
    const target = event.target;
    // Pola tekstowe mają własne cofanie wpisanego tekstu.
    const typing =
      'input:not([type=radio]):not([type=checkbox]):not([type=range]), textarea, [contenteditable]';
    if (target instanceof HTMLElement && target.closest(typing)) return;
    event.preventDefault();
    editor.current?.undoArea();
  };
  // Ctrl+Z w panelu mapowania (poza polami tekstowymi) cofa zmianę mapowania jak na scenie.
  const onMappingKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (event.key.toLowerCase() !== 'z' || event.shiftKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('input[type=text], textarea')) return;
    event.preventDefault();
    editor.current?.editMapping({ type: 'undo' });
  };
  const editMapping = (action: ScorePadEditorMappingAction) => editor.current?.editMapping(action);
  const editCategories = (action: ScorePadEditorCategoriesAction) =>
    editor.current?.editCategories(action);
  const changeMapping = (mode: ScorePadMappingMode) => {
    if (!status || mode === status.mapping.mode) return;
    // EDT-11: tryby się wykluczają; z polami lub kategoriami najpierw pytamy.
    if (!status.mapping.hasContent) {
      editMapping({ type: 'mode', mode });
      return;
    }
    restoreFocus.current = document.activeElement;
    setConfirm({ kind: 'changeMapping', run: () => editMapping({ type: 'mode', mode }) });
  };
  const closeConfirm = () => {
    setConfirm(undefined);
    const target = restoreFocus.current;
    restoreFocus.current = null;
    if (target instanceof HTMLElement && target.isConnected) target.focus();
  };

  const footer = (
    <>
      {step > 1 ? (
        <Button
          variant="secondary"
          icon="chevron-left"
          className="wizard-footer__back"
          onClick={() => goTo(previousStep(step))}
        >
          {wizard.back}
        </Button>
      ) : null}
      {step < LAST_STEP ? (
        <Button
          className="wizard-footer__next"
          disabled={!valid || busy}
          onClick={() => goTo(nextStep(step))}
        >
          {wizard.next}
        </Button>
      ) : (
        <Button
          icon="check"
          className="wizard-footer__next"
          disabled={!valid || busy}
          loading={save.isPending}
          onClick={() => {
            setSaveError(undefined);
            save.mutate();
          }}
        >
          {text.save}
        </Button>
      )}
    </>
  );

  return (
    <>
      <PopupModal
        title={pad ? text.editTitle : text.addTitle}
        count={game.title}
        width={1120}
        className="scorepad-wizard"
        blocked={confirm !== undefined}
        footer={footer}
      >
        <WizardSteps step={step} reached={reached} status={status} onOpen={goTo} />
        {/* Treść kroku przewija się na telefonie: fokus z klawiatury pozwala ją przewinąć. */}
        <div
          className="wizard-content"
          role="group"
          aria-label={wizard.steps[step - 1]}
          tabIndex={0}
        >
          {status?.openFailed && step === 1 ? (
            <Banner variant="error">{wizard.errors.open}</Banner>
          ) : null}
          {step === 1 ? (
            <PhotoStep
              photoUrl={status?.photoUrl ?? ''}
              busy={busy}
              editorState={editorLoad.state}
              onRetryEditor={editorLoad.retry}
              error={photoError}
              notice={notice}
              onFile={loadPhoto}
              onImport={importFile}
            />
          ) : null}
          {/* Jeden edytor dla kroków 2–4 (ukryty w pozostałych, ale zamontowany): obok sceny
              jest panel aplikacji dla obszaru, mapowania pól albo kategorii. */}
          <div
            className={cx(
              'wizard-work',
              step >= 2 && step <= 4 && 'wizard-body wizard-work--area',
              (step === 1 || step === 5) && 'wizard-editor--hidden',
            )}
            onKeyDown={step === 2 ? onAreaKeyDown : step === 3 ? onMappingKeyDown : undefined}
          >
            <div
              className="wizard-editor"
              aria-label={
                step === 2
                  ? area.stage
                  : step === 3
                    ? mapping.stage
                    : step === 4
                      ? categories.stage
                      : undefined
              }
            >
              <ScorePadEditorView
                ref={editor}
                wizard
                template={initial.template}
                onStatus={onStatus}
                onLoadState={onLoadState}
                className="wizard-editor__view"
              />
              {step === 2 && status?.photo ? (
                <AreaToolbar
                  canUndo={status.settings.canUndo}
                  disabled={busy}
                  onRotate={(dir) => editor.current?.rotatePhoto(dir)}
                  onUndo={() => editor.current?.undoArea()}
                />
              ) : null}
              {step === 3 && status?.photo && status.step === 3 ? (
                <MappingToolbar mapping={status.mapping} disabled={busy} onAction={editMapping} />
              ) : null}
              {step === 4 && status?.photo && status.step === 4 ? (
                <CategoriesToolbar
                  zoomed={status.categories.zoomed}
                  disabled={busy}
                  onAction={editCategories}
                />
              ) : null}
            </div>
            {step === 2 && status?.photo ? (
              <AreaPanel
                settings={status.settings}
                onChange={(patch) => editor.current?.setArea(patch)}
              />
            ) : null}
            {step === 3 && status?.photo && status.step === 3 ? (
              <MappingPanel
                mapping={status.mapping}
                maxPlayers={game.max_players}
                onAction={editMapping}
                onModeChange={changeMapping}
              />
            ) : null}
            {step === 4 && status?.photo && status.step === 4 ? (
              <CategoriesPanel
                categories={status.categories}
                fieldsProblem={status.fields}
                onAction={editCategories}
              />
            ) : null}
          </div>
          {step === 5 && status ? (
            <TestAndSave
              status={status}
              maxPlayers={game.max_players}
              versionNote={
                pad?.current ? format(text.versionNote, { n: initial.nextVersion }) : undefined
              }
              error={saveError}
            />
          ) : null}
        </div>
      </PopupModal>
      {confirm ? <ConfirmDialog confirm={confirm} onClose={closeConfirm} /> : null}
    </>
  );
}

/** Pigułki kroków (desktop, DS §15) i pasek postępu „Krok 2 z 5” (telefon, DS §18). */
function WizardSteps({
  step,
  reached,
  status,
  onOpen,
}: {
  readonly step: WizardStep;
  readonly reached: WizardStep;
  readonly status: ScorePadEditorStatus | null;
  readonly onOpen: (step: WizardStep) => void;
}) {
  const name = (n: WizardStep) => wizard.steps[n - 1] ?? '';
  return (
    <>
      <nav className="wizard-steps" aria-label={wizard.stepsLabel}>
        <ol className="wizard-steps__list">
          {WIZARD_STEPS.map((n) => {
            const state = stepState(n, step, reached, status);
            const open = state !== 'current' && canOpenStep(n, step, reached, status);
            return (
              <li key={n}>
                <button
                  type="button"
                  className={cx('wizard-pill', `wizard-pill--${state}`)}
                  aria-current={state === 'current' ? 'step' : undefined}
                  aria-label={
                    state === 'done'
                      ? format(wizard.stepDone, { name: name(n) })
                      : format(state === 'current' ? wizard.stepCurrent : wizard.stepUpcoming, {
                          n,
                          name: name(n),
                        })
                  }
                  disabled={state !== 'current' && !open}
                  onClick={() => onOpen(n)}
                >
                  {state === 'done' ? <Icon name="check" size={14} /> : <span>{n}.</span>}
                  <span>{name(n)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="wizard-progress">
        <p className="wizard-progress__label">
          <span className="wizard-progress__count">
            {format(wizard.stepOf, { n: step, total: LAST_STEP })}
          </span>
          <span className="wizard-progress__name">{name(step)}</span>
        </p>
        <div className="wizard-progress__bar" aria-hidden="true">
          {WIZARD_STEPS.map((n) => (
            <span key={n} className={cx('wizard-progress__segment', n <= step && 'is-on')} />
          ))}
        </div>
      </div>
    </>
  );
}

/** Krok 5 (do czasu zadania [022]): kartka, liczby i zapis (EDT-1, EDT-6). */
function TestAndSave({
  status,
  maxPlayers,
  versionNote,
  error,
}: {
  readonly status: ScorePadEditorStatus;
  readonly maxPlayers: number;
  readonly versionNote: string | undefined;
  readonly error: string | undefined;
}) {
  const text = wizard.test;
  const warning = fewerSeatsMessage(status.seats, maxPlayers);
  return (
    <div className="wizard-body">
      <div className="wizard-stage wizard-stage--sheet">
        {status.sheetUrl ? (
          <img className="wizard-photo__preview" src={status.sheetUrl} alt={text.sheet} />
        ) : null}
      </div>
      <div className="wizard-panel">
        {error ? <Banner variant="error">{error}</Banner> : null}
        <Banner variant="info">{text.intro}</Banner>
        <div className="wizard-stats">
          <div className="wizard-stat">
            <span className="wizard-stat__number">{status.seats}</span>
            <span className="wizard-stat__label">{text.seats}</span>
          </div>
          <div className="wizard-stat">
            <span className="wizard-stat__number">{status.lines.length}</span>
            <span className="wizard-stat__label">{text.categories}</span>
          </div>
        </div>
        {warning ? <Banner variant="warning">{warning}</Banner> : null}
        {versionNote ? <p className="scorepads__note">{versionNote}</p> : null}
      </div>
    </div>
  );
}

/** Dialog potwierdzenia nad kreatorem (DS §7 „Small dialog”); Esc i tło anulują. */
function ConfirmDialog({
  confirm,
  onClose,
}: {
  readonly confirm: Confirm;
  /** Zamyka dialog i oddaje fokus elementowi w kreatorze, z którego go otwarto. */
  readonly onClose: () => void;
}) {
  const copy =
    confirm.kind === 'leave'
      ? { ...wizard.leave, cancel: wizard.leave.stay, confirm: wizard.leave.discard }
      : wizard[confirm.kind];
  const destructive = confirm.kind === 'leave' || confirm.kind === 'changeMapping';
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    // Esc zamyka tylko dialog, nie popup pod nim (PopupHost pomija obsłużone Esc).
    event.preventDefault();
    onClose();
  };
  return (
    <div className="wizard-confirm" onKeyDown={onKeyDown}>
      <Dialog
        title={copy.title}
        description={copy.description}
        icon={destructive ? 'alert' : 'image'}
        tone={destructive ? 'danger' : 'accent'}
        onScrimClick={onClose}
        footer={
          <>
            <Button variant="secondary" autoFocus onClick={onClose}>
              {copy.cancel}
            </Button>
            <Button
              variant={destructive ? 'destructive' : 'primary'}
              onClick={() => {
                onClose();
                confirm.run();
              }}
            >
              {copy.confirm}
            </Button>
          </>
        }
      />
    </div>
  );
}
