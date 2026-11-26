import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  For,
  Match,
  Show,
  Switch,
} from 'solid-js';
import { t } from '../i18n';
import { Banner, Button, Icon, Spinner, TextLink } from '../ui';
import { cameraSupported, type CameraProblem } from './camera';
import { CameraCapture } from './CameraCapture';
import type { ScorePadLoadState } from './createScorePadElement';
import { imageFromClipboard } from './wizard';

const text = t.scorepads.wizard;

/** Telefon i tablet: dotyk jako główny wskaźnik, więc aparat systemowy zamiast kamery z podglądem. */
function prefersSystemCamera(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

interface PhotoStepProps {
  /** Podgląd wczytanego zdjęcia albo pusty napis. */
  readonly photoUrl: string;
  /** Trwa wczytywanie zdjęcia, notesu albo modułu edytora. */
  readonly busy: boolean;
  /** Stan modułu edytora: przy błędzie krok pokazuje komunikat z ponowieniem. */
  readonly editorState: ScorePadLoadState;
  readonly onRetryEditor: () => void;
  /** Komunikat o ostatnim nieudanym wczytaniu. */
  readonly error: string | undefined;
  /** Komunikat informacyjny (np. po imporcie pliku). */
  readonly notice: string | undefined;
  /** Wybrany, przeciągnięty, wklejony albo zrobiony plik (zdjęcie lub `.json`). */
  readonly onFile: (file: File | Blob) => void;
  /** Plik `.json` z linku „Importuj plik .json”. */
  readonly onImport: (file: File) => void;
}

/**
 * Krok 1 kreatora: Zdjęcie. Zdjęcie z pliku, przeciągnięte, wklejone
 * schowka albo zrobione: na telefonie aparatem systemowym (tylny aparat), na komputerze kamerą
 * z podglądem. Brak kamery albo odmowa dostępu zostawia ścieżkę z plikiem i komunikat. Tu jest
 * też import pliku notesu `.json`.
 */
export function PhotoStep(props: PhotoStepProps) {
  let fileInput: HTMLInputElement | undefined;
  let cameraInput: HTMLInputElement | undefined;
  let importInput: HTMLInputElement | undefined;
  const tipsId = createUniqueId();
  const [dragging, setDragging] = createSignal(false);
  // Licznik zdarzeń przeciągania: kilka przychodzi przed flushem, więc zwykła zmienna.
  let dragDepth = 0;
  const [camera, setCamera] = createSignal(false);
  const [cameraIssue, setCameraIssue] = createSignal<CameraProblem | undefined>(undefined);
  // Rodzaj wskaźnika sprawdzany raz przy wejściu w krok (jak `useState(prefersSystemCamera)`).
  const systemCamera = prefersSystemCamera();
  const blocked = createMemo(() => props.busy || props.editorState !== 'ready');

  // Wklejenie obrazu ze schowka w dowolnym miejscu (poza polami tekstowymi).
  createEffect(blocked, (isBlocked) => {
    if (isBlocked) return;
    const onPaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, [contenteditable]')) {
        return;
      }
      const file = imageFromClipboard(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      setCamera(false);
      props.onFile(file);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  });

  const pick = (input: HTMLInputElement | undefined) => {
    if (!blocked()) input?.click();
  };

  const takePhoto = () => {
    setCameraIssue(undefined);
    if (systemCamera) {
      pick(cameraInput);
    } else if (!cameraSupported()) {
      setCameraIssue('unsupported');
    } else if (!blocked()) {
      setCamera(true);
    }
  };

  const takeFrom = (input: HTMLInputElement, handle: (file: File) => void) => {
    const file = input.files?.[0];
    input.value = '';
    if (file) handle(file);
  };

  const dragEnter = (event: DragEvent) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    dragDepth += 1;
    setDragging(true);
  };
  const dragLeave = () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) setDragging(false);
  };
  const drop = (event: DragEvent) => {
    event.preventDefault();
    dragDepth = 0;
    setDragging(false);
    const file = event.dataTransfer?.files[0];
    if (file && !blocked()) {
      setCamera(false);
      props.onFile(file);
    }
  };

  const chooseButton = () => (
    <Button
      variant={systemCamera ? 'secondary' : 'primary'}
      icon="upload"
      fullWidth={systemCamera}
      disabled={blocked()}
      onClick={() => pick(fileInput)}
    >
      {text.stage.choose}
    </Button>
  );
  const cameraButton = () => (
    <Button
      variant={systemCamera ? 'primary' : 'secondary'}
      icon="camera"
      fullWidth={systemCamera}
      disabled={blocked()}
      onClick={takePhoto}
    >
      {text.stage.takePhoto}
    </Button>
  );

  return (
    <div class="wizard-body">
      <div
        class={[
          'wizard-stage',
          'wizard-photo',
          {
            'wizard-photo--empty': !props.photoUrl && !camera(),
            'wizard-photo--dragging': dragging(),
          },
        ]}
        onDragEnter={dragEnter}
        onDragOver={(event) => {
          if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
        }}
        onDragLeave={dragLeave}
        onDrop={drop}
      >
        <Switch
          fallback={
            <div class="wizard-drop">
              <span class="wizard-drop__icon" aria-hidden="true">
                <Icon name="image" size={22} />
              </span>
              <p class="wizard-drop__title">
                {dragging() ? text.stage.dragging : text.stage.title}
              </p>
              <p class="wizard-drop__helper">{text.stage.helper}</p>
              <div
                class={['wizard-drop__actions', { 'wizard-drop__actions--stack': systemCamera }]}
              >
                {systemCamera ? (
                  <>
                    {cameraButton()}
                    {chooseButton()}
                  </>
                ) : (
                  <>
                    {chooseButton()}
                    {cameraButton()}
                  </>
                )}
              </div>
            </div>
          }
        >
          <Match when={camera()}>
            <CameraCapture
              onCapture={(photo) => {
                setCamera(false);
                props.onFile(photo);
              }}
              onCancel={() => setCamera(false)}
              onProblem={(problem) => {
                setCamera(false);
                setCameraIssue(problem);
              }}
            />
          </Match>
          <Match when={props.photoUrl}>
            <img class="wizard-photo__preview" src={props.photoUrl} alt={text.stage.preview} />
            <div class="wizard-toolbar" role="toolbar" aria-label={text.stage.change}>
              <Button
                size="sm"
                variant="secondary"
                icon="upload"
                disabled={blocked()}
                onClick={() => pick(fileInput)}
              >
                {text.stage.choose}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon="camera"
                disabled={blocked()}
                onClick={takePhoto}
              >
                {text.stage.takePhoto}
              </Button>
            </div>
          </Match>
        </Switch>
        <Show when={props.busy}>
          <div class="wizard-stage__busy">
            <Spinner size={24} label={text.stage.loading} />
          </div>
        </Show>
      </div>
      <div class="wizard-panel">
        <Show when={props.editorState === 'error'}>
          <Banner
            variant="error"
            action={
              <Button
                size="sm"
                variant="secondary"
                icon="refresh"
                onClick={() => props.onRetryEditor()}
              >
                {t.scorePad.retry}
              </Button>
            }
          >
            {t.scorePad.loadError}
          </Banner>
        </Show>
        <Show when={props.error}>{(error) => <Banner variant="error">{error()}</Banner>}</Show>
        <Show when={cameraIssue()}>
          {(issue) => (
            <Banner
              variant="warning"
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  icon="upload"
                  disabled={blocked()}
                  onClick={() => pick(fileInput)}
                >
                  {text.stage.choose}
                </Button>
              }
            >
              {text.camera[issue()]}
            </Banner>
          )}
        </Show>
        <Show when={props.notice}>{(notice) => <Banner variant="info">{notice()}</Banner>}</Show>
        <section class="wizard-tips" aria-labelledby={tipsId}>
          <h3 id={tipsId} class="wizard-panel__title">
            {text.tips.title}
          </h3>
          <ol class="wizard-tips__list">
            <For each={text.tips.items}>
              {(tip, index) => (
                <li class="wizard-tips__item">
                  <span class="wizard-tips__number" aria-hidden="true">
                    {index() + 1}
                  </span>
                  <span>{tip}</span>
                </li>
              )}
            </For>
          </ol>
        </section>
        <TextLink
          chevron={false}
          class="wizard-photo__import"
          disabled={blocked()}
          onClick={() => pick(importInput)}
        >
          {text.import}
        </TextLink>
      </div>
      <input
        ref={(element) => (fileInput = element)}
        type="file"
        accept="image/*"
        hidden
        aria-label={text.stage.choose}
        onChange={(event) => takeFrom(event.currentTarget, props.onFile)}
      />
      <input
        ref={(element) => (cameraInput = element)}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        aria-label={text.stage.takePhoto}
        onChange={(event) => takeFrom(event.currentTarget, props.onFile)}
      />
      <input
        ref={(element) => (importInput = element)}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label={text.importLabel}
        onChange={(event) => takeFrom(event.currentTarget, props.onImport)}
      />
    </div>
  );
}
