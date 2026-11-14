import type { ScorePadTemplate } from '@bg-club/score-pad';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useAuth } from '../auth/authContext';
import { useGame, type Game } from '../games/games';
import { format, t } from '../i18n';
import { usePopups } from '../popups/popupContext';
import { PopupModal } from '../popups/PopupModal';
import { QueryStatus } from '../popups/QueryStatus';
import { Banner, Button, useToast } from '../ui';
import { fewerSeatsMessage, scorepadErrorMessage } from './messages';
import { ScorePadEditorView, type ScorePadEditorHandle } from './ScorePadEditorView';
import {
  ScorepadError,
  scorepadsKey,
  saveScorepad,
  useScorepad,
  useScorepadTemplate,
  type Scorepad,
} from './scorepads';
import '../games/games.css';
import './scorepads.css';

const text = t.scorepads.editor;

/** „Dodaj notes” (GAME-7, EDT-1): pusty edytor; zapis tworzy notes i jego wersję 1. */
export function AddScorepadPopup({ gameId }: { readonly gameId: string }) {
  const { client } = useAuth();
  const game = useGame(client, gameId);
  // Id nowego notesu od razu: ponowny zapis po błędzie trafia w ten sam notes, nie w nowy.
  const [id] = useState(() => crypto.randomUUID());
  if (!game.isSuccess) {
    return (
      <PopupModal title={text.addTitle} width={880}>
        <QueryStatus isError={game.isError} onRetry={() => void game.refetch()} />
      </PopupModal>
    );
  }
  if (!game.data) return <NotFound />;
  return <ScorepadEditor game={game.data} scorepadId={id} pad={null} template={undefined} />;
}

/**
 * „Edytuj notes” (GAME-7, GAME-9): edytor z aktualną wersją (ze zdjęciem kartki). Zapis
 * tworzy kolejną wersję; partie zachowują wersję, od której się zaczęły.
 */
export function EditScorepadPopup({ id }: { readonly id: string }) {
  const { client } = useAuth();
  const pad = useScorepad(client, id);
  const game = useGame(client, pad.data?.game_id ?? '');
  const template = useScorepadTemplate(client, pad.data);
  if (pad.isSuccess && !pad.data) return <NotFound />;
  // Notes bez wersji (np. dodany poza aplikacją) nie ma szablonu: edytor zaczyna od zdjęcia.
  const noVersion = pad.data?.current === null;
  if (!pad.isSuccess || !game.isSuccess || (!template.isSuccess && !noVersion)) {
    const failed = pad.isError ? pad : game.isError ? game : template;
    return (
      <PopupModal title={text.editTitle} width={880}>
        <QueryStatus
          isError={pad.isError || game.isError || template.isError}
          onRetry={() => void failed.refetch()}
        />
      </PopupModal>
    );
  }
  if (!pad.data || !game.data) return <NotFound />;
  return (
    <ScorepadEditor
      game={game.data}
      scorepadId={pad.data.id}
      pad={pad.data}
      template={noVersion ? undefined : template.data}
    />
  );
}

function NotFound() {
  return (
    <PopupModal title={text.notFoundTitle}>
      <p className="games-not-found">{text.notFoundBody}</p>
    </PopupModal>
  );
}

/**
 * Edytor `<score-pad-editor>` w popupie gry z zapisem w bazie (EDT-1). Kreator pięciu kroków
 * (§5.5.2) zastąpi to w kolejnych zadaniach; „Zapisz notes” zostaje w stopce. Po zapisie
 * notes ze zbyt małą liczbą miejsc dostaje ostrzeżenie EDT-6 w toaście.
 */
function ScorepadEditor({
  game,
  scorepadId,
  pad,
  template,
}: {
  readonly game: Game;
  readonly scorepadId: string;
  readonly pad: Scorepad | null;
  readonly template: ScorePadTemplate | undefined;
}) {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { back } = usePopups();
  const editor = useRef<ScorePadEditorHandle>(null);
  const [error, setError] = useState<string | undefined>(undefined);
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
      back();
    },
    onError: (failure) => {
      if (failure instanceof ScorepadError && failure.reason === 'gone') {
        void queryClient.invalidateQueries({ queryKey: scorepadsKey });
      }
      setError(scorepadErrorMessage(failure));
    },
  });

  return (
    <PopupModal
      title={pad ? text.editTitle : text.addTitle}
      count={game.title}
      width={880}
      footer={
        <>
          <Button variant="secondary" onClick={back}>
            {text.cancel}
          </Button>
          <Button
            icon="check"
            loading={save.isPending}
            onClick={() => {
              setError(undefined);
              save.mutate();
            }}
          >
            {text.save}
          </Button>
        </>
      }
    >
      <div className="scorepad-editor">
        {error ? <Banner variant="error">{error}</Banner> : null}
        {pad?.current ? (
          <p className="scorepads__note">{format(text.versionNote, { n: initial.nextVersion })}</p>
        ) : null}
        <ScorePadEditorView
          ref={editor}
          template={initial.template}
          className="scorepad-editor__view"
        />
      </div>
    </PopupModal>
  );
}
