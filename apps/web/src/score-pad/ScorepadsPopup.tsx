import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useAuth } from '../auth/authContext';
import { playersLabel } from '../games/labels';
import { useGame, type Game } from '../games/games';
import { format, plural, t } from '../i18n';
import { signedUrlQuery } from '../lib/storage';
import { usePopups } from '../popups/popupContext';
import { PopupModal } from '../popups/PopupModal';
import { QueryStatus } from '../popups/QueryStatus';
import { Banner, Button, EmptyState, Icon, Menu, Tray, useToast } from '../ui';
import { cx } from '../ui/cx';
import {
  exportScorepad,
  gameScorepadsKey,
  importScorepad,
  ScorepadError,
  SCOREPADS_BUCKET,
  thumbPath,
  useGameScorepads,
  type Scorepad,
  type SavedScorepad,
} from './scorepads';
import { fewerSeatsMessage, scorepadErrorMessage } from './messages';
import '../games/games.css';
import './scorepads.css';

const text = t.scorepads.list;

/**
 * Notesy gry: nazwa, miniatura kartki, liczba miejsc
 * dla graczy i numer aktualnej wersji. Administrator dodaje notes w edytorze albo importuje plik
 * `.json`, a przy każdym notesie ma „Edytuj”, „Zmień nazwę”, „Eksportuj do pliku” i „Usuń”.
 * Notes z mniejszą liczbą miejsc niż max. graczy gry ma ostrzeżenie.
 */
export function ScorepadsPopup({
  gameId,
  isAdmin,
}: {
  readonly gameId: string;
  readonly isAdmin: boolean;
}) {
  const { client } = useAuth();
  const game = useGame(client, gameId);
  const pads = useGameScorepads(client, gameId);

  if (!game.isSuccess || !pads.isSuccess) {
    const failed = game.isError ? game : pads;
    return (
      <PopupModal title={text.title}>
        <QueryStatus isError={game.isError || pads.isError} onRetry={() => void failed.refetch()} />
      </PopupModal>
    );
  }
  if (!game.data) {
    return (
      <PopupModal title={text.notFoundTitle}>
        <p className="games-not-found">{text.notFoundBody}</p>
      </PopupModal>
    );
  }
  return <ScorepadList game={game.data} pads={pads.data} isAdmin={isAdmin} />;
}

function ScorepadList({
  game,
  pads,
  isAdmin,
}: {
  readonly game: Game;
  readonly pads: readonly Scorepad[];
  readonly isAdmin: boolean;
}) {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { open } = usePopups();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [warning, setWarning] = useState<string | undefined>(undefined);

  const importFile = useMutation({
    mutationFn: (file: File) => importScorepad(client, game.id, file),
    onSuccess: (saved: SavedScorepad) => {
      void queryClient.invalidateQueries({ queryKey: gameScorepadsKey(game.id) });
      toast.show(format(t.scorepads.toasts.imported, { name: saved.name }), 'success');
      setWarning(fewerSeatsMessage(saved.playerSlots, game.max_players));
    },
    onError: (failure) => setError(scorepadErrorMessage(failure)),
  });

  const exportPad = useMutation({
    mutationFn: (pad: Scorepad) => exportScorepad(client, pad),
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
    if (!file || importFile.isPending) return;
    setError(undefined);
    setWarning(undefined);
    importFile.mutate(file);
  };

  // W nagłówku tylko „Dodaj notes” (jak „Dodaj grę”), żeby tytuł mieścił się od 360 px.
  const actions = isAdmin ? (
    <Button
      size="sm"
      icon="plus"
      aria-label={text.add}
      onClick={() => open({ kind: 'add-scorepad', gameId: game.id })}
    >
      <span className="games-add__long">{text.add}</span>
      <span className="games-add__short">{text.addShort}</span>
    </Button>
  ) : undefined;

  return (
    <PopupModal title={text.title} count={plural(pads.length, t.scorepads.count)} actions={actions}>
      <div className="scorepads">
        <div className="scorepads__head">
          <p className="scorepads__intro">
            {format(text.intro, { title: game.title, players: playersLabel(game) })}
          </p>
          {isAdmin ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                icon="upload"
                loading={importFile.isPending}
                onClick={() => fileRef.current?.click()}
              >
                {text.import}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="sr-only"
                tabIndex={-1}
                aria-label={text.importLabel}
                onChange={(event) => {
                  pickFile(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </>
          ) : null}
        </div>
        {error ? <Banner variant="error">{error}</Banner> : null}
        {warning ? <Banner variant="warning">{warning}</Banner> : null}
        <p className="sr-only" role="status">
          {importFile.isPending ? text.importing : ''}
        </p>
        {pads.length > 0 ? (
          <>
            <Tray label={format(text.label, { title: game.title })}>
              {pads.map((pad) => (
                <ScorepadRow
                  key={pad.id}
                  pad={pad}
                  maxPlayers={game.max_players}
                  isAdmin={isAdmin}
                  onExport={() => {
                    setError(undefined);
                    exportPad.mutate(pad);
                  }}
                />
              ))}
            </Tray>
            {isAdmin ? <p className="scorepads__note">{text.versionNote}</p> : null}
          </>
        ) : (
          <EmptyState
            icon="pad"
            title={text.emptyTitle}
            helper={isAdmin ? text.emptyHelperAdmin : text.emptyHelper}
          />
        )}
      </div>
    </PopupModal>
  );
}

function ScorepadRow({
  pad,
  maxPlayers,
  isAdmin,
  onExport,
}: {
  readonly pad: Scorepad;
  readonly maxPlayers: number;
  readonly isAdmin: boolean;
  readonly onExport: () => void;
}) {
  const { open } = usePopups();
  const seats = pad.current?.player_slots ?? 0;
  const fewer = pad.current !== null && seats < maxPlayers;
  const label = format(text.actions, { name: pad.name });
  return (
    <li className="tray__item">
      <div className="row row--64 scorepad-row">
        <span className="row__leading">
          {/* Klucz = plik: nowa wersja zaczyna od świeżego stanu błędu obrazu. */}
          <ScorepadThumb
            key={pad.current?.image_path ?? ''}
            name={pad.name}
            path={pad.current?.image_path ?? null}
          />
        </span>
        <span className="row__text">
          <span className="row__title">{pad.name}</span>
          <span className="row__meta">
            {plural(seats, text.seats)}
            {pad.current ? ` · ${format(text.version, { n: pad.current.version })}` : null}
          </span>
          {fewer ? (
            <span className="row__meta scorepad-row__warning">
              <Icon name="alert" size={14} />
              {format(text.fewerSeats, { n: seats })}
            </span>
          ) : null}
        </span>
        {isAdmin ? (
          <span className="row__trailing">
            <Menu
              label={label}
              align="end"
              items={[
                {
                  id: 'edit',
                  label: text.edit,
                  icon: 'pencil',
                  onSelect: () => open({ kind: 'edit-scorepad', id: pad.id }),
                },
                {
                  id: 'rename',
                  label: text.rename,
                  icon: 'pad',
                  onSelect: () => open({ kind: 'rename-scorepad', id: pad.id }),
                },
                { id: 'export', label: text.export, icon: 'download', onSelect: onExport },
                {
                  id: 'delete',
                  label: text.delete,
                  icon: 'trash',
                  destructive: true,
                  onSelect: () => open({ kind: 'delete-scorepad', id: pad.id }),
                },
              ]}
              trigger={(props) => (
                <button
                  type="button"
                  {...props}
                  className="icon-btn icon-btn--32"
                  aria-label={label}
                  title={label}
                >
                  <Icon name="more" />
                </button>
              )}
            />
          </span>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Miniatura kartki 36×46: miniatura zdjęcia aktualnej wersji
 * z prywatnego bucketu (kilka KB, `thumbPath`), a gdy jej nie ma (starsze wersje) pełne zdjęcie.
 * Rysunek kartki, gdy notes nie ma zdjęcia lub obraz jeszcze się wczytuje.
 */
export function ScorepadThumb({
  name,
  path,
}: {
  readonly name: string;
  readonly path: string | null;
}) {
  const { client } = useAuth();
  const [thumbFailed, setThumbFailed] = useState(false);
  // Brak miniatury (starsza wersja) to od razu pełne zdjęcie, bez ponawiania zapytania.
  const thumb = useQuery({
    ...signedUrlQuery(client, SCOREPADS_BUCKET, path && thumbPath(path)),
    retry: false,
    retryOnMount: false,
  });
  const useFull = thumbFailed || thumb.isError;
  const full = useQuery(signedUrlQuery(client, SCOREPADS_BUCKET, useFull ? path : null));
  const [failed, setFailed] = useState(false);
  const url = useFull ? full.data : thumb.data;
  const src = url && !failed ? url : undefined;
  const onError = () => (useFull ? setFailed(true) : setThumbFailed(true));
  return (
    <span className={cx('sheet-thumb', src && 'sheet-thumb--photo')}>
      {src ? (
        <img
          src={src}
          alt={format(text.thumbnail, { name })}
          loading="lazy"
          decoding="async"
          onError={onError}
        />
      ) : (
        <span className="sheet-thumb__lines" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </span>
      )}
    </span>
  );
}
