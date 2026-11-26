/** @jsxImportSource @solidjs/web */
import type { JSX } from '@solidjs/web';
import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  For,
  Match,
  Show,
  Switch,
  useContext,
} from 'solid-js';
import type { OwnProfile } from '../auth/useOwnProfile';
import { GameCover } from '../games/GameCover';
import { createAllExpansions, createGameSearch } from '../games/gameData';
import { gamesKey, type Game } from '../games/games';
import { format, plural, t } from '../i18n';
import { compareProfiles, fullName, type Profile } from '../profile/profileQueries';
import { createActiveScorepads } from '../score-pad/scorepadData';
import { scorepadsKey, type Scorepad } from '../score-pad/scorepads';
import { AuthContext, PopupsContext, QueryClientContext, ToastContext } from '../solid/context';
import { createMounted } from '../solid/popups/leaveGuard';
import { PopupModal } from '../solid/popups/PopupModal';
import { QueryStatus } from '../solid/popups/QueryStatus';
import { ProfileAvatar } from '../solid/profile/ProfileAvatar';
import { createAllProfiles } from '../solid/profile/profiles';
import { createMutation } from '../solid/query';
import { Banner, Button, EmptyState, Icon, SearchField, Tray } from '../solid/ui';
import { ariaBool } from '../solid/ui/dom';
import { createMeeting, createPublishedGames } from './meetingData';
import { SheetThumbnail } from './MeetingParts';
import { meetingsKey, type Meeting } from './meetings';
import {
  assignSeat,
  boundsLabel,
  combinedRange,
  emptySeats,
  firstFreeSeat,
  fittingScorepads,
  gameReason,
  gameSubtitle,
  groupGames,
  newPlaySteps,
  playerBounds,
  scorepadReason,
  scorepadsByGame,
  scorepadSlots,
  scorepadSubtitle,
  scorepadTeams,
  scoringTitle,
  seatOf,
  seatedPlayers,
  seatsProblem,
  toggleTeamMember,
  startPlay,
  StartPlayError,
  type NewPlayStep,
  type PlayerBounds,
  type Seats,
} from './newPlay';
import { isMeetingRunner } from './plays';
import './meetings.css';

const text = t.meetings.newPlay;

/**
 * Nowa partia (RUN-2, RUN-3, PAD-2, PAD-3, PAD-9): kreator w trzech krokach (DS §15 „Step
 * pills”). Gra: najpierw opublikowane, potem reszta kolekcji; gry bez pasującego notesu albo
 * z większym minimum niż liczba uczestników są wyłączone z wyjaśnieniem. Notes: gdy gra ma
 * jeden pasujący notes, krok jest pomijany. Gracze: uczestnicy spotkania w miejscach notesu,
 * każdy najwyżej raz. Rozpoczęcie tworzy szkic partii (`start_play`); kilka partii może trwać
 * naraz. Tylko admin i prowadzący, tylko spotkanie w trakcie (reguły powtarza RPC).
 * Jedno okno na wczytywanie, kreator i blokadę: fokus ustawiony przez `PopupHost` zostaje.
 */
export function NewPlayPopup(props: { readonly meetingId: string; readonly me: OwnProfile }) {
  const meeting = createMeeting(() => props.meetingId);
  const games = createGameSearch(() => '');
  const published = createPublishedGames(() => props.meetingId);
  const pads = createActiveScorepads();
  const profiles = createAllProfiles();
  const expansions = createAllExpansions();
  const queries = () => [meeting(), games(), published(), pads(), profiles(), expansions()];

  const loaded = () => queries().every((query) => query.isSuccess);
  const blocked = () => {
    const current = meeting().data;
    return !current
      ? t.meetings.popup.notFoundBody
      : !isMeetingRunner(current, props.me)
        ? text.notRunner
        : current.status !== 'in_progress'
          ? text.notInProgress
          : null;
  };
  const meetingData = createMemo(() => meeting().data ?? undefined);
  const gamesData = createMemo(() => games().data ?? []);
  const expansionsData = createMemo(() => expansions().data ?? []);
  const publishedIds = createMemo(() => (published().data ?? []).map((game) => game.id));
  const padsData = createMemo(() => pads().data ?? []);
  const profileMap = createMemo(() => profiles().data ?? new Map<string, Profile>());

  const wizard = createWizard({
    meeting: meetingData,
    games: gamesData,
    expansions: expansionsData,
    pads: padsData,
    profiles: profileMap,
  });
  const ready = () => loaded() && blocked() === null;

  return (
    <PopupModal
      title={text.title}
      footer={
        <Show when={ready()}>
          <wizard.Footer />
        </Show>
      }
    >
      <Switch>
        <Match when={!loaded()}>
          <QueryStatus
            isError={queries().some((query) => query.isError)}
            onRetry={() => queries().forEach((query) => void query.refetch())}
          />
        </Match>
        <Match when={blocked()}>
          {(message) => <p class="meeting-form__state">{message()}</p>}
        </Match>
        <Match when={true}>
          <wizard.Body publishedIds={publishedIds()} />
        </Match>
      </Switch>
    </PopupModal>
  );
}

interface WizardData {
  readonly meeting: () => Meeting | undefined;
  readonly games: () => readonly Game[];
  /** Aktywne dodatki wszystkich gier: wybór dodatków partii i ich notesy. */
  readonly expansions: () => readonly Game[];
  readonly pads: () => readonly Scorepad[];
  readonly profiles: () => ReadonlyMap<string, Profile>;
}

/**
 * Stan kreatora i jego dwie części w oknie: treść kroku i stopka z przyciskami. Dane są
 * akcesorami: kreator pokazuje się dopiero po wczytaniu wszystkich zapytań.
 */
function createWizard(data: WizardData) {
  const auth = useContext(AuthContext);
  const queryClient = useContext(QueryClientContext);
  const toast = useContext(ToastContext);
  const popups = useContext(PopupsContext);
  const mounted = createMounted();
  // Id partii: to samo przy ponowieniu (błąd sieci nie zdubluje partii), nowe po każdej zmianie
  // wyboru, bo baza zwraca istniejącą partię tylko dla identycznej treści.
  const [playId, setPlayId] = createSignal(crypto.randomUUID());
  const [step, setStep] = createSignal<NewPlayStep>('game');
  const [gameId, setGameId] = createSignal<string | null>(null);
  const [scorepadId, setScorepadId] = createSignal<string | null>(null);
  const [seats, setSeats] = createSignal<Seats>([]);
  const [expansionIds, setExpansionIds] = createSignal<readonly string[]>([]);

  // Gracze: aktywni uczestnicy (usunięty z klubu zostaje w historii, ale nie zagra, MEM-5).
  const participants = createMemo(() =>
    (data.meeting()?.participants ?? [])
      .map((id) => data.profiles().get(id))
      .filter((person): person is Profile => person !== undefined && person.deleted_at === null)
      .sort(compareProfiles),
  );
  const byGame = createMemo(() => scorepadsByGame(data.pads()));
  const expansionsOf = (baseId: string) =>
    data.expansions().filter((e) => e.base_game_id === baseId);
  // Niedostępnych dodatków nie da się zaznaczyć: nie liczą się do graczy ani notesów partii.
  const availableExpansionsOf = (baseId: string) => expansionsOf(baseId).filter((e) => e.available);
  // Notesy gry i jej dodatków (notes dodatku tylko w partii z tym dodatkiem).
  const padsOf = (titles: readonly Game[]) =>
    titles.flatMap((title) => byGame().get(title.id) ?? []);
  const titles = createMemo(
    () => new Map([...data.games(), ...data.expansions()].map((title) => [title.id, title.title])),
  );
  const game = createMemo(
    () => data.games().find((candidate) => candidate.id === gameId()) ?? null,
  );
  const gameExpansions = createMemo(() => {
    const current = game();
    return current ? expansionsOf(current.id) : [];
  });
  const chosen = createMemo(() =>
    gameExpansions().filter(
      (expansion) => expansion.available && expansionIds().includes(expansion.id),
    ),
  );
  const range = createMemo(() => {
    const current = game();
    return current ? combinedRange(current, chosen()) : null;
  });
  const gamePads = createMemo(() => {
    const current = game();
    return current ? padsOf([current, ...chosen()]) : [];
  });
  const pad = createMemo(
    () => gamePads().find((candidate) => candidate.id === scorepadId()) ?? null,
  );
  const bounds = createMemo(() => {
    const players = range();
    const current = pad();
    return players && current
      ? playerBounds(players, scorepadSlots(current), scorepadTeams(current))
      : null;
  });
  const hasExpansions = () => gameExpansions().some((expansion) => expansion.available);
  const steps = createMemo(() => newPlaySteps(hasExpansions()));
  // Jeden notes gry, który pasuje: krok „Notes” jest pomijany (RUN-2: „gdy gra ma ich kilka”).
  const singlePad = createMemo(() => {
    const players = range();
    const list = gamePads();
    return players && list.length === 1 && fittingScorepads(players, list).length === 1
      ? list[0]
      : undefined;
  });

  const start = createMutation({
    mutationFn: (id: string) => {
      const current = pad();
      const found = data.meeting();
      if (!current || !found) throw new StartPlayError('scorepadGone');
      return startPlay(auth.client, {
        playId: id,
        meetingId: found.id,
        scorepadId: current.id,
        seats: seats(),
        expansionIds: chosen().map((expansion) => expansion.id),
      });
    },
    onSuccess: (_, id) => {
      toast.show(format(t.meetings.toasts.playStarted, { title: game()?.title ?? '' }), 'success');
      // Kreator ustępuje notesowi partii (PAD-4); Wstecz wraca do spotkania.
      if (mounted()) popups.replace({ kind: 'play', id });
    },
    // Także po błędzie: notes, gra albo spotkanie mogły się zmienić w innej karcie.
    onSettled: (_, error) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: meetingsKey }),
        ...(error
          ? [
              queryClient.invalidateQueries({ queryKey: scorepadsKey }),
              queryClient.invalidateQueries({ queryKey: gamesKey }),
            ]
          : []),
      ]),
  });
  const changed = () => {
    start.reset();
    setPlayId(crypto.randomUUID());
  };

  const chooseGame = (id: string) => {
    if (id === gameId()) return;
    setGameId(id);
    setScorepadId(null);
    setSeats([]);
    setExpansionIds([]);
    changed();
  };
  const toggleExpansion = (id: string) => {
    const current = expansionIds();
    const next = current.includes(id) ? current.filter((each) => each !== id) : [...current, id];
    setExpansionIds(next);
    // Notes odznaczonego dodatku nie pasuje już do partii: wybór notesu od nowa.
    const selected = pad();
    if (selected && selected.game_id !== gameId() && !next.includes(selected.game_id)) {
      setScorepadId(null);
      setSeats([]);
    }
    changed();
  };
  const chooseScorepad = (next: Scorepad) => {
    if (next.id === scorepadId()) return;
    setScorepadId(next.id);
    setSeats(emptySeats(scorepadSlots(next)));
    changed();
  };

  // Gra jest do wyboru, gdy pasuje z którymkolwiek zestawem dodatków (dodatek może mieć notes
  // albo rozszerzać liczbę graczy); dokładny zakres liczy się po wyborze dodatków.
  const fullRange = (candidate: Game) => {
    const all = availableExpansionsOf(candidate.id);
    return { range: combinedRange(candidate, all), pads: padsOf([candidate, ...all]) };
  };
  const gameReasonOf = (candidate: Game) => {
    if (!candidate.available) return t.meetings.newPlay.reasons.unavailable;
    const full = fullRange(candidate);
    return gameReason(full.range, full.pads, participants().length);
  };
  const gameReady = createMemo(() => {
    const current = game();
    return current !== null && gameReasonOf(current) === null;
  });
  const padReady = createMemo(() => {
    const players = range();
    const current = pad();
    return players !== null && current !== null && scorepadReason(players, current) === null;
  });
  const done = createMemo<Record<NewPlayStep, boolean>>(() => ({
    game: gameReady() && step() !== 'game',
    expansions: gameReady() && (step() === 'scorepad' || step() === 'players'),
    scorepad: padReady() && step() === 'players',
    players: false,
  }));

  const afterExpansions = () => {
    const only = singlePad();
    if (only) {
      chooseScorepad(only);
      setStep('players');
    } else {
      setStep('scorepad');
    }
  };
  const next = () => {
    const current = step();
    if (current === 'game' && gameReady()) {
      if (hasExpansions()) setStep('expansions');
      else afterExpansions();
    } else if (current === 'expansions') {
      afterExpansions();
    } else if (current === 'scorepad' && padReady()) {
      setStep('players');
    }
  };
  const beforeScorepad = (): NewPlayStep => (hasExpansions() ? 'expansions' : 'game');
  const previous = () => {
    const current = step();
    if (current === 'players') setStep(singlePad() ? beforeScorepad() : 'scorepad');
    else if (current === 'scorepad') setStep(beforeScorepad());
    else if (current === 'expansions') setStep('game');
  };

  const problem = () => {
    const limits = bounds();
    return limits ? seatsProblem(seats(), limits) : 'tooFew';
  };
  const failure = () => {
    const error = start.state().error;
    return error instanceof StartPlayError ? text.errors[error.reason] : text.errors.save;
  };
  const busy = () => start.state().isPending || start.state().isSuccess;

  function Footer() {
    return (
      <>
        <Button
          variant="secondary"
          disabled={busy()}
          onClick={() => (step() === 'game' ? popups.back() : previous())}
        >
          {step() === 'game' ? text.cancel : text.back}
        </Button>
        <Show
          when={step() === 'players'}
          fallback={
            <Button
              disabled={
                step() === 'game' ? !gameReady() : step() === 'scorepad' ? !padReady() : false
              }
              onClick={next}
            >
              {text.next}
            </Button>
          }
        >
          <Button
            icon="play"
            loading={start.state().isPending}
            disabled={problem() !== null || start.state().isSuccess}
            onClick={() => start.mutate(playId())}
          >
            {text.start}
          </Button>
        </Show>
      </>
    );
  }

  function Body(props: { readonly publishedIds: readonly string[] }) {
    return (
      <div class="meeting-view new-play">
        <StepPills
          steps={steps()}
          step={step()}
          done={done()}
          skipped={singlePad() ? 'scorepad' : null}
          onBack={busy() ? undefined : setStep}
        />
        <Show when={start.state().isError}>
          <Banner variant="error">{failure()}</Banner>
        </Show>
        <Switch>
          <Match when={step() === 'game'}>
            <GameStep
              games={data.games()}
              publishedIds={props.publishedIds}
              padsFor={(candidate) => fullRange(candidate).pads}
              reasonFor={gameReasonOf}
              value={gameId()}
              onChange={chooseGame}
            />
          </Match>
          <Match when={step() === 'expansions' && game()}>
            {(current) => (
              <ExpansionsStep
                game={current()}
                expansions={gameExpansions()}
                value={expansionIds()}
                onToggle={toggleExpansion}
              />
            )}
          </Match>
          <Match when={step() === 'scorepad' && game()}>
            {(current) => (
              <Show when={range()}>
                {(players) => (
                  <ScorepadStep
                    game={current()}
                    range={players()}
                    pads={gamePads()}
                    titles={titles()}
                    value={scorepadId()}
                    onChange={chooseScorepad}
                  />
                )}
              </Show>
            )}
          </Match>
          <Match when={step() === 'players' && game()}>
            {(current) => (
              <Show when={pad()}>
                {(selected) => (
                  <Show when={bounds()}>
                    {(limits) => (
                      <PlayersStep
                        game={current()}
                        expansions={chosen()}
                        pad={selected()}
                        bounds={limits()}
                        participants={participants()}
                        seats={seats()}
                        onChange={(nextSeats) => {
                          setSeats(nextSeats);
                          changed();
                        }}
                        disabled={busy()}
                      />
                    )}
                  </Show>
                )}
              </Show>
            )}
          </Match>
        </Switch>
      </div>
    );
  }

  return { Footer, Body };
}

/**
 * Pigułki kroków (DS §15 „Step pills”): bieżący „N. Nazwa” na ciemnym tle, ukończony
 * z ptaszkiem w kolorze akcentu (przycisk powrotu do kroku), kolejny z obramowaniem.
 * Pominięty krok (jedyny pasujący notes) jest ukończony, ale bez powrotu.
 */
function StepPills(props: {
  readonly steps: readonly NewPlayStep[];
  readonly step: NewPlayStep;
  readonly done: Readonly<Record<NewPlayStep, boolean>>;
  readonly skipped: NewPlayStep | null;
  readonly onBack: ((step: NewPlayStep) => void) | undefined;
}) {
  return (
    <ol class="step-pills" aria-label={text.stepsLabel}>
      <For each={props.steps}>
        {(id, index) => {
          const name = text.steps[id];
          return (
            <Switch
              fallback={
                <li class="step-pill step-pill--upcoming">
                  {format(text.stepUpcoming, { n: index() + 1, name })}
                </li>
              }
            >
              <Match when={id === props.step}>
                <li class="step-pill step-pill--current" aria-current="step">
                  {format(text.stepCurrent, { n: index() + 1, name })}
                </li>
              </Match>
              <Match when={props.done[id] && id === props.skipped}>
                <li class="step-pill step-pill--done">
                  <Icon name="check" size={14} />
                  <span aria-hidden="true">{name}</span>
                  <span class="sr-only">{format(text.stepSkipped, { name })}</span>
                </li>
              </Match>
              <Match when={props.done[id]}>
                <li>
                  <button
                    type="button"
                    class="step-pill step-pill--done"
                    aria-label={format(text.stepDone, { name })}
                    disabled={!props.onBack}
                    onClick={() => props.onBack?.(id)}
                  >
                    <Icon name="check" size={14} />
                    <span aria-hidden="true">{name}</span>
                  </button>
                </li>
              </Match>
            </Switch>
          );
        }}
      </For>
    </ol>
  );
}

/** Wiersz wyboru h64 (gra) albo h72 (notes) z radiem i powodem wyłączenia (DS §15). */
function PickRow(props: {
  readonly name: string;
  readonly value: string;
  readonly checked: boolean;
  readonly reason: string | null;
  readonly onSelect: () => void;
  readonly thumb: JSX.Element;
  readonly title: string;
  readonly sub: string;
  readonly tall?: boolean | undefined;
}) {
  const disabled = () => props.reason !== null;
  return (
    <li class="tray__item">
      <label
        class={[
          'choice row pick-row',
          props.tall ? 'pick-row--tall' : 'row--64',
          disabled() ? 'choice--disabled pick-row--disabled' : undefined,
        ]}
      >
        <input
          type="radio"
          class="choice__input"
          name={props.name}
          value={props.value}
          checked={props.checked}
          disabled={disabled()}
          onChange={() => props.onSelect()}
        />
        <span class="radio" aria-hidden="true" />
        <span class="pick-row__thumb">{props.thumb}</span>
        <span class="pick-row__body">
          <span class="pick-row__name">{props.title}</span>
          <span class="pick-row__sub">{props.sub}</span>
          <Show when={props.reason}>
            <span class="pick-row__reason">{props.reason}</span>
          </Show>
        </span>
      </label>
    </li>
  );
}

function GameStep(props: {
  readonly games: readonly Game[];
  readonly publishedIds: readonly string[];
  /** Notesy gry i jej dodatków. */
  readonly padsFor: (game: Game) => readonly Scorepad[];
  /** Powód wyłączenia gry (z dodatkami); `null` = można wybrać. */
  readonly reasonFor: (game: Game) => string | null;
  readonly value: string | null;
  readonly onChange: (id: string) => void;
}) {
  const name = createUniqueId();
  const [query, setQuery] = createSignal('');
  const groups = createMemo(() => groupGames(props.games, props.publishedIds, query()));
  const voting = t.meetings.voting;
  const searching = () => query().trim() !== '';
  const count = () => groups().published.length + groups().others.length;
  const GameRow = (row: { readonly game: Game }) => (
    <PickRow
      name={name}
      value={row.game.id}
      checked={props.value === row.game.id}
      reason={props.reasonFor(row.game)}
      onSelect={() => props.onChange(row.game.id)}
      thumb={
        <GameCover
          id={row.game.id}
          title={row.game.title}
          coverPath={row.game.cover_path}
          size="thumb"
          unavailable={!row.game.available}
        />
      }
      title={row.game.title}
      sub={gameSubtitle(row.game, props.padsFor(row.game))}
    />
  );
  return (
    <Show
      when={props.games.length > 0}
      fallback={<EmptyState icon="dice" title={text.noGamesTitle} helper={text.noGamesHelper} />}
    >
      <p class="meeting-form__state">{text.gameIntro}</p>
      <SearchField
        label={voting.searchLabel}
        placeholder={voting.searchPlaceholder}
        value={query()}
        onValueChange={setQuery}
      />
      <p class="sr-only" role="status">
        {searching() ? plural(count(), voting.results) : ''}
      </p>
      <Show
        when={count() > 0}
        fallback={
          <EmptyState
            icon="search"
            title={format(voting.noResultsTitle, { query: query().trim() })}
            helper={voting.noResultsHelper}
          />
        }
      >
        <fieldset class="new-play__group">
          <legend class="sr-only">{text.gamesLabel}</legend>
          <Show when={groups().published.length > 0}>
            <section class="new-play__section" aria-labelledby={`${name}-published`}>
              <h3 id={`${name}-published`} class="meeting-view__head">
                {text.published}
              </h3>
              <Tray label={text.published}>
                <For each={groups().published} keyed={(game) => game.id}>
                  {(game) => <GameRow game={game()} />}
                </For>
              </Tray>
            </section>
          </Show>
          <Show when={groups().others.length > 0}>
            <section class="new-play__section" aria-labelledby={`${name}-others`}>
              <h3 id={`${name}-others`} class="meeting-view__head">
                {groups().published.length > 0 ? text.others : text.gamesLabel}
              </h3>
              <Tray label={text.others}>
                <For each={groups().others} keyed={(game) => game.id}>
                  {(game) => <GameRow game={game()} />}
                </For>
              </Tray>
            </section>
          </Show>
        </fieldset>
      </Show>
    </Show>
  );
}

/**
 * Dodatki partii (pola wyboru): prowadzący zaznacza dodatki użyte w partii albo żaden. Dodatek
 * nie ma własnego rankingu: wyniki trafiają do gry podstawowej.
 */
function ExpansionsStep(props: {
  readonly game: Game;
  readonly expansions: readonly Game[];
  readonly value: readonly string[];
  readonly onToggle: (id: string) => void;
}) {
  const label = () => format(text.expansionsLabel, { title: props.game.title });
  return (
    <>
      <p class="meeting-form__state">{format(text.expansionsIntro, { title: props.game.title })}</p>
      <fieldset class="new-play__group">
        <legend class="sr-only">{label()}</legend>
        <Tray label={label()}>
          <For each={props.expansions} keyed={(expansion) => expansion.id}>
            {(expansion) => {
              const players = () =>
                boundsLabel({ min: expansion().min_players, max: expansion().max_players });
              const disabled = () => !expansion().available;
              return (
                <li class="tray__item">
                  <label
                    class={[
                      'choice row pick-row row--64',
                      disabled() ? 'choice--disabled pick-row--disabled' : undefined,
                    ]}
                  >
                    <input
                      type="checkbox"
                      class="choice__input"
                      value={expansion().id}
                      checked={!disabled() && props.value.includes(expansion().id)}
                      disabled={disabled()}
                      onChange={() => props.onToggle(expansion().id)}
                    />
                    <span class="checkbox" aria-hidden="true">
                      <Icon name="check" size={14} />
                    </span>
                    <span class="pick-row__thumb">
                      <GameCover
                        id={expansion().id}
                        title={expansion().title}
                        coverPath={expansion().cover_path}
                        size="thumb"
                        unavailable={disabled()}
                      />
                    </span>
                    <span class="pick-row__body">
                      <span class="pick-row__name">{expansion().title}</span>
                      <span class="pick-row__sub">
                        {expansion().complexity !== null
                          ? format(text.expansionSub, {
                              players: players(),
                              complexity: String(expansion().complexity).replace('.', ','),
                            })
                          : format(text.expansionSubNoComplexity, { players: players() })}
                      </span>
                      <Show when={disabled()}>
                        <span class="pick-row__reason">{text.reasons.expansionUnavailable}</span>
                      </Show>
                    </span>
                  </label>
                </li>
              );
            }}
          </For>
        </Tray>
      </fieldset>
    </>
  );
}

function ScorepadStep(props: {
  readonly game: Game;
  /** Liczba graczy gry z wybranymi dodatkami. */
  readonly range: Pick<Game, 'min_players' | 'max_players'>;
  readonly pads: readonly Scorepad[];
  /** Tytuły gier i dodatków: przy notesie dodatku jego tytuł. */
  readonly titles: ReadonlyMap<string, string>;
  readonly value: string | null;
  readonly onChange: (pad: Scorepad) => void;
}) {
  const name = createUniqueId();
  const label = () => format(text.scorepadsLabel, { title: props.game.title });
  return (
    <>
      <p class="meeting-form__state">{format(text.scorepadIntro, { title: props.game.title })}</p>
      <fieldset class="new-play__group">
        <legend class="sr-only">{label()}</legend>
        <Tray label={label()}>
          <For each={props.pads} keyed={(pad) => pad.id}>
            {(pad) => (
              <PickRow
                name={name}
                value={pad().id}
                checked={props.value === pad().id}
                reason={scorepadReason(props.range, pad())}
                onSelect={() => props.onChange(pad())}
                thumb={<SheetThumbnail gameId={props.game.id} small />}
                title={
                  pad().game_id === props.game.id
                    ? pad().name
                    : format(text.scorepadOf, {
                        pad: pad().name,
                        title: props.titles.get(pad().game_id) ?? '',
                      })
                }
                sub={scorepadSubtitle(pad())}
                tall
              />
            )}
          </For>
        </Tray>
      </fieldset>
    </>
  );
}

function PlayersStep(props: {
  readonly game: Game;
  /** Wybrane dodatki partii. */
  readonly expansions: readonly Game[];
  readonly pad: Scorepad;
  readonly bounds: PlayerBounds;
  readonly participants: readonly Profile[];
  readonly seats: Seats;
  readonly onChange: (seats: Seats) => void;
  readonly disabled: boolean;
}) {
  const headingId = createUniqueId();
  const [openSeat, setOpenSeat] = createSignal<number | null>(null);
  const teams = () => scorepadTeams(props.pad);
  const seated = createMemo(() => seatedPlayers(props.seats));
  const full = () => seated().length >= props.bounds.max;
  const outside = createMemo(() =>
    props.participants.filter((person) => !seated().includes(person.id)),
  );
  const free = () => firstFreeSeat(props.seats);
  const problem = () => seatsProblem(props.seats, props.bounds);
  const byId = createMemo(() => new Map(props.participants.map((person) => [person.id, person])));
  return (
    <section class="new-play__section" aria-labelledby={headingId}>
      <p class="meeting-form__state">
        {format(text.seatsIntro, {
          title:
            props.expansions.length > 0
              ? format(text.withExpansions, {
                  title: props.game.title,
                  expansions: props.expansions.map((expansion) => expansion.title).join(', '),
                })
              : props.game.title,
          notes: props.pad.name,
          range: boundsLabel(props.bounds),
        })}
      </p>
      <Show when={props.expansions.length > 0}>
        <p class="meeting-form__hint" aria-live="polite">
          {format(text.scoring, {
            title: scoringTitle(
              props.game,
              props.expansions,
              Math.max(seated().length, props.bounds.min),
            ).title,
          })}
        </p>
      </Show>
      <div class="meeting-view__head-row">
        <h3 id={headingId} class="meeting-view__head">
          {text.seatsTitle}
        </h3>
        <span class="meeting-view__note" aria-live="polite">
          {teams()
            ? format(text.teamsCount, {
                n: seated().length,
                seats: props.seats.filter((ids) => ids.length > 0).length,
                total: props.seats.length,
              })
            : format(text.seatsCount, { n: seated().length, total: props.seats.length })}
        </span>
      </div>
      <Show when={teams()}>
        <p class="meeting-form__hint">{text.teamsHint}</p>
      </Show>
      <ol class="seat-list" aria-label={text.seatsLabel}>
        <For each={props.seats} keyed={false}>
          {(ids, index) => (
            <SeatRow
              index={index}
              players={ids().flatMap((id) => {
                const person = byId().get(id);
                return person ? [person] : [];
              })}
              seats={props.seats}
              participants={props.participants}
              teams={teams()}
              canAdd={!full()}
              open={openSeat() === index}
              disabled={props.disabled}
              onToggle={() => setOpenSeat((current) => (current === index ? null : index))}
              onPick={(profileId) => {
                if (teams() && profileId !== null) {
                  // Zespół: lista zostaje otwarta, żeby dodać kolejnych graczy.
                  props.onChange(toggleTeamMember(props.seats, index, profileId));
                  return;
                }
                props.onChange(assignSeat(props.seats, index, profileId));
                setOpenSeat(null);
              }}
              onClose={() => setOpenSeat(null)}
            />
          )}
        </For>
      </ol>
      <div class="seat-outside">
        <span class="seat-outside__label">{text.outside}</span>
        <Show
          when={outside().length > 0}
          fallback={<span class="seat-outside__none">{text.allSeated}</span>}
        >
          <ul class="seat-outside__list" aria-label={text.outsideLabel}>
            <For each={outside()} keyed={(person) => person.id}>
              {(person) => (
                <li>
                  <button
                    type="button"
                    class="seat-pill"
                    aria-label={format(text.addToSeat, { name: fullName(person()) })}
                    disabled={props.disabled || full() || free() < 0}
                    onClick={() => props.onChange(assignSeat(props.seats, free(), person().id))}
                  >
                    <ProfileAvatar profile={person()} size={20} decorative />
                    <span aria-hidden="true">{fullName(person())}</span>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>
      <p class="meeting-form__hint" aria-live="polite">
        {problem() === 'tooFew'
          ? plural(props.bounds.min, text.tooFew)
          : problem() === 'tooMany'
            ? plural(props.bounds.max, text.tooMany)
            : problem() === 'sides'
              ? text.tooFewSides
              : full() && outside().length > 0 && free() >= 0
                ? text.full
                : ''}
      </p>
    </section>
  );
}

/**
 * Miejsce w notesie (DS §15 „Seat row”): numer i pole h48. Zajęte: awatar, imię i nazwisko,
 * strzałka; wolne: przerywane obramowanie „Wybierz gracza”. Pole rozwija listę uczestników
 * (PAD-2: wybór zamiast wpisywania imion); gracz z innego miejsca przesiada się.
 */
function SeatRow(props: {
  readonly index: number;
  readonly players: readonly Profile[];
  readonly seats: Seats;
  readonly participants: readonly Profile[];
  /** Notes z zespołami: lista dodaje i usuwa graczy miejsca zamiast zamieniać jednego. */
  readonly teams: boolean;
  readonly canAdd: boolean;
  readonly open: boolean;
  readonly disabled: boolean;
  readonly onToggle: () => void;
  readonly onPick: (profileId: string | null) => void;
  readonly onClose: () => void;
}) {
  const n = () => props.index + 1;
  const player = () => props.players[0] ?? null;
  const names = () => props.players.map(fullName).join(', ');
  const listId = createUniqueId();
  let button: HTMLButtonElement | undefined;
  let list: HTMLUListElement | undefined;
  let wasOpen = false;

  createEffect(
    () => props.open,
    (open) => {
      if (open) {
        list?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
      } else if (wasOpen) {
        button?.focus();
      }
      wasOpen = open;
    },
  );

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && props.open) {
      // Esc zamyka listę, a nie popup pod nią.
      event.preventDefault();
      event.stopPropagation();
      props.onClose();
    }
  };

  return (
    <li class="seat" onKeyDown={onKeyDown}>
      <div class="seat__row">
        <span class="seat__number" aria-hidden="true">
          {n()}
        </span>
        <button
          ref={(el) => (button = el)}
          type="button"
          class={['seat__field', player() ? 'seat__field--filled' : 'seat__field--empty']}
          aria-label={
            player()
              ? format(props.teams ? text.teamFilled : text.seatFilled, { n: n(), name: names() })
              : format(props.teams ? text.teamChoose : text.seatChoose, { n: n() })
          }
          aria-expanded={ariaBool(props.open)}
          aria-controls={props.open ? listId : undefined}
          disabled={props.disabled}
          onClick={() => props.onToggle()}
        >
          <Show
            when={player()}
            fallback={
              <>
                <Icon name="plus" class="seat__chevron" />
                <span class="seat__name">{props.teams ? text.teamEmpty : text.seatEmpty}</span>
              </>
            }
          >
            <span class="seat__avatars">
              <For each={props.players} keyed={(person) => person.id}>
                {(person) => <ProfileAvatar profile={person()} size={32} decorative />}
              </For>
            </span>
            <span class="seat__name">{names()}</span>
            <Icon name="chevron-down" class="seat__chevron" />
          </Show>
        </button>
      </div>
      <Show when={props.open}>
        <ul
          ref={(el) => (list = el)}
          id={listId}
          class="seat-picker"
          aria-label={format(text.pickerLabel, { n: n() })}
        >
          <For each={props.participants} keyed={(person) => person.id}>
            {(person) => {
              const at = () => seatOf(props.seats, person().id);
              const here = () => at() === props.index;
              // Nowy gracz z listy (nie przesiadka) tylko, gdy partia ma jeszcze wolne miejsce;
              // w zespole każdy nowy gracz zwiększa liczbę graczy partii.
              const blocked = () => at() < 0 && (props.teams || !player()) && !props.canAdd;
              return (
                <li>
                  <button
                    type="button"
                    class={['seat-picker__option', { 'seat-picker__option--current': here() }]}
                    aria-pressed={ariaBool(here())}
                    disabled={blocked()}
                    onClick={() => props.onPick(person().id)}
                  >
                    <ProfileAvatar profile={person()} size={32} decorative />
                    <span class="seat__name">{fullName(person())}</span>
                    <Show
                      when={here()}
                      fallback={
                        <Show when={at() >= 0}>
                          <span class="seat-picker__seat">
                            {format(text.seat, { n: at() + 1 })}
                          </span>
                        </Show>
                      }
                    >
                      <Icon name="check" size={16} class="seat-picker__check" />
                    </Show>
                  </button>
                </li>
              );
            }}
          </For>
          <Show when={player()}>
            <li>
              <button
                type="button"
                class="seat-picker__option seat-picker__option--clear"
                onClick={() => props.onPick(null)}
              >
                <Icon name="x" size={16} />
                <span>{text.clearSeat}</span>
              </button>
            </li>
          </Show>
        </ul>
      </Show>
    </li>
  );
}
