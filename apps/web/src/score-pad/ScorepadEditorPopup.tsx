import { createGame } from '../games/gameData';
import { createScorepad, createScorepadTemplate } from './scorepadData';
import { ScorepadWizard } from './ScorepadWizard';
import '../games/games.css';
import './scorepads.css';

/*
 * Okno kreatora zależy od danych w cache (bez czekania: `current()`), a spinner i błąd
 * wczytania pokazuje `wait` pod `<QueryBoundary>` w treści kreatora.
 */

/** „Dodaj notes”: pusty edytor; zapis tworzy notes i jego wersję 1. */
export function AddScorepadPopup(props: { readonly gameId: string }) {
  const game = createGame(() => props.gameId);
  // Id nowego notesu od razu: ponowny zapis po błędzie trafia w ten sam notes, nie w nowy.
  const id = crypto.randomUUID();
  return (
    <ScorepadWizard
      mode="add"
      scorepadId={id}
      source={(() => {
        const found = game.current();
        return found ? { game: found, pad: null, template: undefined } : undefined;
      })()}
      notFound={game.current() === null}
      wait={() => game()}
    />
  );
}

/**
 * „Edytuj notes”: edytor z aktualną wersją (ze zdjęciem kartki). Zapis
 * tworzy kolejną wersję; partie zachowują wersję, od której się zaczęły.
 */
export function EditScorepadPopup(props: { readonly id: string }) {
  const pad = createScorepad(() => props.id);
  const game = createGame(() => pad.current()?.game_id ?? '');
  const template = createScorepadTemplate(() => pad.current());
  // Notes bez wersji (np. dodany poza aplikacją) nie ma szablonu: edytor zaczyna od zdjęcia.
  const noVersion = () => pad.current()?.current === null;
  const ready = () =>
    !!pad.current() &&
    game.current() !== undefined &&
    (noVersion() || template.current() !== undefined);
  const notFound = () => pad.current() === null || (ready() && !game.current());
  return (
    <ScorepadWizard
      mode="edit"
      scorepadId={props.id}
      source={(() => {
        const found = pad.current();
        const base = game.current();
        if (!ready() || !found || !base) return undefined;
        return { game: base, pad: found, template: noVersion() ? undefined : template.current() };
      })()}
      notFound={notFound()}
      wait={() => {
        // Gra i szablon dopiero dla wczytanego notesu (wcześniej ich klucze są puste).
        if (!pad()) return;
        game();
        template();
      }}
    />
  );
}
