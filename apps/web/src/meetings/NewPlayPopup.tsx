import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useAuth } from '../auth/authContext';
import type { OwnProfile } from '../auth/useOwnProfile';
import { GameCover } from '../react-shared/GameCover';
import { gamesKey, type Game } from '../games/games';
import { useAllExpansions, useGameSearch } from '../react-shared/games';
import { format, plural, t } from '../i18n';
import { usePopups } from '../popups/popupContext';
import { PopupModal } from '../popups/PopupModal';
import { QueryStatus } from '../popups/QueryStatus';
import { useMounted } from '../popups/useMounted';
import { ProfileAvatar } from '../react-shared/ProfileAvatar';
import { compareProfiles, fullName, useAllProfiles, type Profile } from '../react-shared/profiles';
import { useActiveScorepads } from '../react-shared/scorepads';
import { scorepadsKey, type Scorepad } from '../score-pad/scorepads';
import { Banner, Button, EmptyState, Icon, SearchField, Tray, useToast } from '../ui';
import { cx } from '../ui/cx';
import { SheetThumbnail } from './MeetingPlays';
import { meetingsKey, useMeeting, type Meeting } from './meetings';
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
import { usePublishedGames } from './voting';
import './meetings.css';

const text = t.meetings.newPlay;

/**
 * Nowa partia (RUN-2, RUN-3, PAD-2, PAD-3, PAD-9): kreator w trzech krokach (DS §15 „Step
 * pills”). Gra: najpierw opublikowane, potem reszta kolekcji; gry bez pasującego notesu albo
 * z większym minimum niż liczba uczestników są wyłączone z wyjaśnieniem. Notes: gdy gra ma
 * jeden pasujący notes, krok jest pomijany. Gracze: uczestnicy spotkania w miejscach notesu,
 * każdy najwyżej raz. Rozpoczęcie tworzy szkic partii (`start_play`); kilka partii może trwać
 * naraz. Tylko admin i prowadzący, tylko spotkanie w trakcie (reguły powtarza RPC).
 */
export function NewPlayPopup({
  meetingId,
  me,
}: {
  readonly meetingId: string;
  readonly me: OwnProfile;
}) {
  const { client } = useAuth();
  const meeting = useMeeting(client, meetingId);
  const games = useGameSearch(client, '');
  const published = usePublishedGames(client, meetingId);
  const pads = useActiveScorepads(client);
  const profiles = useAllProfiles(client);
  const expansions = useAllExpansions(client);
  const queries = [meeting, games, published, pads, profiles, expansions] as const;

  if (
    !meeting.isSuccess ||
    !games.isSuccess ||
    !expansions.isSuccess ||
    !published.isSuccess ||
    !pads.isSuccess ||
    !profiles.isSuccess
  ) {
    return (
      <PopupModal title={text.title}>
        <QueryStatus
          isError={queries.some((query) => query.isError)}
          onRetry={() => queries.forEach((query) => void query.refetch())}
        />
      </PopupModal>
    );
  }
  const current = meeting.data;
  const blocked = !current
    ? t.meetings.popup.notFoundBody
    : !isMeetingRunner(current, me)
      ? text.notRunner
      : current.status !== 'in_progress'
        ? text.notInProgress
        : null;
  if (!current || blocked) {
    return (
      <PopupModal title={text.title}>
        <p className="meeting-form__state">{blocked}</p>
      </PopupModal>
    );
  }
  return (
    <Wizard
      meeting={current}
      games={games.data}
      expansions={expansions.data}
      publishedIds={published.data.map((game) => game.id)}
      pads={pads.data}
      profiles={profiles.data}
    />
  );
}

interface WizardProps {
  readonly meeting: Meeting;
  readonly games: readonly Game[];
  /** Aktywne dodatki wszystkich gier: wybór dodatków partii i ich notesy. */
  readonly expansions: readonly Game[];
  readonly publishedIds: readonly string[];
  readonly pads: readonly Scorepad[];
  readonly profiles: ReadonlyMap<string, Profile>;
}

function Wizard({ meeting, games, expansions, publishedIds, pads, profiles }: WizardProps) {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { back, replace } = usePopups();
  const mounted = useMounted();
  // Id partii: to samo przy ponowieniu (błąd sieci nie zdubluje partii), nowe po każdej zmianie
  // wyboru, bo baza zwraca istniejącą partię tylko dla identycznej treści.
  const [playId, setPlayId] = useState(() => crypto.randomUUID());
  const [step, setStep] = useState<NewPlayStep>('game');
  const [gameId, setGameId] = useState<string | null>(null);
  const [scorepadId, setScorepadId] = useState<string | null>(null);
  const [seats, setSeats] = useState<Seats>([]);
  const [expansionIds, setExpansionIds] = useState<readonly string[]>([]);

  // Gracze: aktywni uczestnicy (usunięty z klubu zostaje w historii, ale nie zagra, MEM-5).
  const participants = meeting.participants
    .map((id) => profiles.get(id))
    .filter((person): person is Profile => person !== undefined && person.deleted_at === null)
    .sort(compareProfiles);
  const byGame = scorepadsByGame(pads);
  const expansionsOf = (baseId: string) => expansions.filter((e) => e.base_game_id === baseId);
  // Niedostępnych dodatków nie da się zaznaczyć: nie liczą się do graczy ani notesów partii.
  const availableExpansionsOf = (baseId: string) => expansionsOf(baseId).filter((e) => e.available);
  // Notesy gry i jej dodatków (notes dodatku tylko w partii z tym dodatkiem).
  const padsOf = (titles: readonly Game[]) => titles.flatMap((title) => byGame.get(title.id) ?? []);
  const titles = new Map([...games, ...expansions].map((title) => [title.id, title.title]));
  const game = games.find((candidate) => candidate.id === gameId) ?? null;
  const gameExpansions = game ? expansionsOf(game.id) : [];
  const chosen = gameExpansions.filter(
    (expansion) => expansion.available && expansionIds.includes(expansion.id),
  );
  const range = game ? combinedRange(game, chosen) : null;
  const gamePads = game ? padsOf([game, ...chosen]) : [];
  const pad = gamePads.find((candidate) => candidate.id === scorepadId) ?? null;
  const bounds = range && pad ? playerBounds(range, scorepadSlots(pad), scorepadTeams(pad)) : null;
  const hasExpansions = gameExpansions.some((expansion) => expansion.available);
  const steps = newPlaySteps(hasExpansions);
  // Jeden notes gry, który pasuje: krok „Notes” jest pomijany (RUN-2: „gdy gra ma ich kilka”).
  const singlePad =
    range && gamePads.length === 1 && fittingScorepads(range, gamePads).length === 1
      ? gamePads[0]
      : undefined;

  const start = useMutation({
    mutationFn: () => {
      if (!pad) throw new StartPlayError('scorepadGone');
      return startPlay(client, {
        playId,
        meetingId: meeting.id,
        scorepadId: pad.id,
        seats,
        expansionIds: chosen.map((expansion) => expansion.id),
      });
    },
    onSuccess: () => {
      toast.show(format(t.meetings.toasts.playStarted, { title: game?.title ?? '' }), 'success');
      // Kreator ustępuje notesowi partii (PAD-4); Wstecz wraca do spotkania.
      if (mounted.current) replace({ kind: 'play', id: playId });
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
    if (id === gameId) return;
    setGameId(id);
    setScorepadId(null);
    setSeats([]);
    setExpansionIds([]);
    changed();
  };
  const toggleExpansion = (id: string) => {
    const next = expansionIds.includes(id)
      ? expansionIds.filter((current) => current !== id)
      : [...expansionIds, id];
    setExpansionIds(next);
    // Notes odznaczonego dodatku nie pasuje już do partii: wybór notesu od nowa.
    if (pad && pad.game_id !== gameId && !next.includes(pad.game_id)) {
      setScorepadId(null);
      setSeats([]);
    }
    changed();
  };
  const chooseScorepad = (next: Scorepad) => {
    if (next.id === scorepadId) return;
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
    return gameReason(full.range, full.pads, participants.length);
  };
  const gameReady = game !== null && gameReasonOf(game) === null;
  const padReady = range !== null && pad !== null && scorepadReason(range, pad) === null;
  const done: Record<NewPlayStep, boolean> = {
    game: gameReady && step !== 'game',
    expansions: gameReady && (step === 'scorepad' || step === 'players'),
    scorepad: padReady && step === 'players',
    players: false,
  };

  const afterExpansions = () => {
    if (singlePad) {
      chooseScorepad(singlePad);
      setStep('players');
    } else {
      setStep('scorepad');
    }
  };
  const next = () => {
    if (step === 'game' && gameReady) {
      if (hasExpansions) setStep('expansions');
      else afterExpansions();
    } else if (step === 'expansions') {
      afterExpansions();
    } else if (step === 'scorepad' && padReady) {
      setStep('players');
    }
  };
  const beforeScorepad: NewPlayStep = hasExpansions ? 'expansions' : 'game';
  const previous = () => {
    if (step === 'players') setStep(singlePad ? beforeScorepad : 'scorepad');
    else if (step === 'scorepad') setStep(beforeScorepad);
    else if (step === 'expansions') setStep('game');
  };

  const problem = bounds ? seatsProblem(seats, bounds) : 'tooFew';
  const failure =
    start.error instanceof StartPlayError ? text.errors[start.error.reason] : text.errors.save;
  const busy = start.isPending || start.isSuccess;

  return (
    <PopupModal
      title={text.title}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={step === 'game' ? back : previous}>
            {step === 'game' ? text.cancel : text.back}
          </Button>
          {step === 'players' ? (
            <Button
              icon="play"
              loading={start.isPending}
              disabled={problem !== null || start.isSuccess}
              onClick={() => start.mutate()}
            >
              {text.start}
            </Button>
          ) : (
            <Button
              disabled={step === 'game' ? !gameReady : step === 'scorepad' ? !padReady : false}
              onClick={next}
            >
              {text.next}
            </Button>
          )}
        </>
      }
    >
      <div className="meeting-view new-play">
        <StepPills
          steps={steps}
          step={step}
          done={done}
          skipped={singlePad ? 'scorepad' : null}
          onBack={busy ? undefined : setStep}
        />
        {start.isError ? <Banner variant="error">{failure}</Banner> : null}
        {step === 'game' ? (
          <GameStep
            games={games}
            publishedIds={publishedIds}
            padsFor={(candidate) => fullRange(candidate).pads}
            reasonFor={gameReasonOf}
            value={gameId}
            onChange={chooseGame}
          />
        ) : null}
        {step === 'expansions' && game ? (
          <ExpansionsStep
            game={game}
            expansions={gameExpansions}
            value={expansionIds}
            onToggle={toggleExpansion}
          />
        ) : null}
        {step === 'scorepad' && game && range ? (
          <ScorepadStep
            game={game}
            range={range}
            pads={gamePads}
            titles={titles}
            value={scorepadId}
            onChange={chooseScorepad}
          />
        ) : null}
        {step === 'players' && game && pad && bounds ? (
          <PlayersStep
            game={game}
            expansions={chosen}
            pad={pad}
            bounds={bounds}
            participants={participants}
            seats={seats}
            onChange={(nextSeats) => {
              setSeats(nextSeats);
              changed();
            }}
            disabled={busy}
          />
        ) : null}
      </div>
    </PopupModal>
  );
}

/**
 * Pigułki kroków (DS §15 „Step pills”): bieżący „N. Nazwa” na ciemnym tle, ukończony
 * z ptaszkiem w kolorze akcentu (przycisk powrotu do kroku), kolejny z obramowaniem.
 * Pominięty krok (jedyny pasujący notes) jest ukończony, ale bez powrotu.
 */
function StepPills({
  steps,
  step,
  done,
  skipped,
  onBack,
}: {
  readonly steps: readonly NewPlayStep[];
  readonly step: NewPlayStep;
  readonly done: Readonly<Record<NewPlayStep, boolean>>;
  readonly skipped: NewPlayStep | null;
  readonly onBack: ((step: NewPlayStep) => void) | undefined;
}) {
  return (
    <ol className="step-pills" aria-label={text.stepsLabel}>
      {steps.map((id, index) => {
        const name = text.steps[id];
        const n = index + 1;
        if (id === step) {
          return (
            <li key={id} className="step-pill step-pill--current" aria-current="step">
              {format(text.stepCurrent, { n, name })}
            </li>
          );
        }
        if (done[id] && id === skipped) {
          return (
            <li key={id} className="step-pill step-pill--done">
              <Icon name="check" size={14} />
              <span aria-hidden="true">{name}</span>
              <span className="sr-only">{format(text.stepSkipped, { name })}</span>
            </li>
          );
        }
        if (done[id]) {
          return (
            <li key={id}>
              <button
                type="button"
                className="step-pill step-pill--done"
                aria-label={format(text.stepDone, { name })}
                disabled={!onBack}
                onClick={() => onBack?.(id)}
              >
                <Icon name="check" size={14} />
                <span aria-hidden="true">{name}</span>
              </button>
            </li>
          );
        }
        return (
          <li key={id} className="step-pill step-pill--upcoming">
            {format(text.stepUpcoming, { n, name })}
          </li>
        );
      })}
    </ol>
  );
}

/** Wiersz wyboru h64 (gra) albo h72 (notes) z radiem i powodem wyłączenia (DS §15). */
function PickRow({
  name,
  value,
  checked,
  reason,
  onSelect,
  thumb,
  title,
  sub,
  tall = false,
}: {
  readonly name: string;
  readonly value: string;
  readonly checked: boolean;
  readonly reason: string | null;
  readonly onSelect: () => void;
  readonly thumb: ReactNode;
  readonly title: string;
  readonly sub: string;
  readonly tall?: boolean;
}) {
  const disabled = reason !== null;
  return (
    <li className="tray__item">
      <label
        className={cx(
          'choice row pick-row',
          tall ? 'pick-row--tall' : 'row--64',
          disabled && 'choice--disabled pick-row--disabled',
        )}
      >
        <input
          type="radio"
          className="choice__input"
          name={name}
          value={value}
          checked={checked}
          disabled={disabled}
          onChange={onSelect}
        />
        <span className="radio" aria-hidden="true" />
        <span className="pick-row__thumb">{thumb}</span>
        <span className="pick-row__body">
          <span className="pick-row__name">{title}</span>
          <span className="pick-row__sub">{sub}</span>
          {reason ? <span className="pick-row__reason">{reason}</span> : null}
        </span>
      </label>
    </li>
  );
}

function GameStep({
  games,
  publishedIds,
  padsFor,
  reasonFor,
  value,
  onChange,
}: {
  readonly games: readonly Game[];
  readonly publishedIds: readonly string[];
  /** Notesy gry i jej dodatków. */
  readonly padsFor: (game: Game) => readonly Scorepad[];
  /** Powód wyłączenia gry (z dodatkami); `null` = można wybrać. */
  readonly reasonFor: (game: Game) => string | null;
  readonly value: string | null;
  readonly onChange: (id: string) => void;
}) {
  const name = useId();
  const [query, setQuery] = useState('');
  const groups = groupGames(games, publishedIds, query);
  const voting = t.meetings.voting;
  const searching = query.trim() !== '';
  const count = groups.published.length + groups.others.length;
  const row = (game: Game) => {
    const pads = padsFor(game);
    return (
      <PickRow
        key={game.id}
        name={name}
        value={game.id}
        checked={value === game.id}
        reason={reasonFor(game)}
        onSelect={() => onChange(game.id)}
        thumb={
          <GameCover
            id={game.id}
            title={game.title}
            coverPath={game.cover_path}
            size="thumb"
            unavailable={!game.available}
          />
        }
        title={game.title}
        sub={gameSubtitle(game, pads)}
      />
    );
  };
  if (games.length === 0) {
    return <EmptyState icon="dice" title={text.noGamesTitle} helper={text.noGamesHelper} />;
  }
  return (
    <>
      <p className="meeting-form__state">{text.gameIntro}</p>
      <SearchField
        label={voting.searchLabel}
        placeholder={voting.searchPlaceholder}
        value={query}
        onValueChange={setQuery}
      />
      <p className="sr-only" role="status">
        {searching ? plural(count, voting.results) : ''}
      </p>
      {count === 0 ? (
        <EmptyState
          icon="search"
          title={format(voting.noResultsTitle, { query: query.trim() })}
          helper={voting.noResultsHelper}
        />
      ) : (
        <fieldset className="new-play__group">
          <legend className="sr-only">{text.gamesLabel}</legend>
          {groups.published.length > 0 ? (
            <section className="new-play__section" aria-labelledby={`${name}-published`}>
              <h3 id={`${name}-published`} className="meeting-view__head">
                {text.published}
              </h3>
              <Tray label={text.published}>{groups.published.map(row)}</Tray>
            </section>
          ) : null}
          {groups.others.length > 0 ? (
            <section className="new-play__section" aria-labelledby={`${name}-others`}>
              <h3 id={`${name}-others`} className="meeting-view__head">
                {groups.published.length > 0 ? text.others : text.gamesLabel}
              </h3>
              <Tray label={text.others}>{groups.others.map(row)}</Tray>
            </section>
          ) : null}
        </fieldset>
      )}
    </>
  );
}

/**
 * Dodatki partii (pola wyboru): prowadzący zaznacza dodatki użyte w partii albo żaden. Dodatek
 * nie ma własnego rankingu: wyniki trafiają do gry podstawowej.
 */
function ExpansionsStep({
  game,
  expansions,
  value,
  onToggle,
}: {
  readonly game: Game;
  readonly expansions: readonly Game[];
  readonly value: readonly string[];
  readonly onToggle: (id: string) => void;
}) {
  const label = format(text.expansionsLabel, { title: game.title });
  return (
    <>
      <p className="meeting-form__state">{format(text.expansionsIntro, { title: game.title })}</p>
      <fieldset className="new-play__group">
        <legend className="sr-only">{label}</legend>
        <Tray label={label}>
          {expansions.map((expansion) => {
            const players = boundsLabel({
              min: expansion.min_players,
              max: expansion.max_players,
            });
            const disabled = !expansion.available;
            return (
              <li key={expansion.id} className="tray__item">
                <label
                  className={cx(
                    'choice row pick-row row--64',
                    disabled && 'choice--disabled pick-row--disabled',
                  )}
                >
                  <input
                    type="checkbox"
                    className="choice__input"
                    value={expansion.id}
                    checked={!disabled && value.includes(expansion.id)}
                    disabled={disabled}
                    onChange={() => onToggle(expansion.id)}
                  />
                  <span className="checkbox" aria-hidden="true">
                    <Icon name="check" size={14} />
                  </span>
                  <span className="pick-row__thumb">
                    <GameCover
                      id={expansion.id}
                      title={expansion.title}
                      coverPath={expansion.cover_path}
                      size="thumb"
                      unavailable={disabled}
                    />
                  </span>
                  <span className="pick-row__body">
                    <span className="pick-row__name">{expansion.title}</span>
                    <span className="pick-row__sub">
                      {expansion.complexity !== null
                        ? format(text.expansionSub, {
                            players,
                            complexity: String(expansion.complexity).replace('.', ','),
                          })
                        : format(text.expansionSubNoComplexity, { players })}
                    </span>
                    {disabled ? (
                      <span className="pick-row__reason">{text.reasons.expansionUnavailable}</span>
                    ) : null}
                  </span>
                </label>
              </li>
            );
          })}
        </Tray>
      </fieldset>
    </>
  );
}

function ScorepadStep({
  game,
  range,
  pads,
  titles,
  value,
  onChange,
}: {
  readonly game: Game;
  /** Liczba graczy gry z wybranymi dodatkami. */
  readonly range: Pick<Game, 'min_players' | 'max_players'>;
  readonly pads: readonly Scorepad[];
  /** Tytuły gier i dodatków: przy notesie dodatku jego tytuł. */
  readonly titles: ReadonlyMap<string, string>;
  readonly value: string | null;
  readonly onChange: (pad: Scorepad) => void;
}) {
  const name = useId();
  const label = format(text.scorepadsLabel, { title: game.title });
  return (
    <>
      <p className="meeting-form__state">{format(text.scorepadIntro, { title: game.title })}</p>
      <fieldset className="new-play__group">
        <legend className="sr-only">{label}</legend>
        <Tray label={label}>
          {pads.map((pad) => (
            <PickRow
              key={pad.id}
              name={name}
              value={pad.id}
              checked={value === pad.id}
              reason={scorepadReason(range, pad)}
              onSelect={() => onChange(pad)}
              thumb={<SheetThumbnail gameId={game.id} small />}
              title={
                pad.game_id === game.id
                  ? pad.name
                  : format(text.scorepadOf, { pad: pad.name, title: titles.get(pad.game_id) ?? '' })
              }
              sub={scorepadSubtitle(pad)}
              tall
            />
          ))}
        </Tray>
      </fieldset>
    </>
  );
}

function PlayersStep({
  game,
  expansions,
  pad,
  bounds,
  participants,
  seats,
  onChange,
  disabled,
}: {
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
  const headingId = useId();
  const [openSeat, setOpenSeat] = useState<number | null>(null);
  const teams = scorepadTeams(pad);
  const seated = seatedPlayers(seats);
  const full = seated.length >= bounds.max;
  const outside = participants.filter((person) => !seated.includes(person.id));
  const free = firstFreeSeat(seats);
  const problem = seatsProblem(seats, bounds);
  const byId = new Map(participants.map((person) => [person.id, person]));
  return (
    <section className="new-play__section" aria-labelledby={headingId}>
      <p className="meeting-form__state">
        {format(text.seatsIntro, {
          title:
            expansions.length > 0
              ? format(text.withExpansions, {
                  title: game.title,
                  expansions: expansions.map((expansion) => expansion.title).join(', '),
                })
              : game.title,
          notes: pad.name,
          range: boundsLabel(bounds),
        })}
      </p>
      {expansions.length > 0 ? (
        <p className="meeting-form__hint" aria-live="polite">
          {format(text.scoring, {
            title: scoringTitle(game, expansions, Math.max(seated.length, bounds.min)).title,
          })}
        </p>
      ) : null}
      <div className="meeting-view__head-row">
        <h3 id={headingId} className="meeting-view__head">
          {text.seatsTitle}
        </h3>
        <span className="meeting-view__note" aria-live="polite">
          {teams
            ? format(text.teamsCount, {
                n: seated.length,
                seats: seats.filter((ids) => ids.length > 0).length,
                total: seats.length,
              })
            : format(text.seatsCount, { n: seated.length, total: seats.length })}
        </span>
      </div>
      {teams ? <p className="meeting-form__hint">{text.teamsHint}</p> : null}
      <ol className="seat-list" aria-label={text.seatsLabel}>
        {seats.map((ids, index) => (
          <SeatRow
            key={index}
            index={index}
            players={ids.flatMap((id) => {
              const person = byId.get(id);
              return person ? [person] : [];
            })}
            seats={seats}
            participants={participants}
            teams={teams}
            canAdd={!full}
            open={openSeat === index}
            disabled={disabled}
            onToggle={() => setOpenSeat((current) => (current === index ? null : index))}
            onPick={(profileId) => {
              if (teams && profileId !== null) {
                // Zespół: lista zostaje otwarta, żeby dodać kolejnych graczy.
                onChange(toggleTeamMember(seats, index, profileId));
                return;
              }
              onChange(assignSeat(seats, index, profileId));
              setOpenSeat(null);
            }}
            onClose={() => setOpenSeat(null)}
          />
        ))}
      </ol>
      <div className="seat-outside">
        <span className="seat-outside__label">{text.outside}</span>
        {outside.length === 0 ? (
          <span className="seat-outside__none">{text.allSeated}</span>
        ) : (
          <ul className="seat-outside__list" aria-label={text.outsideLabel}>
            {outside.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  className="seat-pill"
                  aria-label={format(text.addToSeat, { name: fullName(person) })}
                  disabled={disabled || full || free < 0}
                  onClick={() => onChange(assignSeat(seats, free, person.id))}
                >
                  <ProfileAvatar profile={person} size={20} decorative />
                  <span aria-hidden="true">{fullName(person)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="meeting-form__hint" aria-live="polite">
        {problem === 'tooFew'
          ? plural(bounds.min, text.tooFew)
          : problem === 'tooMany'
            ? plural(bounds.max, text.tooMany)
            : problem === 'sides'
              ? text.tooFewSides
              : full && outside.length > 0 && free >= 0
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
function SeatRow({
  index,
  players,
  seats,
  participants,
  teams,
  canAdd,
  open,
  disabled,
  onToggle,
  onPick,
  onClose,
}: {
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
  const n = index + 1;
  const player = players[0] ?? null;
  const names = players.map(fullName).join(', ');
  const listId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      list.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    } else if (wasOpen.current) {
      button.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && open) {
      // Esc zamyka listę, a nie popup pod nią.
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <li className="seat" onKeyDown={onKeyDown}>
      <div className="seat__row">
        <span className="seat__number" aria-hidden="true">
          {n}
        </span>
        <button
          ref={button}
          type="button"
          className={cx('seat__field', player ? 'seat__field--filled' : 'seat__field--empty')}
          aria-label={
            player
              ? format(teams ? text.teamFilled : text.seatFilled, { n, name: names })
              : format(teams ? text.teamChoose : text.seatChoose, { n })
          }
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          disabled={disabled}
          onClick={onToggle}
        >
          {player ? (
            <>
              <span className="seat__avatars">
                {players.map((person) => (
                  <ProfileAvatar key={person.id} profile={person} size={32} decorative />
                ))}
              </span>
              <span className="seat__name">{names}</span>
              <Icon name="chevron-down" className="seat__chevron" />
            </>
          ) : (
            <>
              <Icon name="plus" className="seat__chevron" />
              <span className="seat__name">{teams ? text.teamEmpty : text.seatEmpty}</span>
            </>
          )}
        </button>
      </div>
      {open ? (
        <ul
          ref={list}
          id={listId}
          className="seat-picker"
          aria-label={format(text.pickerLabel, { n })}
        >
          {participants.map((person) => {
            const at = seatOf(seats, person.id);
            const here = at === index;
            // Nowy gracz z listy (nie przesiadka) tylko, gdy partia ma jeszcze wolne miejsce;
            // w zespole każdy nowy gracz zwiększa liczbę graczy partii.
            const blocked = at < 0 && (teams || !player) && !canAdd;
            return (
              <li key={person.id}>
                <button
                  type="button"
                  className={cx('seat-picker__option', here && 'seat-picker__option--current')}
                  aria-pressed={here}
                  disabled={blocked}
                  onClick={() => onPick(person.id)}
                >
                  <ProfileAvatar profile={person} size={32} decorative />
                  <span className="seat__name">{fullName(person)}</span>
                  {here ? (
                    <Icon name="check" size={16} className="seat-picker__check" />
                  ) : at >= 0 ? (
                    <span className="seat-picker__seat">{format(text.seat, { n: at + 1 })}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
          {player ? (
            <li>
              <button
                type="button"
                className="seat-picker__option seat-picker__option--clear"
                onClick={() => onPick(null)}
              >
                <Icon name="x" size={16} />
                <span>{text.clearSeat}</span>
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}
