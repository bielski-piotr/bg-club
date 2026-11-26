/** @jsxImportSource @solidjs/web */
import type {
  ScorePadEditorCategoriesAction,
  ScorePadEditorMappingAction,
  ScorePadEditorStatus,
  ScorePadMappingMode,
  ScorePadTemplate,
  ScorePadZoomAction,
} from '@bg-club/score-pad';
import { createEffect, createMemo, createSignal, For, onSettled, Show, useContext } from 'solid-js';
import type { Game } from '../games/games';
import { format, t } from '../i18n';
import type { LeaveGuard } from '../popups/popupContext';
import { AuthContext, PopupsContext, QueryClientContext, ToastContext } from '../solid/context';
import { createLeaveGuard } from '../solid/popups/leaveGuard';
import { PopupModal } from '../solid/popups/PopupModal';
import { QueryStatus } from '../solid/popups/QueryStatus';
import { createMutation } from '../solid/query';
import { Banner, Button, Dialog, Icon, Spinner } from '../solid/ui';
import { AreaPanel, AreaToolbar } from './AreaStep';
import { CategoriesPanel, CategoriesToolbar } from './CategoriesStep';
import type { ScorePadLoadState } from './createScorePadElement';
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
import { TestStep } from './TestStep';
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

/** Dane kreatora: gra, notes (`null` = nowy) i szablon aktualnej wersji do edycji. */
export interface WizardSource {
  readonly game: Game;
  readonly pad: Scorepad | null;
  readonly template: ScorePadTemplate | undefined;
}

interface ScorepadWizardProps {
  /** Tryb okna (tytuł także w czasie wczytywania). */
  readonly mode: 'add' | 'edit';
  readonly scorepadId: string;
  /** Dane kreatora; `undefined` = jeszcze się wczytują (albo błąd, `isError`). */
  readonly source: WizardSource | undefined;
  /** Notes albo gra nie istnieje (np. stary link). */
  readonly notFound: boolean;
  readonly isError: boolean;
  readonly onRetry: () => void;
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
 *   Krok 5 (Test i zapis, EDT-14) to notes 3D z fikcyjnymi graczami, losowym wypełnieniem
 *   i wynikiem testu (`TestStep`); „Zapisz notes” zapisuje szablon w bazie i zdjęcie w Storage
 *   (EDT-1), także bez testu.
 * - „Dalej” jest wyłączone, dopóki bieżący krok nie jest poprawny. Pigułki odwiedzonych kroków
 *   są klikalne; edycja notesu i import pliku otwierają kreator z wszystkimi krokami wykonanymi.
 * - Zmiany są chronione: zamknięcie (Esc, ←, ×, tło, Wstecz w przeglądarce) pyta o odrzucenie
 *   zmian, a zastąpienie zdjęcia po mapowaniu pól pyta o potwierdzenie.
 * - Jedno okno na wczytywanie danych, kreator i „Nie znaleziono”: fokus ustawiony przez
 *   `PopupHost` zostaje na oknie po wczytaniu.
 */
export function ScorepadWizard(props: ScorepadWizardProps) {
  const auth = useContext(AuthContext);
  const queryClient = useContext(QueryClientContext);
  const toast = useContext(ToastContext);
  const popups = useContext(PopupsContext);
  let editor: ScorePadEditorHandle | undefined;
  // Dane z chwili otwarcia: odświeżenie w tle (np. zmiana nazwy w innym oknie) nie tworzy
  // edytora od nowa i nie gubi niezapisanych zmian.
  let first: WizardSource | undefined;
  const source = createMemo(() => (first ??= props.source));
  const initial = createMemo(() => {
    const current = source();
    if (!current) return undefined;
    const { template, pad } = current;
    return {
      template,
      previousImage:
        template?.image && pad?.current?.image_path
          ? { url: template.image, path: pad.current.image_path }
          : undefined,
      nextVersion: (pad?.current?.version ?? 0) + 1,
    };
  });
  const [step, setStep] = createSignal<WizardStep>(1);
  // Edycja notesu otwiera kreator z wszystkimi krokami wykonanymi.
  const [reached, setReached] = createSignal<WizardStep>(() =>
    source()?.template ? LAST_STEP : 1,
  );
  const [status, setStatus] = createSignal<ScorePadEditorStatus | null>(null);
  const [editorLoad, setEditorLoad] = createSignal<{
    state: ScorePadLoadState;
    retry: () => void;
  }>({ state: 'loading', retry: () => undefined });
  const [loading, setLoading] = createSignal(false);
  const [photoError, setPhotoError] = createSignal<string | undefined>(undefined);
  const [notice, setNotice] = createSignal<string | undefined>(undefined);
  const [saveError, setSaveError] = createSignal<string | undefined>(undefined);
  const [confirm, setConfirm] = createSignal<Confirm | undefined>(undefined);
  // Szablon do testu w kroku 5 (EDT-14), pobrany z edytora przy wejściu w krok.
  // `undefined`: jeszcze nie pobrany, `null`: edytor nie oddał szablonu (zapis pokaże błąd).
  const [testTemplate, setTestTemplate] = createSignal<ScorePadTemplate | null | undefined>(
    undefined,
  );
  let restoreFocus: Element | null = null;

  const dirty = () => status()?.dirty ?? false;
  const guard: LeaveGuard = (leave) => {
    restoreFocus = document.activeElement;
    setConfirm({ kind: 'leave', run: leave });
  };
  const { release } = createLeaveGuard(() => (dirty() ? guard : null));

  // Krok edytora idzie za krokiem kreatora (kroki 4 i 5 potrzebują kartki z kroku 3).
  createEffect(
    () => {
      const current = status();
      if (editorLoad().state !== 'ready' || !current?.photo || current.busy) return null;
      const want = editorStepFor(step());
      return current.step === want ? null : want;
    },
    (want) => {
      if (want !== null) editor?.goStep(want);
    },
  );

  // Krok 5: szablon do testu bierzemy z edytora, gdy ten pokazuje już gotową kartkę (krok 4).
  const testReady = createMemo(() => {
    const current = status();
    return step() === LAST_STEP && current?.step === 4 && !current.busy;
  });
  createEffect(
    () => testReady() && testTemplate() === undefined,
    (take) => {
      if (take) setTestTemplate(editor?.exportConfig()?.template ?? null);
    },
  );

  const goTo = (target: WizardStep) => {
    if (target === step() || !canOpenStep(target, step(), reached(), status())) return;
    if (target !== LAST_STEP) setTestTemplate(undefined);
    setStep(target);
    if (target > reached()) setReached(target);
    setSaveError(undefined);
  };

  const ask = (kind: 'replacePhoto' | 'replaceFile', run: () => void) => {
    // Bez zmapowanych pól nie ma czego tracić: zdjęcie zmienia się od razu.
    if (!status()?.photo || reached() < 3) {
      run();
      return;
    }
    restoreFocus = document.activeElement;
    setConfirm({ kind, run });
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
          if (!editor) throw new Error('editor');
          await editor.loadTemplate(imported);
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
      (editor?.loadPhoto(file) ?? Promise.reject(new Error('editor')))
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

  const save = createMutation({
    mutationFn: () => {
      const config = editor?.exportConfig();
      const current = source();
      if (!config?.template || !current) throw new ScorepadError('incomplete');
      return saveScorepad(auth.client, {
        gameId: current.game.id,
        scorepadId: props.scorepadId,
        template: config.template,
        previousImage: initial()?.previousImage,
      });
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: scorepadsKey });
      toast.show(
        source()?.pad
          ? format(t.scorepads.toasts.saved, { name: saved.name, version: saved.version })
          : format(t.scorepads.toasts.created, { name: saved.name }),
        'success',
      );
      const warning = fewerSeatsMessage(saved.playerSlots, source()?.game.max_players ?? 0);
      if (warning) toast.show(warning, 'neutral');
      // Zapisany notes nie ma już czego chronić.
      release();
      popups.back();
    },
    onError: (failure) => {
      if (failure instanceof ScorepadError && failure.reason === 'gone') {
        void queryClient.invalidateQueries({ queryKey: scorepadsKey });
      }
      setSaveError(scorepadErrorMessage(failure));
    },
  });

  const busy = () => {
    const current = status();
    return (
      loading() ||
      (current?.busy ?? false) ||
      (!!initial()?.template &&
        !current?.photo &&
        !current?.openFailed &&
        editorLoad().state !== 'error')
    );
  };
  const valid = () => isStepValid(step(), status());

  /** Ctrl+Z (bez Shift i Alt) poza polami tekstowymi: `typing` to selektor pól do pominięcia. */
  const undoKey = (event: KeyboardEvent, typing: string) => {
    if (event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.altKey) return false;
    if (event.key.toLowerCase() !== 'z' || event.shiftKey) return false;
    const target = event.target;
    // Pola tekstowe mają własne cofanie wpisanego tekstu.
    if (target instanceof HTMLElement && target.closest(typing)) return false;
    event.preventDefault();
    return true;
  };
  const onWorkKeyDown = (event: KeyboardEvent) => {
    // Ctrl+Z w panelu obszaru cofa zmianę obszaru, w panelu mapowania zmianę mapowania, jak na scenie.
    if (step() === 2) {
      const typing =
        'input:not([type=radio]):not([type=checkbox]):not([type=range]), textarea, [contenteditable]';
      if (undoKey(event, typing)) editor?.undoArea();
    } else if (step() === 3) {
      if (undoKey(event, 'input[type=text], textarea')) editor?.editMapping({ type: 'undo' });
    }
  };
  const editMapping = (action: ScorePadEditorMappingAction) => editor?.editMapping(action);
  const editCategories = (action: ScorePadEditorCategoriesAction) => editor?.editCategories(action);
  const zoom = (by: ScorePadZoomAction) => editor?.zoom(by);
  const changeMapping = (mode: ScorePadMappingMode) => {
    const current = status();
    if (!current || mode === current.mapping.mode) return;
    // EDT-11: tryby się wykluczają; z polami lub kategoriami najpierw pytamy.
    if (!current.mapping.hasContent) {
      editMapping({ type: 'mode', mode });
      return;
    }
    restoreFocus = document.activeElement;
    setConfirm({ kind: 'changeMapping', run: () => editMapping({ type: 'mode', mode }) });
  };
  const closeConfirm = () => {
    setConfirm(undefined);
    const target = restoreFocus;
    restoreFocus = null;
    if (target instanceof HTMLElement && target.isConnected) target.focus();
  };

  /** Status edytora z gotowym zdjęciem w danym kroku edytora (pasek i panel kroków 2–4). */
  const photoAt = (at: WizardStep, editorStep?: number) => {
    const current = status();
    if (step() !== at || !current?.photo) return undefined;
    return editorStep === undefined || current.step === editorStep ? current : undefined;
  };

  const footer = (
    <Show when={initial()}>
      <Show when={step() > 1}>
        <Button
          variant="secondary"
          icon="chevron-left"
          class="wizard-footer__back"
          onClick={() => goTo(previousStep(step()))}
        >
          {wizard.back}
        </Button>
      </Show>
      <Show
        when={step() < LAST_STEP}
        fallback={
          <Button
            icon="check"
            class="wizard-footer__next"
            disabled={!valid() || busy()}
            loading={save.state().isPending}
            onClick={() => {
              setSaveError(undefined);
              save.mutate();
            }}
          >
            {text.save}
          </Button>
        }
      >
        <Button
          class="wizard-footer__next"
          disabled={!valid() || busy()}
          onClick={() => goTo(nextStep(step()))}
        >
          {wizard.next}
        </Button>
      </Show>
    </Show>
  );

  return (
    <>
      <PopupModal
        title={
          props.notFound
            ? text.notFoundTitle
            : props.mode === 'edit'
              ? text.editTitle
              : text.addTitle
        }
        count={source()?.game.title}
        width={props.notFound ? undefined : 1120}
        class={props.notFound ? undefined : 'scorepad-wizard'}
        blocked={confirm() !== undefined}
        footer={footer}
      >
        <Show
          when={!props.notFound && initial()}
          fallback={
            <Show
              when={props.notFound}
              fallback={<QueryStatus isError={props.isError} onRetry={() => props.onRetry()} />}
            >
              <p class="games-not-found">{text.notFoundBody}</p>
            </Show>
          }
        >
          {(start) => (
            <>
              <WizardSteps step={step()} reached={reached()} status={status()} onOpen={goTo} />
              {/* Treść kroku przewija się na telefonie: fokus z klawiatury pozwala ją przewinąć. */}
              <div
                class="wizard-content"
                role="group"
                aria-label={wizard.steps[step() - 1]}
                tabindex={0}
              >
                <Show when={status()?.openFailed && step() === 1}>
                  <Banner variant="error">{wizard.errors.open}</Banner>
                </Show>
                <Show when={step() === 1}>
                  <PhotoStep
                    photoUrl={status()?.photoUrl ?? ''}
                    busy={busy()}
                    editorState={editorLoad().state}
                    onRetryEditor={() => editorLoad().retry()}
                    error={photoError()}
                    notice={notice()}
                    onFile={loadPhoto}
                    onImport={importFile}
                  />
                </Show>
                {/* Jeden edytor dla kroków 2–4 (ukryty w pozostałych, ale zamontowany): obok sceny
                    jest panel aplikacji dla obszaru, mapowania pól albo kategorii. */}
                <div
                  class={[
                    'wizard-work',
                    {
                      'wizard-body wizard-work--area': step() >= 2 && step() <= 4,
                      'wizard-editor--hidden': step() === 1 || step() === 5,
                    },
                  ]}
                  onKeyDown={onWorkKeyDown}
                >
                  <div
                    class="wizard-editor"
                    aria-label={
                      step() === 2
                        ? area.stage
                        : step() === 3
                          ? mapping.stage
                          : step() === 4
                            ? categories.stage
                            : undefined
                    }
                  >
                    <ScorePadEditorView
                      ref={(handle) => (editor = handle)}
                      wizard
                      template={start().template}
                      onStatus={setStatus}
                      onLoadState={(state, retry) => setEditorLoad({ state, retry })}
                      class="wizard-editor__view"
                    />
                    <Show when={photoAt(2)}>
                      {(current) => (
                        <AreaToolbar
                          canUndo={current().settings.canUndo}
                          disabled={busy()}
                          zoom={current().zoom}
                          onRotate={(dir) => editor?.rotatePhoto(dir)}
                          onUndo={() => editor?.undoArea()}
                          onZoom={zoom}
                        />
                      )}
                    </Show>
                    <Show when={photoAt(3, 3)}>
                      {(current) => (
                        <MappingToolbar
                          mapping={current().mapping}
                          zoom={current().zoom}
                          disabled={busy()}
                          onAction={editMapping}
                          onZoom={zoom}
                        />
                      )}
                    </Show>
                    <Show when={photoAt(4, 4)}>
                      {(current) => (
                        <CategoriesToolbar
                          zoomed={current().categories.zoomed}
                          zoom={current().zoom}
                          disabled={busy()}
                          onAction={editCategories}
                          onZoom={zoom}
                        />
                      )}
                    </Show>
                  </div>
                  <Show when={photoAt(2)}>
                    {(current) => (
                      <AreaPanel
                        settings={current().settings}
                        onChange={(patch) => editor?.setArea(patch)}
                      />
                    )}
                  </Show>
                  <Show when={photoAt(3, 3)}>
                    {(current) => (
                      <MappingPanel
                        mapping={current().mapping}
                        maxPlayers={source()?.game.max_players ?? 0}
                        onAction={editMapping}
                        onModeChange={changeMapping}
                      />
                    )}
                  </Show>
                  <Show when={photoAt(4, 4)}>
                    {(current) => (
                      <CategoriesPanel
                        categories={current().categories}
                        fieldsProblem={current().fields}
                        onAction={editCategories}
                      />
                    )}
                  </Show>
                </div>
                <Show when={step() === 5 && !testTemplate()}>
                  <div class="wizard-body">
                    <div class="wizard-stage wizard-test wizard-test__loading">
                      <Show when={testTemplate() === undefined}>
                        <Spinner label={t.scorePad.loadingPad} />
                      </Show>
                    </div>
                    <div class="wizard-panel">
                      <Show when={saveError()}>
                        {(message) => <Banner variant="error">{message()}</Banner>}
                      </Show>
                      <Show when={testTemplate() === null}>
                        <Banner variant="error">
                          {scorepadErrorMessage(new ScorepadError('incomplete'))}
                        </Banner>
                      </Show>
                    </div>
                  </div>
                </Show>
                <Show when={step() === 5 && status() ? testTemplate() : undefined}>
                  {(template) => (
                    <TestStep
                      template={template()}
                      status={status() as ScorePadEditorStatus}
                      maxPlayers={source()?.game.max_players ?? 0}
                      versionNote={
                        source()?.pad?.current
                          ? format(text.versionNote, { n: start().nextVersion })
                          : undefined
                      }
                      error={saveError()}
                    />
                  )}
                </Show>
              </div>
            </>
          )}
        </Show>
      </PopupModal>
      <Show when={confirm()}>
        {(current) => <ConfirmDialog confirm={current()} onClose={closeConfirm} />}
      </Show>
    </>
  );
}

/** Pigułki kroków (desktop, DS §15) i pasek postępu „Krok 2 z 5” (telefon, DS §18). */
function WizardSteps(props: {
  readonly step: WizardStep;
  readonly reached: WizardStep;
  readonly status: ScorePadEditorStatus | null;
  readonly onOpen: (step: WizardStep) => void;
}) {
  const name = (n: WizardStep) => wizard.steps[n - 1] ?? '';
  return (
    <>
      <nav class="wizard-steps" aria-label={wizard.stepsLabel}>
        <ol class="wizard-steps__list">
          <For each={WIZARD_STEPS}>
            {(n) => {
              const state = () => stepState(n, props.step, props.reached, props.status);
              const open = () =>
                state() !== 'current' && canOpenStep(n, props.step, props.reached, props.status);
              return (
                <li>
                  <button
                    type="button"
                    class={['wizard-pill', `wizard-pill--${state()}`]}
                    aria-current={state() === 'current' ? 'step' : undefined}
                    aria-label={
                      state() === 'done'
                        ? format(wizard.stepDone, { name: name(n) })
                        : format(state() === 'current' ? wizard.stepCurrent : wizard.stepUpcoming, {
                            n,
                            name: name(n),
                          })
                    }
                    disabled={state() !== 'current' && !open()}
                    onClick={() => props.onOpen(n)}
                  >
                    <Show when={state() === 'done'} fallback={<span>{n}.</span>}>
                      <Icon name="check" size={14} />
                    </Show>
                    <span>{name(n)}</span>
                  </button>
                </li>
              );
            }}
          </For>
        </ol>
      </nav>
      <div class="wizard-progress">
        <p class="wizard-progress__label">
          <span class="wizard-progress__count">
            {format(wizard.stepOf, { n: props.step, total: LAST_STEP })}
          </span>
          <span class="wizard-progress__name">{name(props.step)}</span>
        </p>
        <div class="wizard-progress__bar" aria-hidden="true">
          <For each={WIZARD_STEPS}>
            {(n) => <span class={['wizard-progress__segment', { 'is-on': n <= props.step }]} />}
          </For>
        </div>
      </div>
    </>
  );
}

/** Dialog potwierdzenia nad kreatorem (DS §7 „Small dialog”); Esc i tło anulują. */
function ConfirmDialog(props: {
  readonly confirm: Confirm;
  /** Zamyka dialog i oddaje fokus elementowi w kreatorze, z którego go otwarto. */
  readonly onClose: () => void;
}) {
  const copy = () => {
    const kind = props.confirm.kind;
    return kind === 'leave'
      ? { ...wizard.leave, cancel: wizard.leave.stay, confirm: wizard.leave.discard }
      : wizard[kind];
  };
  const destructive = () =>
    props.confirm.kind === 'leave' || props.confirm.kind === 'changeMapping';
  let cancel: HTMLButtonElement | undefined;
  // Fokus na „Anuluj” po otwarciu (w React `autoFocus`; atrybut nie działa na wstawionym węźle).
  onSettled(() => {
    cancel?.focus();
  });
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    // Esc zamyka tylko dialog, nie popup pod nim (PopupHost pomija obsłużone Esc).
    event.preventDefault();
    props.onClose();
  };
  return (
    <div class="wizard-confirm" onKeyDown={onKeyDown}>
      <Dialog
        title={copy().title}
        description={copy().description}
        icon={destructive() ? 'alert' : 'image'}
        tone={destructive() ? 'danger' : 'accent'}
        onScrimClick={() => props.onClose()}
        footer={
          <>
            <Button
              ref={(el: HTMLButtonElement) => (cancel = el)}
              variant="secondary"
              onClick={() => props.onClose()}
            >
              {copy().cancel}
            </Button>
            <Button
              variant={destructive() ? 'destructive' : 'primary'}
              onClick={() => {
                const run = props.confirm.run;
                props.onClose();
                run();
              }}
            >
              {copy().confirm}
            </Button>
          </>
        }
      />
    </div>
  );
}
