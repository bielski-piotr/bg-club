import { createGame } from '../games/gameData';
import { createScorepad, createScorepadTemplate } from './scorepadData';
import { ScorepadWizard } from './ScorepadWizard';
import '../games/games.css';
import './scorepads.css';

/** „Dodaj notes” (GAME-7, EDT-1): pusty edytor; zapis tworzy notes i jego wersję 1. */
export function AddScorepadPopup(props: { readonly gameId: string }) {
  const game = createGame(() => props.gameId);
  // Id nowego notesu od razu: ponowny zapis po błędzie trafia w ten sam notes, nie w nowy.
  const id = crypto.randomUUID();
  const data = () => game().data ?? undefined;
  return (
    <ScorepadWizard
      mode="add"
      scorepadId={id}
      source={(() => {
        const found = data();
        return found ? { game: found, pad: null, template: undefined } : undefined;
      })()}
      notFound={game().isSuccess && !game().data}
      isError={game().isError}
      onRetry={() => void game().refetch()}
    />
  );
}

/**
 * „Edytuj notes” (GAME-7, GAME-9): edytor z aktualną wersją (ze zdjęciem kartki). Zapis
 * tworzy kolejną wersję; partie zachowują wersję, od której się zaczęły.
 */
export function EditScorepadPopup(props: { readonly id: string }) {
  const pad = createScorepad(() => props.id);
  const game = createGame(() => pad().data?.game_id ?? '');
  const template = createScorepadTemplate(() => pad().data);
  // Notes bez wersji (np. dodany poza aplikacją) nie ma szablonu: edytor zaczyna od zdjęcia.
  const noVersion = () => pad().data?.current === null;
  const ready = () => pad().isSuccess && game().isSuccess && (template().isSuccess || noVersion());
  const notFound = () => (pad().isSuccess && !pad().data) || (ready() && !game().data);
  const failed = () => (pad().isError ? pad() : game().isError ? game() : template());
  return (
    <ScorepadWizard
      mode="edit"
      scorepadId={props.id}
      source={(() => {
        const found = pad().data;
        const base = game().data;
        if (!ready() || !found || !base) return undefined;
        return { game: base, pad: found, template: noVersion() ? undefined : template().data };
      })()}
      notFound={notFound()}
      isError={pad().isError || game().isError || template().isError}
      onRetry={() => void failed().refetch()}
    />
  );
}
