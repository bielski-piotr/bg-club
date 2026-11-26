import { createMemo, createSignal, For, Match, Show, Switch, useContext } from 'solid-js';
import { createGame } from '../games/gameData';
import type { Game } from '../games/games';
import { playersLabel } from '../games/labels';
import { format, plural, t } from '../i18n';
import { AuthContext } from '../auth/authContext';
import { PopupsContext } from '../popups/popupContext';
import { QueryClientContext } from '../lib/queryClient';
import { ToastContext } from '../ui/toastContext';
import { PopupModal } from '../popups/PopupModal';
import { QueryStatus } from '../popups/QueryStatus';
import { createMutation } from '../lib/query';
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
 * Notesy gry (PRD GAME-7, DS „Game / notes pick row”): nazwa, miniatura kartki, liczba miejsc
 * dla graczy i numer aktualnej wersji. Administrator dodaje notes w edytorze albo importuje plik
 * `.json`, a przy każdym notesie ma „Edytuj”, „Zmień nazwę”, „Eksportuj do pliku” i „Usuń”.
 * Notes z mniejszą liczbą miejsc niż max. graczy gry ma ostrzeżenie (EDT-6). Jedno okno na
 * wczytywanie, listę i „Nie znaleziono” (fokus z `PopupHost` zostaje na oknie).
 */
export function ScorepadsPopup(props: { readonly gameId: string; readonly isAdmin: boolean }) {
  const popups = useContext(PopupsContext);
  const game = createGame(() => props.gameId);
  const pads = createGameScorepads(() => props.gameId);
  const loaded = () => game().isSuccess && pads().isSuccess;
  const data = () => (loaded() ? (game().data ?? undefined) : undefined);
  const notFound = () => loaded() && !game().data;

  return (
    <PopupModal
      title={notFound() ? text.notFoundTitle : text.title}
      count={data() ? plural(pads().data?.length ?? 0, t.scorepads.count) : undefined}
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
      <Switch>
        <Match when={notFound()}>
          <p class="games-not-found">{text.notFoundBody}</p>
        </Match>
        <Match when={data()}>
          {(shown) => (
            <ScorepadList game={shown()} pads={pads().data ?? []} isAdmin={props.isAdmin} />
          )}
        </Match>
        <Match when={true}>
          <QueryStatus
            isError={game().isError || pads().isError}
            onRetry={() => void (game().isError ? game() : pads()).refetch()}
          />
        </Match>
      </Switch>
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

  const importFile = createMutation({
    mutationFn: (file: File) => importScorepad(auth.client, props.game.id, file),
    onSuccess: (saved: SavedScorepad) => {
      void queryClient.invalidateQueries({ queryKey: gameScorepadsKey(props.game.id) });
      toast.show(format(t.scorepads.toasts.imported, { name: saved.name }), 'success');
      setWarning(fewerSeatsMessage(saved.playerSlots, props.game.max_players));
    },
    onError: (failure) => setError(scorepadErrorMessage(failure)),
  });

  const exportPad = createMutation({
    mutationFn: (pad: Scorepad) => exportScorepad(auth.client, pad),
    onSuccess: (_, pad) =>
      toast.show(format(t.scorepads.toasts.exported, { name: pad.name }), 'neutral'),
    onError: (failure) =>
      setError(
        failure instanceof ScorepadError && failure.reason === 'gone'
          ? t.scorepads.errors.gone
          : t.scorepads.errors.export,
      ),
  });

  const pickFile = (file: File | undefined) => {
    if (!file || importFile.state().isPending) return;
    setError(undefined);
    setWarning(undefined);
    importFile.mutate(file);
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
            loading={importFile.state().isPending}
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
        {importFile.state().isPending ? text.importing : ''}
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
                  setError(undefined);
                  exportPad.mutate(pad());
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
 * Miniatura kartki 36×46 (DS „Score-sheet thumbnail”): miniatura zdjęcia aktualnej wersji
 * z prywatnego bucketu (kilka KB, `thumbPath`), a gdy jej nie ma (starsze wersje) pełne zdjęcie.
 * Rysunek kartki, gdy notes nie ma zdjęcia lub obraz jeszcze się wczytuje.
 */
export function ScorepadThumb(props: { readonly name: string; readonly path: string | null }) {
  const [thumbFailed, setThumbFailed] = createSignal(false);
  // Brak miniatury (starsza wersja) to od razu pełne zdjęcie, bez ponawiania zapytania.
  const thumb = createScorepadFileUrl(() => props.path && thumbPath(props.path), false);
  const useFull = () => thumbFailed() || thumb().isError;
  const full = createScorepadFileUrl(() => (useFull() ? props.path : null));
  const [failed, setFailed] = createSignal(false);
  const src = () => {
    const url = useFull() ? full().data : thumb().data;
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
