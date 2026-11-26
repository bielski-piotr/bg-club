/** @jsxImportSource @solidjs/web */
import { createSignal, Show, onSettled, untrack } from 'solid-js';
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
import { PopupModal } from '../solid/popups/PopupModal';
import { Banner, Button, Icon, Spinner } from '../solid/ui';
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

type Busy = 'loading' | 'processing' | 'applying' | null;

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
export function CoverEditor(props: {
  readonly start: CoverEditorStart;
  readonly onCancel: () => void;
  readonly onDone: (result: CoverEditorResult) => void;
}) {
  // Edytor otwiera się z jednym startem (świadomie jednorazowy odczyt): formularz tworzy nowy
  // edytor przy każdym otwarciu.
  const start = untrack(() => props.start);
  let fileInput: HTMLInputElement | undefined;
  const [editing, setEditingState] = createSignal<Editing | null>(null);
  const [busy, setBusyState] = createSignal<Busy>(
    start.kind === 'empty' ? null : start.kind === 'current' ? 'loading' : 'processing',
  );
  const [error, setError] = createSignal<string | undefined>(undefined);
  /** Coś zmieniono (nowy obraz, kadr, usunięcie): bez zmian „Gotowe” niczego nie zapisuje. */
  const [dirty, setDirty] = createSignal(start.kind === 'file');
  const [dropping, setDropping] = createSignal(false);

  // Bieżące wartości dla obsługi zdarzeń i sprzątania (sygnał widzi zapis dopiero po flushu).
  let editingNow: Editing | null = null;
  let busyNow: Busy = untrack(busy);
  let alive = true;
  const setEditing = (next: Editing | null) => {
    editingNow = next;
    setEditingState(next);
  };
  const setBusy = (next: Busy) => {
    busyNow = next;
    setBusyState(next);
  };

  /** Podmienia obraz w kadrze i zwalnia poprzedni. */
  const show = (next: Editing | null) => {
    release(editingNow);
    setEditing(next);
  };

  const open = async (
    blob: Blob,
    source: CoverSource,
    crop: (bitmap: ImageBitmap) => CropState,
  ) => {
    const bitmap = await createImageBitmap(blob);
    if (!alive) {
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
      if (alive) setBusy(null);
    }
  };

  const pick = async (file: Blob | undefined | null) => {
    if (!file || busyNow) return;
    await load(file);
  };

  onSettled(() => {
    // Start: obecna okładka albo obraz wklejony w formularzu.
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
          if (alive) setError(errors.coverLoad);
        } finally {
          if (alive) setBusy(null);
        }
      })();
    }

    // Ctrl+V / ⌘V w edytorze podmienia obraz.
    const onPaste = (event: ClipboardEvent) => {
      const file = clipboardImage(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      void pick(file);
    };
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('paste', onPaste);
      // Obraz zwalniamy przy zamknięciu edytora.
      alive = false;
      release(editingNow);
      editingNow = null;
    };
  });

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
    if (busyNow) return;
    if (!dirty()) {
      props.onDone({ kind: 'unchanged' });
      return;
    }
    const current = editingNow;
    if (!current) {
      props.onDone({ kind: 'remove' });
      return;
    }
    setBusy('applying');
    try {
      const image = await renderCover(current.bitmap, current.crop, CROP_VIEW, current.fill);
      props.onDone({
        kind: 'new',
        image,
        crop: toStoredCrop(current.crop, CROP_VIEW),
        source: current.source,
      });
    } catch (failure) {
      setError(
        failure instanceof ImageScaleError ? IMAGE_ERRORS[failure.reason] : errors.coverDecode,
      );
      if (alive) setBusy(null);
    }
  };

  const onDragOver = (event: DragEvent) => {
    const transfer = event.dataTransfer;
    if (!transfer || !Array.from(transfer.types).includes('Files')) return;
    event.preventDefault();
    transfer.dropEffect = 'copy';
    setDropping(true);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDropping(false);
    void pick(event.dataTransfer?.files[0]);
  };

  const loading = () => busy() === 'loading' || busy() === 'processing';
  return (
    <PopupModal
      title={editor.title}
      footer={
        <>
          <Button
            variant="secondary"
            disabled={busy() === 'applying'}
            onClick={() => props.onCancel()}
          >
            {editor.cancel}
          </Button>
          <Button loading={busy() !== null} disabled={loading()} onClick={() => void apply()}>
            {editor.apply}
          </Button>
        </>
      }
    >
      <div
        class={['cover-editor', { 'cover-editor--dropping': dropping() }]}
        onDragOver={onDragOver}
        onDragLeave={() => setDropping(false)}
        onDrop={onDrop}
      >
        <Show when={editing()}>
          <p class="game-form__hint">{editor.intro}</p>
        </Show>
        <Show when={error()}>{(message) => <Banner variant="error">{message()}</Banner>}</Show>
        <Show
          when={!loading() && editing()}
          fallback={
            <div class="cover-editor__empty" aria-live="polite">
              <Show
                when={loading()}
                fallback={
                  <>
                    <span class="cover-editor__empty-icon" aria-hidden="true">
                      <Icon name="image" />
                    </span>
                    <span class="cover-editor__empty-title">{editor.empty}</span>
                    <span class="cover-editor__empty-text">{editor.emptyHelper}</span>
                  </>
                }
              >
                <Spinner size={24} />
                <span class="cover-editor__empty-text">
                  {busy() === 'loading' ? editor.loading : editor.processing}
                </span>
              </Show>
            </div>
          }
        >
          {(open) => (
            <AvatarCropper
              src={open().url}
              image={open().bitmap}
              crop={open().crop}
              shape="cover"
              fit={COVER_FIT}
              fill={open().fill}
              margin={STAGE_MARGIN}
              maxSize={STAGE_MAX}
              onCropChange={(crop) => {
                setDirty(true);
                if (editingNow) setEditing({ ...editingNow, crop });
              }}
            />
          )}
        </Show>
        <div class="cover-editor__actions">
          <Button
            variant="secondary"
            size="sm"
            icon="upload"
            disabled={busy() !== null}
            onClick={() => fileInput?.click()}
          >
            {editing() ? editor.pickOther : editor.pickFile}
          </Button>
          <Show when={canReadClipboard()}>
            <Button
              variant="secondary"
              size="sm"
              icon="copy"
              disabled={busy() !== null}
              onClick={() => void paste()}
            >
              {editor.paste}
            </Button>
          </Show>
          <Show when={editing()}>
            <Button
              variant="secondary"
              size="sm"
              icon="trash"
              disabled={busy() !== null}
              onClick={remove}
            >
              {editor.remove}
            </Button>
          </Show>
        </div>
        <p class="club-form__helper cover-editor__helper">{editor.helper}</p>
        <input
          ref={(el) => (fileInput = el)}
          type="file"
          accept={IMAGE_ACCEPT}
          class="sr-only"
          tabindex={-1}
          aria-label={t.games.form.coverLabel}
          onChange={(event) => {
            void pick(event.currentTarget.files?.[0]);
            event.currentTarget.value = '';
          }}
        />
      </div>
    </PopupModal>
  );
}
