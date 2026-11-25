import { useEffect, useRef, useState, type DragEvent } from 'react';
import { IMAGE_ACCEPT, ImageScaleError } from '../club/image';
import { t } from '../i18n';
import { AvatarCropper, CROP_VIEW } from '../profile/AvatarCropper';
import {
  clampCrop,
  fromStoredCrop,
  INITIAL_CROP,
  toStoredCrop,
  type CropState,
} from '../profile/crop';
import { PopupModal } from '../popups/PopupModal';
import { Banner, Button, Icon, Spinner } from '../ui';
import {
  canReadClipboard,
  clipboardImage,
  ClipboardError,
  COVER_FIT,
  edgeColor,
  prepareCoverSource,
  readClipboardImage,
  renderCover,
  type CoverSource,
  type CroppedCover,
} from './cover';

const editor = t.games.form.coverEditor;
const errors = t.games.form.errors;

/** Margines podglądu wokół kadru (ułamek boku): widać, co zostaje poza okładką. */
const STAGE_MARGIN = 0.1;
/** Największy bok podglądu (mieści się w oknie 560 na desktopie). */
const STAGE_MAX = 480;

const IMAGE_ERRORS: Readonly<Record<ImageScaleError['reason'], string>> = {
  type: errors.coverType,
  decode: errors.coverDecode,
  size: errors.coverSize,
};

/** Obraz w edytorze: oryginał do kadru i co z niego zapisać. */
export interface CoverOriginal {
  readonly blob: Blob;
  readonly source: CoverSource;
  /** Zapisany kadr (`games.cover_crop`); `null` = od środka. */
  readonly crop: unknown;
}

/** Z czym otwiera się edytor. */
export type CoverEditorStart =
  /** Bez okładki: wybór pliku albo wklejenie. */
  | { readonly kind: 'empty' }
  /** Obecna okładka (oryginał w pamięci albo do pobrania z Storage). */
  | { readonly kind: 'current'; readonly load: () => Promise<CoverOriginal> }
  /** Nowy obraz (wklejony w formularzu). */
  | { readonly kind: 'file'; readonly file: Blob };

export type CoverEditorResult =
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'remove' }
  | ({ readonly kind: 'new' } & CroppedCover);

/** Zdekodowany obraz w kadrze. */
interface Editing {
  readonly bitmap: ImageBitmap;
  readonly url: string;
  readonly crop: CropState;
  readonly source: CoverSource;
  /** Tło odsłonięte przy oddaleniu: średni kolor brzegów obrazu. */
  readonly fill: string;
}

function release(open: Editing | null) {
  if (!open) return;
  URL.revokeObjectURL(open.url);
  open.bitmap.close();
}

/**
 * Edytor okładki gry (GAME-6): jedno miejsce na podgląd obecnej okładki z kadrem, wybór
 * nowego pliku, wklejenie obrazu ze schowka (przycisk albo Ctrl+V / ⌘V, także przeciągnięcie
 * pliku) i usunięcie okładki. Podgląd pokazuje obraz także poza kadrem, a obraz można oddalić,
 * aż zmieści się w całości (tło wypełnia kolor jego brzegów).
 */
export function CoverEditor({
  start,
  onCancel,
  onDone,
}: {
  readonly start: CoverEditorStart;
  readonly onCancel: () => void;
  readonly onDone: (result: CoverEditorResult) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState<'loading' | 'processing' | 'applying' | null>(
    start.kind === 'empty' ? null : start.kind === 'current' ? 'loading' : 'processing',
  );
  const [error, setError] = useState<string | undefined>(undefined);
  /** Coś zmieniono (nowy obraz, kadr, usunięcie): bez zmian „Gotowe” niczego nie zapisuje. */
  const [dirty, setDirty] = useState(start.kind === 'file');
  const [dropping, setDropping] = useState(false);

  // Obraz zwalniamy przy podmianie i przy zamknięciu (ref: StrictMode od razu uruchamia
  // sprzątanie efektu).
  const editingRef = useRef<Editing | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      release(editingRef.current);
      editingRef.current = null;
    };
  }, []);

  const show = (next: Editing | null) => {
    release(editingRef.current);
    editingRef.current = next;
    setEditing(next);
  };

  const open = async (
    blob: Blob,
    source: CoverSource,
    crop: (bitmap: ImageBitmap) => CropState,
  ) => {
    const bitmap = await createImageBitmap(blob);
    if (!alive.current) {
      bitmap.close();
      return;
    }
    show({
      bitmap,
      url: URL.createObjectURL(blob),
      crop: crop(bitmap),
      source,
      fill: edgeColor(bitmap),
    });
  };

  /** Nowy obraz (plik, schowek, przeciągnięcie): oryginał 1600 px, kadr od środka. */
  const pick = async (file: Blob | undefined | null) => {
    if (!file || busyRef.current) return;
    await load(file);
  };

  const load = async (file: Blob) => {
    setError(undefined);
    setBusy('processing');
    try {
      const image = await prepareCoverSource(file);
      await open(image.blob, { kind: 'upload', image }, (bitmap) =>
        clampCrop(INITIAL_CROP, bitmap, CROP_VIEW, COVER_FIT),
      );
      setDirty(true);
    } catch (failure) {
      setError(
        failure instanceof ImageScaleError ? IMAGE_ERRORS[failure.reason] : errors.coverDecode,
      );
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const busyRef = useRef(busy);
  const pickRef = useRef(pick);
  useEffect(() => {
    busyRef.current = busy;
    pickRef.current = pick;
  });

  // Start: obecna okładka albo obraz wklejony w formularzu (raz, także w StrictMode).
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (start.kind === 'file') {
      void load(start.file);
    } else if (start.kind === 'current') {
      void (async () => {
        try {
          const original = await start.load();
          await open(original.blob, original.source, (bitmap) =>
            fromStoredCrop(original.crop, bitmap, CROP_VIEW, COVER_FIT),
          );
        } catch {
          if (alive.current) setError(errors.coverLoad);
        } finally {
          if (alive.current) setBusy(null);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tylko przy otwarciu edytora
  }, []);

  // Ctrl+V / ⌘V w edytorze podmienia obraz.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = clipboardImage(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      void pickRef.current(file);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  const paste = async () => {
    setError(undefined);
    try {
      await pick(await readClipboardImage());
    } catch (failure) {
      setError(
        failure instanceof ClipboardError && failure.reason === 'empty'
          ? errors.clipboardEmpty
          : errors.clipboardDenied,
      );
    }
  };

  const remove = () => {
    show(null);
    setDirty(true);
    setError(undefined);
  };

  const apply = async () => {
    if (busy) return;
    if (!dirty) {
      onDone({ kind: 'unchanged' });
      return;
    }
    if (!editing) {
      onDone({ kind: 'remove' });
      return;
    }
    setBusy('applying');
    try {
      const image = await renderCover(editing.bitmap, editing.crop, CROP_VIEW, editing.fill);
      onDone({
        kind: 'new',
        image,
        crop: toStoredCrop(editing.crop, CROP_VIEW),
        source: editing.source,
      });
    } catch (failure) {
      setError(
        failure instanceof ImageScaleError ? IMAGE_ERRORS[failure.reason] : errors.coverDecode,
      );
      if (alive.current) setBusy(null);
    }
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDropping(true);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDropping(false);
    void pick(event.dataTransfer.files[0]);
  };

  const loading = busy === 'loading' || busy === 'processing';
  return (
    <PopupModal
      title={editor.title}
      footer={
        <>
          <Button variant="secondary" disabled={busy === 'applying'} onClick={onCancel}>
            {editor.cancel}
          </Button>
          <Button
            loading={busy !== null}
            disabled={busy === 'loading' || busy === 'processing'}
            onClick={() => void apply()}
          >
            {editor.apply}
          </Button>
        </>
      }
    >
      <div
        className={dropping ? 'cover-editor cover-editor--dropping' : 'cover-editor'}
        onDragOver={onDragOver}
        onDragLeave={() => setDropping(false)}
        onDrop={onDrop}
      >
        {editing ? <p className="game-form__hint">{editor.intro}</p> : null}
        {error ? <Banner variant="error">{error}</Banner> : null}
        {editing && !loading ? (
          <AvatarCropper
            src={editing.url}
            image={editing.bitmap}
            crop={editing.crop}
            shape="cover"
            fit={COVER_FIT}
            fill={editing.fill}
            margin={STAGE_MARGIN}
            maxSize={STAGE_MAX}
            onCropChange={(crop) => {
              setDirty(true);
              setEditing((current) => {
                if (!current) return current;
                const next = { ...current, crop };
                editingRef.current = next;
                return next;
              });
            }}
          />
        ) : (
          <div className="cover-editor__empty" aria-live="polite">
            {loading ? (
              <>
                <Spinner size={24} />
                <span className="cover-editor__empty-text">
                  {busy === 'loading' ? editor.loading : editor.processing}
                </span>
              </>
            ) : (
              <>
                <span className="cover-editor__empty-icon" aria-hidden="true">
                  <Icon name="image" />
                </span>
                <span className="cover-editor__empty-title">{editor.empty}</span>
                <span className="cover-editor__empty-text">{editor.emptyHelper}</span>
              </>
            )}
          </div>
        )}
        <div className="cover-editor__actions">
          <Button
            variant="secondary"
            size="sm"
            icon="upload"
            disabled={busy !== null}
            onClick={() => fileRef.current?.click()}
          >
            {editing ? editor.pickOther : editor.pickFile}
          </Button>
          {canReadClipboard() ? (
            <Button
              variant="secondary"
              size="sm"
              icon="copy"
              disabled={busy !== null}
              onClick={() => void paste()}
            >
              {editor.paste}
            </Button>
          ) : null}
          {editing ? (
            <Button
              variant="secondary"
              size="sm"
              icon="trash"
              disabled={busy !== null}
              onClick={remove}
            >
              {editor.remove}
            </Button>
          ) : null}
        </div>
        <p className="club-form__helper cover-editor__helper">{editor.helper}</p>
        <input
          ref={fileRef}
          type="file"
          accept={IMAGE_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-label={t.games.form.coverLabel}
          onChange={(event) => {
            void pick(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </div>
    </PopupModal>
  );
}
