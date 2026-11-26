import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '../auth/authContext';
import type { OwnProfile } from '../auth/useOwnProfile';
import { GameCover } from '../react-shared/GameCover';
import { useGameSearch } from '../react-shared/games';
import { format, plural, t } from '../i18n';
import { usePopups } from '../popups/popupContext';
import { PopupModal } from '../popups/PopupModal';
import { QueryStatus } from '../popups/QueryStatus';
import { useMounted } from '../popups/useMounted';
import {
  Badge,
  Banner,
  Button,
  Checkbox,
  EmptyState,
  normalizeSearch,
  SearchField,
  Tray,
  useToast,
} from '../ui';
import { meetingsKey, useMeeting, type Meeting } from './meetings';
import {
  countLabel,
  mismatchLabel,
  publishGames,
  useMeetingVotes,
  usePublishedGames,
  voteRows,
  votesLabel,
  VotingError,
  type PublishedGame,
  type Vote,
} from './voting';
import './meetings.css';

const text = t.meetings.publish;
const voting = t.meetings.voting;

/**
 * „Opublikuj gry” (VOTE-5, DS §15 „Publish-games row”): administrator zaznacza dowolne gry
 * z kolekcji (także bez głosów), a zapis zamyka głosowanie w jednej transakcji z publikacją.
 */
export function PublishGamesPopup({ id, me }: { readonly id: string; readonly me: OwnProfile }) {
  const { client } = useAuth();
  const meeting = useMeeting(client, id);
  const games = useGameSearch(client, '');
  const votes = useMeetingVotes(client, id);
  const published = usePublishedGames(client, id);
  const queries = [meeting, games, votes, published] as const;
  if (!meeting.isSuccess || !games.isSuccess || !votes.isSuccess || !published.isSuccess) {
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
  if (!current || current.status !== 'planned') {
    return (
      <PopupModal title={text.title}>
        <p className="meeting-form__state">
          {current ? voting.errors.notPlanned : t.meetings.popup.notFoundBody}
        </p>
      </PopupModal>
    );
  }
  return (
    <PublishForm
      meeting={current}
      me={me}
      games={games.data}
      votes={votes.data}
      published={published.data}
    />
  );
}

interface FormProps {
  readonly meeting: Meeting;
  readonly me: OwnProfile;
  readonly games: NonNullable<ReturnType<typeof useGameSearch>['data']>;
  readonly votes: readonly Vote[];
  readonly published: readonly PublishedGame[];
}

function PublishForm({ meeting, me, games, votes, published }: FormProps) {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { back } = usePopups();
  const mounted = useMounted();
  // Po zamknięciu głosowania formularz zaczyna od obecnej listy (ponowna publikacja ją zastąpi).
  // Niedostępnych gier nie da się opublikować: odpadają z obecnej listy.
  const [selected, setSelected] = useState<readonly string[]>(() =>
    published
      .map((game) => game.id)
      .filter((gameId) => games.some((game) => game.id === gameId && game.available)),
  );
  const [query, setQuery] = useState('');
  // Kolejność listy „Gramy w:” jak na liście głosowania (najwięcej głosów pierwsze).
  const allRows = voteRows(games, votes, {
    me: me.id,
    participants: meeting.participants.length,
  });
  const normalized = normalizeSearch(query);
  const rows =
    normalized === ''
      ? allRows
      : allRows.filter((row) => normalizeSearch(row.game.title).includes(normalized));
  const ordered = allRows
    .filter((row) => row.available)
    .map((row) => row.game.id)
    .filter((gameId) => selected.includes(gameId));

  const publish = useMutation({
    mutationFn: () => publishGames(client, meeting.id, ordered),
    onSuccess: () => {
      toast.show(t.meetings.toasts.published, 'success');
      if (mounted.current) back();
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: meetingsKey }),
  });
  const failure =
    publish.error instanceof VotingError ? voting.errors[publish.error.reason] : voting.errors.save;
  const searching = query.trim() !== '';

  return (
    <PopupModal
      title={text.title}
      footer={
        <>
          <Button variant="secondary" disabled={publish.isPending} onClick={back}>
            {text.cancel}
          </Button>
          <Button
            loading={publish.isPending}
            disabled={ordered.length === 0 || publish.isSuccess}
            onClick={() => publish.mutate()}
          >
            {text.submit}
          </Button>
        </>
      }
    >
      <div className="meeting-view">
        <p className="meeting-form__state">{text.intro}</p>
        {!meeting.voting_open ? <Banner variant="info">{text.closedNote}</Banner> : null}
        {publish.isError ? <Banner variant="error">{failure}</Banner> : null}
        <p className="publish-count" aria-live="polite">
          {countLabel(ordered.length, text.selected)}
        </p>
        {games.length > 0 ? (
          <SearchField
            label={voting.searchLabel}
            placeholder={voting.searchPlaceholder}
            value={query}
            onValueChange={setQuery}
          />
        ) : null}
        <p className="sr-only" role="status">
          {searching ? plural(rows.length, voting.results) : ''}
        </p>
        {rows.length > 0 ? (
          <Tray label={text.listLabel} className="vote-list">
            {rows.map((row) => (
              <li key={row.game.id} className="tray__item">
                <Checkbox
                  className="row row--64 publish-row"
                  checked={row.available && selected.includes(row.game.id)}
                  disabled={!row.available}
                  onCheckedChange={(checked) =>
                    setSelected((current) =>
                      checked
                        ? [...current, row.game.id]
                        : current.filter((gameId) => gameId !== row.game.id),
                    )
                  }
                  label={
                    <span className="publish-row__body">
                      <GameCover
                        id={row.game.id}
                        title={row.game.title}
                        coverPath={row.game.cover_path}
                        size="thumb"
                        unavailable={!row.available}
                      />
                      <span className="vote-row__body">
                        <span className="vote-row__name">{row.game.title}</span>
                        <span className="vote-row__meta">
                          <span>{votesLabel(row.voters.length)}</span>
                          {!row.available ? (
                            <Badge tone="neutral">{voting.unavailable}</Badge>
                          ) : !row.fits ? (
                            <Badge tone="warning">{mismatchLabel(row.game)}</Badge>
                          ) : null}
                        </span>
                      </span>
                      <span
                        className={
                          row.voters.length === 0
                            ? 'publish-row__count publish-row__count--zero'
                            : 'publish-row__count'
                        }
                        aria-hidden="true"
                      >
                        {row.voters.length}
                      </span>
                    </span>
                  }
                />
              </li>
            ))}
          </Tray>
        ) : (
          <EmptyState
            icon={searching ? 'search' : 'dice'}
            title={
              searching ? format(voting.noResultsTitle, { query: query.trim() }) : voting.emptyTitle
            }
            helper={searching ? voting.noResultsHelper : voting.emptyHelper}
          />
        )}
      </div>
    </PopupModal>
  );
}
