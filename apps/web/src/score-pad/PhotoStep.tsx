import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { t } from '../i18n';
import { Banner, Button, Icon, Spinner, TextLink } from '../ui';
import { cx } from '../ui/cx';
import { cameraSupported, type CameraProblem } from './camera';
import { CameraCapture } from './CameraCapture';
import type { ScorePadLoadState } from './useScorePadElement';
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
 * Krok 1 kreatora: Zdjęcie. Zdjęcie z pliku, przeciągnięte, wklejone ze
 * schowka albo zrobione: na telefonie aparatem systemowym (tylny aparat), na komputerze kamerą
 * z podglądem. Brak kamery albo odmowa dostępu zostawia ścieżkę z plikiem i komunikat. Tu jest
 * też import pliku notesu `.json`.
 */
export function PhotoStep({
  photoUrl,
  busy,
  editorState,
  onRetryEditor,
  error,
  notice,
  onFile,
  onImport,
}: PhotoStepProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const tipsId = useId();
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const [camera, setCamera] = useState(false);
  const [cameraIssue, setCameraIssue] = useState<CameraProblem | undefined>(undefined);
  const [systemCamera] = useState(prefersSystemCamera);
  const onFileRef = useRef(onFile);
  const blocked = busy || editorState !== 'ready';

  useEffect(() => {
    onFileRef.current = onFile;
  });

  // Wklejenie obrazu ze schowka w dowolnym miejscu (poza polami tekstowymi).
  useEffect(() => {
    if (blocked) return;
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
      onFileRef.current(file);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [blocked]);

  const pick = (input: HTMLInputElement | null) => {
    if (!blocked) input?.click();
  };

  const takePhoto = () => {
    setCameraIssue(undefined);
    if (systemCamera) {
      pick(cameraInput.current);
    } else if (!cameraSupported()) {
      setCameraIssue('unsupported');
    } else if (!blocked) {
      setCamera(true);
    }
  };

  const takeFrom = (input: HTMLInputElement, handle: (file: File) => void) => {
    const file = input.files?.[0];
    input.value = '';
    if (file) handle(file);
  };

  const dragEnter = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const dragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const drop = (event: DragEvent) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !blocked) {
      setCamera(false);
      onFile(file);
    }
  };

  const chooseButton = (
    <Button
      variant={systemCamera ? 'secondary' : 'primary'}
      icon="upload"
      fullWidth={systemCamera}
      disabled={blocked}
      onClick={() => pick(fileInput.current)}
    >
      {text.stage.choose}
    </Button>
  );
  const cameraButton = (
    <Button
      variant={systemCamera ? 'primary' : 'secondary'}
      icon="camera"
      fullWidth={systemCamera}
      disabled={blocked}
      onClick={takePhoto}
    >
      {text.stage.takePhoto}
    </Button>
  );

  let stage;
  if (camera) {
    stage = (
      <CameraCapture
        onCapture={(photo) => {
          setCamera(false);
          onFile(photo);
        }}
        onCancel={() => setCamera(false)}
        onProblem={(problem) => {
          setCamera(false);
          setCameraIssue(problem);
        }}
      />
    );
  } else if (photoUrl) {
    stage = (
      <>
        <img className="wizard-photo__preview" src={photoUrl} alt={text.stage.preview} />
        <div className="wizard-toolbar" role="toolbar" aria-label={text.stage.change}>
          <Button
            size="sm"
            variant="secondary"
            icon="upload"
            disabled={blocked}
            onClick={() => pick(fileInput.current)}
          >
            {text.stage.choose}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon="camera"
            disabled={blocked}
            onClick={takePhoto}
          >
            {text.stage.takePhoto}
          </Button>
        </div>
      </>
    );
  } else {
    stage = (
      <div className="wizard-drop">
        <span className="wizard-drop__icon" aria-hidden="true">
          <Icon name="image" size={22} />
        </span>
        <p className="wizard-drop__title">{dragging ? text.stage.dragging : text.stage.title}</p>
        <p className="wizard-drop__helper">{text.stage.helper}</p>
        <div className={cx('wizard-drop__actions', systemCamera && 'wizard-drop__actions--stack')}>
          {systemCamera ? (
            <>
              {cameraButton}
              {chooseButton}
            </>
          ) : (
            <>
              {chooseButton}
              {cameraButton}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="wizard-body">
      <div
        className={cx(
          'wizard-stage',
          'wizard-photo',
          !photoUrl && !camera && 'wizard-photo--empty',
          dragging && 'wizard-photo--dragging',
        )}
        onDragEnter={dragEnter}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes('Files')) event.preventDefault();
        }}
        onDragLeave={dragLeave}
        onDrop={drop}
      >
        {stage}
        {busy ? (
          <div className="wizard-stage__busy">
            <Spinner size={24} label={text.stage.loading} />
          </div>
        ) : null}
      </div>
      <div className="wizard-panel">
        {editorState === 'error' ? (
          <Banner
            variant="error"
            action={
              <Button size="sm" variant="secondary" icon="refresh" onClick={onRetryEditor}>
                {t.scorePad.retry}
              </Button>
            }
          >
            {t.scorePad.loadError}
          </Banner>
        ) : null}
        {error ? <Banner variant="error">{error}</Banner> : null}
        {cameraIssue ? (
          <Banner
            variant="warning"
            action={
              <Button
                size="sm"
                variant="secondary"
                icon="upload"
                disabled={blocked}
                onClick={() => pick(fileInput.current)}
              >
                {text.stage.choose}
              </Button>
            }
          >
            {text.camera[cameraIssue]}
          </Banner>
        ) : null}
        {notice ? <Banner variant="info">{notice}</Banner> : null}
        <section className="wizard-tips" aria-labelledby={tipsId}>
          <h3 id={tipsId} className="wizard-panel__title">
            {text.tips.title}
          </h3>
          <ol className="wizard-tips__list">
            {text.tips.items.map((tip, index) => (
              <li key={tip} className="wizard-tips__item">
                <span className="wizard-tips__number" aria-hidden="true">
                  {index + 1}
                </span>
                <span>{tip}</span>
              </li>
            ))}
          </ol>
        </section>
        <TextLink
          chevron={false}
          className="wizard-photo__import"
          disabled={blocked}
          onClick={() => pick(importInput.current)}
        >
          {text.import}
        </TextLink>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        aria-label={text.stage.choose}
        onChange={(event) => takeFrom(event.currentTarget, onFile)}
      />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        aria-label={text.stage.takePhoto}
        onChange={(event) => takeFrom(event.currentTarget, onFile)}
      />
      <input
        ref={importInput}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label={text.importLabel}
        onChange={(event) => takeFrom(event.currentTarget, onImport)}
      />
    </div>
  );
}
