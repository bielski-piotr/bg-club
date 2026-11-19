import { useState } from 'react';
import { useAuth } from '../auth/authContext';
import { useGame } from '../games/games';
import { t } from '../i18n';
import { PopupModal } from '../popups/PopupModal';
import { QueryStatus } from '../popups/QueryStatus';
import { ScorepadWizard } from './ScorepadWizard';
import { useScorepad, useScorepadTemplate } from './scorepads';
import '../games/games.css';
import './scorepads.css';

const text = t.scorepads.editor;

/** „Dodaj notes”: pusty edytor; zapis tworzy notes i jego wersję 1. */
export function AddScorepadPopup({ gameId }: { readonly gameId: string }) {
  const { client } = useAuth();
  const game = useGame(client, gameId);
  // Id nowego notesu od razu: ponowny zapis po błędzie trafia w ten sam notes, nie w nowy.
  const [id] = useState(() => crypto.randomUUID());
  if (!game.isSuccess) {
    return (
      <PopupModal title={text.addTitle} width={1120}>
        <QueryStatus isError={game.isError} onRetry={() => void game.refetch()} />
      </PopupModal>
    );
  }
  if (!game.data) return <NotFound />;
  return <ScorepadWizard game={game.data} scorepadId={id} pad={null} template={undefined} />;
}

/**
 * „Edytuj notes”: edytor z aktualną wersją (ze zdjęciem kartki). Zapis
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
      <PopupModal title={text.editTitle} width={1120}>
        <QueryStatus
          isError={pad.isError || game.isError || template.isError}
          onRetry={() => void failed.refetch()}
        />
      </PopupModal>
    );
  }
  if (!pad.data || !game.data) return <NotFound />;
  return (
    <ScorepadWizard
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
