import { useAuth } from '../auth/authContext';
import { format, plural, t } from '../i18n';
import { usePopups } from '../popups/popupContext';
import { PopupLink } from '../popups/PopupLink';
import { ProfileLink } from '../profile/ProfileLink';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import { fullName, useMembers, type Profile } from '../profile/profiles';
import { visibleMembers } from './members';
import { GameCover } from '../games/GameCover';
import { useCollectionWidget } from '../games/games';
import { playersLabel } from '../games/labels';
import { Banner, Button, Card, EmptyState, Icon, Skeleton, Spinner, Tray } from '../ui';

/*
 * Widżety huba (PRD §4, DS §6, §17). Spotkanie, Ranking i Timeline mają na razie tylko puste
 * stany (CLUB-4); treść i CTA dla admina dochodzą w zadaniach [014], [023]–[026]. Kolekcja
 * (GAME-1) i Członkowie (MEM-1) pokazują już prawdziwe dane.
 */

export function MeetingWidget() {
  return (
    <Card title={t.hub.meeting.title}>
      <EmptyState
        icon="calendar"
        title={t.hub.meeting.emptyTitle}
        helper={t.hub.meeting.emptyHelper}
      />
    </Card>
  );
}

export function RankingWidget() {
  return (
    <Card title={t.hub.ranking.title}>
      <EmptyState
        icon="trophy"
        title={t.hub.ranking.emptyTitle}
        helper={t.hub.ranking.emptyHelper}
      />
    </Card>
  );
}

export function TimelineWidget() {
  return (
    <Card title={t.hub.timeline.title}>
      <EmptyState
        icon="clock"
        title={t.hub.timeline.emptyTitle}
        helper={t.hub.timeline.emptyHelper}
      />
    </Card>
  );
}

/**
 * Widżet kolekcji (GAME-1, DS §6 „Collection”): kilka gier w kolejności Q11 (ostatnio grane,
 * potem ostatnio dodane). Pierwsza ma dużą okładkę, kolejne są wierszami tacy z miniaturą.
 * „Zobacz więcej” otwiera popup kolekcji; pusty stan administratora ma „Dodaj grę” (CLUB-4).
 */
export function CollectionWidget({ isAdmin }: { readonly isAdmin: boolean }) {
  const { client } = useAuth();
  const { open } = usePopups();
  const collection = useCollectionWidget(client);
  const data = collection.data;
  const count = data ? plural(data.total, t.games.count) : undefined;
  const action =
    data && data.total > 0 ? (
      <PopupLink to={{ kind: 'games' }} className="text-link">
        <span>{t.ui.seeMore}</span>
        <Icon name="chevron-right" />
      </PopupLink>
    ) : undefined;
  const [featured, ...rest] = data?.games ?? [];

  return (
    <Card title={t.hub.collection.title} count={count} action={action}>
      {collection.isPending ? (
        <div className="collection-widget__loading">
          <Skeleton width={148} height={148} radius={18} />
          <Spinner label={t.hub.collection.loading} className="sr-only" />
        </div>
      ) : collection.isError ? (
        <Banner
          variant="error"
          className="collection-widget__error"
          action={
            <Button
              size="sm"
              variant="secondary"
              icon="refresh"
              onClick={() => void collection.refetch()}
            >
              {t.hub.retry}
            </Button>
          }
        >
          {t.hub.loadError}
        </Banner>
      ) : !featured ? (
        <EmptyState
          icon="dice"
          title={t.hub.collection.emptyTitle}
          helper={isAdmin ? t.hub.collection.emptyHelperAdmin : t.hub.collection.emptyHelper}
          action={
            isAdmin ? (
              <Button icon="plus" fullWidth onClick={() => open({ kind: 'add-game' })}>
                {t.hub.collection.add}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="collection-widget">
          <PopupLink to={{ kind: 'games' }} className="collection-widget__featured">
            <GameCover
              id={featured.id}
              title={featured.title}
              coverPath={featured.cover_path}
              size="large"
              className="collection-widget__cover"
            />
            <span className="collection-widget__text">
              <span className="collection-widget__title">{featured.title}</span>
              <span className="collection-widget__meta">{playersLabel(featured)}</span>
            </span>
          </PopupLink>
          {rest.length > 0 ? (
            <Tray label={t.hub.collection.listLabel}>
              {rest.map((game) => (
                <li key={game.id} className="tray__item">
                  <PopupLink
                    to={{ kind: 'games' }}
                    className="row row--54 row--interactive collection-widget__row"
                  >
                    <span className="row__leading">
                      <GameCover
                        id={game.id}
                        title={game.title}
                        coverPath={game.cover_path}
                        size="thumb"
                      />
                    </span>
                    <span className="row__text">
                      <span className="row__title">{game.title}</span>
                      <span className="row__meta">{playersLabel(game)}</span>
                    </span>
                    <Icon name="chevron-right" className="row__chevron" />
                  </PopupLink>
                </li>
              ))}
            </Tray>
          ) : null}
        </div>
      )}
    </Card>
  );
}

/**
 * Widżet członków (MEM-1, DS §6). Każdy awatar otwiera profil, licznik `+N` i „Zobacz więcej”
 * otwierają popup członków. Pusty stan administratora ma CTA „Dodaj członka” (MEM-3).
 */
export function MembersWidget({ me }: { readonly me: Profile }) {
  const { client } = useAuth();
  const { open } = usePopups();
  const isAdmin = me.role === 'admin';
  const members = useMembers(client);
  const list = members.data;
  const count = list ? plural(list.length, t.hub.members.count) : undefined;
  const others = list?.filter((member) => member.id !== me.id) ?? [];
  const action =
    list && others.length > 0 ? (
      <PopupLink to={{ kind: 'members' }} className="text-link">
        <span>{t.ui.seeMore}</span>
        <Icon name="chevron-right" />
      </PopupLink>
    ) : undefined;

  return (
    <Card title={t.hub.members.title} count={count} action={action}>
      {members.isPending ? (
        <div className="members-widget__loading">
          <Skeleton width={240} height={56} radius={999} />
          <Spinner label={t.hub.members.loading} className="sr-only" />
        </div>
      ) : members.isError ? (
        <Banner
          variant="error"
          className="members-widget__error"
          action={
            <Button
              size="sm"
              variant="secondary"
              icon="refresh"
              onClick={() => void members.refetch()}
            >
              {t.hub.retry}
            </Button>
          }
        >
          {t.hub.loadError}
        </Banner>
      ) : others.length === 0 ? (
        <EmptyState
          lead={
            <ProfileLink id={me.id} name={fullName(me)}>
              <ProfileAvatar profile={me} size={56} decorative />
            </ProfileLink>
          }
          title={t.hub.members.emptyTitle}
          helper={isAdmin ? t.hub.members.emptyHelperAdmin : t.hub.members.emptyHelper}
          action={
            isAdmin ? (
              <Button icon="plus" fullWidth onClick={() => open({ kind: 'add-member' })}>
                {t.hub.members.add}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <MembersStack members={list ?? []} />
      )}
    </Card>
  );
}

function MembersStack({ members }: { readonly members: readonly Profile[] }) {
  const { shown, rest } = visibleMembers(members);
  const names = shown.map((member) => member.first_name);
  const total = plural(members.length, t.hub.members.count);
  return (
    <div className="members-widget">
      <ul className="members-widget__stack">
        {shown.map((member) => (
          <li key={member.id} className="members-widget__item">
            <ProfileLink id={member.id} name={fullName(member)}>
              <ProfileAvatar profile={member} size={64} decorative className="members-avatar" />
            </ProfileLink>
          </li>
        ))}
        {rest > 0 ? (
          <li className="members-widget__item">
            <PopupLink
              to={{ kind: 'members' }}
              className="members-widget__more tnum"
              aria-label={format(t.hub.members.moreLink, { count: total })}
            >
              +{rest}
            </PopupLink>
          </li>
        ) : null}
      </ul>
      <p className="members-widget__caption">
        <span className="members-widget__names">
          {rest > 0 || names.length < 2
            ? names.join(', ')
            : `${names.slice(0, -1).join(', ')} ${t.hub.members.and} ${names.at(-1) ?? ''}`}
        </span>
        {rest > 0 ? ` ${plural(rest, t.hub.members.others)}` : null}
      </p>
    </div>
  );
}
