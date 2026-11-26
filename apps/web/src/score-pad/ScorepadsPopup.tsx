import {
  action,
  createMemo,
  createOptimistic,
  createSignal,
  For,
  onFlush,
  Show,
  useContext,
} from 'solid-js';
import { createGame } from '../games/gameData';
import type { Game } from '../games/games';
import { playersLabel } from '../games/labels';
import { format, plural, t } from '../i18n';
import { AuthContext } from '../auth/authContext';
import { PopupsContext } from '../popups/popupContext';
import { QueryClientContext } from '../lib/queryClient';
import { ToastContext } from '../ui/toastContext';
import { PopupModal } from '../popups/PopupModal';
import { QueryBoundary } from '../popups/QueryStatus';
import { Banner, Button, EmptyState, Icon, Menu, Tray } from '../ui';
import { fewerSeatsMessage, scorepadErrorMessage } from './messages';
import { createGameScorepads, createScorepadFileUrl } from './scorepadData';
import {
  exportScorepad,
  gameScorepadsKey,
  importScorepad,
  ScorepadError,
  thumbPath,
  type Scorepad,
  type SavedScorepad,
} from './scorepads';
import '../games/games.css';
import './scorepads.css';

const text = t.scorepads.list;

/**
 * Notesy gry: nazwa, miniatura kartki, liczba miejsc
 * dla graczy i numer aktualnej wersji. Administrator dodaje notes w edytorze albo importuje plik
 * `.json`, a przy każdym notesie ma „Edytuj”, „Zmień nazwę”, „Eksportuj do pliku” i „Usuń”.
 * Notes z mniejszą liczbą miejsc niż max. graczy gry ma ostrzeżenie. Jedno okno
 * wczytywanie, listę i „Nie znaleziono” (fokus z `PopupHost` zostaje na oknie).
 */
export function ScorepadsPopup(props: { readonly gameId: string; readonly isAdmin: boolean }) {
  const popups = useContext(PopupsContext);
  const game = createGame(() => props.gameId);
  const pads = createGameScorepads(() => props.gameId);
  // Nagłówek okna z danych w cache (bez czekania), lista czeka pod `<QueryBoundary>`.
  const loaded = () => pads.current() !== undefined && game.current() !== undefined;
  const data = () => (loaded() ? (game.current() ?? undefined) : undefined);
  const notFound = () => loaded() && !game.current();
  const shown = createMemo(() => {
    const list = pads();
    const found = game();
    return found ? { game: found, pads: list } : null;
  });

  return (
    <PopupModal
      title={notFound() ? text.notFoundTitle : text.title}
      count={data() ? plural(pads.current()?.length ?? 0, t.scorepads.count) : undefined}
      actions={
        // W nagłówku tylko „Dodaj notes” (jak „Dodaj grę”), żeby tytuł mieścił się od 360 px.
        <Show when={props.isAdmin && data()}>
          {(shown) => (
            <Button
              size="sm"
              icon="plus"
              aria-label={text.add}
              onClick={() => popups.open({ kind: 'add-scorepad', gameId: shown().id })}
            >
              <span class="games-add__long">{text.add}</span>
              <span class="games-add__short">{text.addShort}</span>
            </Button>
          )}
        </Show>
      }
    >
      <QueryBoundary>
        <Show when={shown()} fallback={<p class="games-not-found">{text.notFoundBody}</p>}>
          {(list) => <ScorepadList game={list().game} pads={list().pads} isAdmin={props.isAdmin} />}
        </Show>
      </QueryBoundary>
    </PopupModal>
  );
}

function ScorepadList(props: {
  readonly game: Game;
  readonly pads: readonly Scorepad[];
  readonly isAdmin: boolean;
}) {
  const auth = useContext(AuthContext);
  const queryClient = useContext(QueryClientContext);
  const toast = useContext(ToastContext);
  let fileInput: HTMLInputElement | undefined;
  const [error, setError] = createSignal<string | undefined>(undefined);
  const [warning, setWarning] = createSignal<string | undefined>(undefined);

  const [importing, setImporting] = createOptimistic(false);
  const importFile = action(function* (file: File) {
    setImporting(true);
    const gameId = props.game.id;
    const maxPlayers = props.game.max_players;
    let saved: SavedScorepad;
    try {
      saved = (yield importScorepad(auth.client, gameId, file)) as SavedScorepad;
    } catch (failure) {
      setError(scorepadErrorMessage(failure));
      return;
    }
    void queryClient.invalidateQueries({ queryKey: gameScorepadsKey(gameId) });
    toast.show(format(t.scorepads.toasts.imported, { name: saved.name }), 'success');
    setWarning(fewerSeatsMessage(saved.playerSlots, maxPlayers));
  });

  const exportPad = action(function* (pad: Scorepad) {
    try {
      yield exportScorepad(auth.client, pad);
    } catch (failure) {
      setError(
        failure instanceof ScorepadError && failure.reason === 'gone'
          ? t.scorepads.errors.gone
          : t.scorepads.errors.export,
      );
      return;
    }
    toast.show(format(t.scorepads.toasts.exported, { name: pad.name }), 'neutral');
  });

  const pickFile = (file: File | undefined) => {
    if (!file || importing()) return;
    // Poprzednie komunikaty znikają od razu, nie dopiero po imporcie.
    onFlush(() => {
      setError(undefined);
      setWarning(undefined);
    });
    void importFile(file);
  };

  return (
    <div class="scorepads">
      <div class="scorepads__head">
        <p class="scorepads__intro">
          {format(text.intro, { title: props.game.title, players: playersLabel(props.game) })}
        </p>
        <Show when={props.isAdmin}>
          <Button
            size="sm"
            variant="secondary"
            icon="upload"
            loading={importing()}
            onClick={() => fileInput?.click()}
          >
            {text.import}
          </Button>
          <input
            ref={(el) => (fileInput = el)}
            type="file"
            accept=".json,application/json"
            class="sr-only"
            tabindex={-1}
            aria-label={text.importLabel}
            onChange={(event) => {
              pickFile(event.currentTarget.files?.[0]);
              event.currentTarget.value = '';
            }}
          />
        </Show>
      </div>
      <Show when={error()}>{(message) => <Banner variant="error">{message()}</Banner>}</Show>
      <Show when={warning()}>{(message) => <Banner variant="warning">{message()}</Banner>}</Show>
      <p class="sr-only" role="status">
        {importing() ? text.importing : ''}
      </p>
      <Show
        when={props.pads.length > 0}
        fallback={
          <EmptyState
            icon="pad"
            title={text.emptyTitle}
            helper={props.isAdmin ? text.emptyHelperAdmin : text.emptyHelper}
          />
        }
      >
        <Tray label={format(text.label, { title: props.game.title })}>
          <For each={props.pads} keyed={(pad) => pad.id}>
            {(pad) => (
              <ScorepadRow
                pad={pad()}
                maxPlayers={props.game.max_players}
                isAdmin={props.isAdmin}
                onExport={() => {
                  onFlush(() => setError(undefined));
                  void exportPad(pad());
                }}
              />
            )}
          </For>
        </Tray>
        <Show when={props.isAdmin}>
          <p class="scorepads__note">{text.versionNote}</p>
        </Show>
      </Show>
    </div>
  );
}

function ScorepadRow(props: {
  readonly pad: Scorepad;
  readonly maxPlayers: number;
  readonly isAdmin: boolean;
  readonly onExport: () => void;
}) {
  const popups = useContext(PopupsContext);
  const seats = () => props.pad.current?.player_slots ?? 0;
  const fewer = () => props.pad.current !== null && seats() < props.maxPlayers;
  const label = () => format(text.actions, { name: props.pad.name });
  const imagePath = createMemo(() => props.pad.current?.image_path ?? null);
  return (
    <li class="tray__item">
      <div class="row row--64 scorepad-row">
        <span class="row__leading">
          {/* Klucz = plik: nowa wersja zaczyna od świeżego stanu błędu obrazu. */}
          <Show when={[imagePath()] as const} keyed>
            {([path]) => <ScorepadThumb name={props.pad.name} path={path} />}
          </Show>
        </span>
        <span class="row__text">
          <span class="row__title">{props.pad.name}</span>
          <span class="row__meta">
            {plural(seats(), text.seats)}
            {props.pad.current
              ? ` · ${format(text.version, { n: props.pad.current.version })}`
              : null}
          </span>
          <Show when={fewer()}>
            <span class="row__meta scorepad-row__warning">
              <Icon name="alert" size={14} />
              {format(text.fewerSeats, { n: seats() })}
            </span>
          </Show>
        </span>
        <Show when={props.isAdmin}>
          <span class="row__trailing">
            <Menu
              label={label()}
              align="end"
              items={[
                {
                  id: 'edit',
                  label: text.edit,
                  icon: 'pencil',
                  onSelect: () => popups.open({ kind: 'edit-scorepad', id: props.pad.id }),
                },
                {
                  id: 'rename',
                  label: text.rename,
                  icon: 'pad',
                  onSelect: () => popups.open({ kind: 'rename-scorepad', id: props.pad.id }),
                },
                {
                  id: 'move',
                  label: text.move,
                  icon: 'chevron-right',
                  onSelect: () => popups.open({ kind: 'move-scorepad', id: props.pad.id }),
                },
                {
                  id: 'export',
                  label: text.export,
                  icon: 'download',
                  onSelect: () => props.onExport(),
                },
                {
                  id: 'delete',
                  label: text.delete,
                  icon: 'trash',
                  destructive: true,
                  onSelect: () => popups.open({ kind: 'delete-scorepad', id: props.pad.id }),
                },
              ]}
              trigger={(trigger) => (
                <button
                  type="button"
                  {...trigger}
                  class="icon-btn icon-btn--32"
                  aria-label={label()}
                  title={label()}
                >
                  <Icon name="more" />
                </button>
              )}
            />
          </span>
        </Show>
      </div>
    </li>
  );
}

/**
 * Miniatura kartki 36×46: miniatura zdjęcia aktualnej wersji
 * z prywatnego bucketu (kilka KB, `thumbPath`), a gdy jej nie ma (starsze wersje) pełne zdjęcie.
 * Rysunek kartki, gdy notes nie ma zdjęcia lub obraz jeszcze się wczytuje.
 */
export function ScorepadThumb(props: { readonly name: string; readonly path: string | null }) {
  const [thumbFailed, setThumbFailed] = createSignal(false);
  // Brak miniatury (starsza wersja) to od razu pełne zdjęcie, bez ponawiania zapytania.
  const thumb = createScorepadFileUrl(() => props.path && thumbPath(props.path), false);
  // Adresy bez czekania: do wczytania widać rysunek kartki.
  const useFull = () => thumbFailed() || (thumb.state()?.isError ?? false);
  const full = createScorepadFileUrl(() => (useFull() ? props.path : null));
  const [failed, setFailed] = createSignal(false);
  const src = () => {
    const url = useFull() ? full.current() : thumb.current();
    return url && !failed() ? url : undefined;
  };
  const onError = () => (useFull() ? setFailed(true) : setThumbFailed(true));
  return (
    <span class={['sheet-thumb', { 'sheet-thumb--photo': !!src() }]}>
      <Show
        when={src()}
        fallback={
          <span class="sheet-thumb__lines" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
        }
      >
        {(url) => (
          <img
            src={url()}
            alt={format(text.thumbnail, { name: props.name })}
            loading="lazy"
            decoding="async"
            onError={onError}
          />
        )}
      </Show>
    </span>
  );
}
