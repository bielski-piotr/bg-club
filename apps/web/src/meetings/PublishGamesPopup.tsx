import {
  action,
  createMemo,
  createOptimistic,
  createSignal,
  For,
  Match,
  Show,
  Switch,
  useContext,
} from 'solid-js';
import type { OwnProfile } from '../auth/ownProfile';
import { createGameSearch } from '../games/gameData';
import { GameCover } from '../games/GameCover';
import { format, plural, t } from '../i18n';
import { AuthContext } from '../auth/authContext';
import { PopupsContext } from '../popups/popupContext';
import { QueryClientContext } from '../lib/queryClient';
import { ToastContext } from '../ui/toastContext';
import { createMounted } from '../popups/leaveGuard';
import { PopupModal } from '../popups/PopupModal';
import { QueryBoundary } from '../popups/QueryStatus';
import {
  Badge,
  Banner,
  Button,
  Checkbox,
  EmptyState,
  normalizeSearch,
  SearchField,
  Tray,
} from '../ui';
import { createMeeting, createMeetingVotes, createPublishedGames } from './meetingData';
import { meetingsKey } from './meetings';
import {
  countLabel,
  mismatchLabel,
  publishGames,
  voteRows,
  votesLabel,
  VotingError,
} from './voting';
import './meetings.css';

const text = t.meetings.publish;
const voting = t.meetings.voting;

/**
 * „Opublikuj gry” (VOTE-5, DS §15 „Publish-games row”): administrator zaznacza dowolne gry
 * z kolekcji (także bez głosów), a zapis zamyka głosowanie w jednej transakcji z publikacją.
 * Jedno okno na wczytywanie, formularz i stan „nie da się opublikować”.
 */
export function PublishGamesPopup(props: { readonly id: string; readonly me: OwnProfile }) {
  const auth = useContext(AuthContext);
  const queryClient = useContext(QueryClientContext);
  const toast = useContext(ToastContext);
  const popups = useContext(PopupsContext);
  const mounted = createMounted();
  const meeting = createMeeting(() => props.id);
  const games = createGameSearch(() => '');
  const votes = createMeetingVotes(() => props.id);
  const published = createPublishedGames(() => props.id);
  // Stopka i lista czytają dane z cache bez czekania; treść okna czeka pod `<QueryBoundary>`.
  const loaded = () =>
    [meeting, games, votes, published].every((query) => query.current() !== undefined);
  // Formularz tylko dla zaplanowanego spotkania; inaczej komunikat zamiast formularza.
  const current = () => {
    const data = meeting.current();
    return loaded() && data && data.status === 'planned' ? data : undefined;
  };
  /** Spotkanie do formularza w treści: czeka na wszystkie zapytania formularza. */
  const form = createMemo(() => {
    const data = meeting();
    const ready = [games(), votes(), published()].every((each) => each !== undefined);
    return ready && data && data.status === 'planned' ? data : undefined;
  });

  // Po zamknięciu głosowania formularz zaczyna od obecnej listy (ponowna publikacja ją zastąpi).
  // Niedostępnych gier nie da się opublikować: odpadają z obecnej listy. Wybór startuje
  // z pierwszych wczytanych danych: odświeżenie w tle go nie nadpisuje.
  let first: readonly string[] | undefined;
  const initial = createMemo(() => {
    if (first) return first;
    const list = games.current();
    const chosen = published.current();
    if (!current() || !list || !chosen) return undefined;
    first = chosen
      .map((game) => game.id)
      .filter((gameId) => list.some((game) => game.id === gameId && game.available));
    return first;
  });
  const [selected, setSelected] = createSignal<readonly string[]>(() => initial() ?? []);
  const [query, setQuery] = createSignal('');

  // Kolejność listy „Gramy w:” jak na liście głosowania (najwięcej głosów pierwsze).
  const allRows = createMemo(() => {
    const target = current();
    const list = games.current();
    const cast = votes.current();
    if (!target || !list || !cast) return [];
    return voteRows(list, cast, {
      me: props.me.id,
      participants: target.participants.length,
    });
  });
  const rows = createMemo(() => {
    const normalized = normalizeSearch(query());
    return normalized === ''
      ? allRows()
      : allRows().filter((row) => normalizeSearch(row.game.title).includes(normalized));
  });
  const ordered = createMemo(() =>
    allRows()
      .filter((row) => row.available)
      .map((row) => row.game.id)
      .filter((gameId) => selected().includes(gameId)),
  );

  const [done, setDone] = createSignal(false);
  // Wysłanie optymistycznie od kliknięcia do wyniku: po sukcesie zostaje (`done`), po błędzie
  // wraca. Zapis w toku = wysłane, ale jeszcze bez wyniku.
  const [sent, setSent] = createOptimistic(() => done());
  const publishing = () => sent() && !done();
  const [failure, setFailure] = createSignal<string | null>(null);
  const publish = action(function* (gameIds: readonly string[]) {
    setSent(true);
    setFailure(null);
    try {
      yield publishGames(auth.client, props.id, gameIds);
      setDone(true);
      toast.show(t.meetings.toasts.published, 'success');
      if (mounted()) popups.back();
    } catch (error) {
      setFailure(error instanceof VotingError ? voting.errors[error.reason] : voting.errors.save);
    }
    yield queryClient.invalidateQueries({ queryKey: meetingsKey });
  });
  const searching = () => query().trim() !== '';
  const hasGames = () => (games.current()?.length ?? 0) > 0;

  return (
    <PopupModal
      title={text.title}
      footer={
        <Show when={current()}>
          <Button variant="secondary" disabled={publishing()} onClick={() => popups.back()}>
            {text.cancel}
          </Button>
          <Button
            loading={publishing()}
            disabled={ordered().length === 0 || done()}
            onClick={() => void publish(ordered())}
          >
            {text.submit}
          </Button>
        </Show>
      }
    >
      <QueryBoundary>
        <Show
          when={form()}
          fallback={
            <p class="meeting-form__state">
              {meeting() ? voting.errors.notPlanned : t.meetings.popup.notFoundBody}
            </p>
          }
        >
          {(target) => (
            <div class="meeting-view">
              <p class="meeting-form__state">{text.intro}</p>
              <Show when={!target().voting_open}>
                <Banner variant="info">{text.closedNote}</Banner>
              </Show>
              <Show when={failure()}>
                {(message) => <Banner variant="error">{message()}</Banner>}
              </Show>
              <p class="publish-count" aria-live="polite">
                {countLabel(ordered().length, text.selected)}
              </p>
              <Show when={hasGames()}>
                <SearchField
                  label={voting.searchLabel}
                  placeholder={voting.searchPlaceholder}
                  value={query()}
                  onValueChange={setQuery}
                />
              </Show>
              <p class="sr-only" role="status">
                {searching() ? plural(rows().length, voting.results) : ''}
              </p>
              <Show
                when={rows().length > 0}
                fallback={
                  <EmptyState
                    icon={searching() ? 'search' : 'dice'}
                    title={
                      searching()
                        ? format(voting.noResultsTitle, { query: query().trim() })
                        : voting.emptyTitle
                    }
                    helper={searching() ? voting.noResultsHelper : voting.emptyHelper}
                  />
                }
              >
                <Tray label={text.listLabel} class="vote-list">
                  <For each={rows()} keyed={(row) => row.game.id}>
                    {(row) => (
                      <li class="tray__item">
                        <Checkbox
                          class="row row--64 publish-row"
                          checked={row().available && selected().includes(row().game.id)}
                          disabled={!row().available}
                          onCheckedChange={(checked) => {
                            const gameId = row().game.id;
                            setSelected((list) =>
                              checked ? [...list, gameId] : list.filter((each) => each !== gameId),
                            );
                          }}
                          label={
                            <span class="publish-row__body">
                              <GameCover
                                id={row().game.id}
                                title={row().game.title}
                                coverPath={row().game.cover_path}
                                size="thumb"
                                unavailable={!row().available}
                              />
                              <span class="vote-row__body">
                                <span class="vote-row__name">{row().game.title}</span>
                                <span class="vote-row__meta">
                                  <span>{votesLabel(row().voters.length)}</span>
                                  <Switch>
                                    <Match when={!row().available}>
                                      <Badge tone="neutral">{voting.unavailable}</Badge>
                                    </Match>
                                    <Match when={!row().fits}>
                                      <Badge tone="warning">{mismatchLabel(row().game)}</Badge>
                                    </Match>
                                  </Switch>
                                </span>
                              </span>
                              <span
                                class={
                                  row().voters.length === 0
                                    ? 'publish-row__count publish-row__count--zero'
                                    : 'publish-row__count'
                                }
                                aria-hidden="true"
                              >
                                {row().voters.length}
                              </span>
                            </span>
                          }
                        />
                      </li>
                    )}
                  </For>
                </Tray>
              </Show>
            </div>
          )}
        </Show>
      </QueryBoundary>
    </PopupModal>
  );
}
