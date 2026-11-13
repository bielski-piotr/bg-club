import { useAuth } from '../auth/authContext';
import { format, plural, t } from '../i18n';
import { usePopups } from '../popups/popupContext';
import { PopupLink } from '../popups/PopupLink';
import { ProfileLink } from '../profile/ProfileLink';
import { avatarPerson, fullName, useMembers, type Profile } from '../profile/profiles';
import { visibleMembers } from './members';
import { Avatar, Banner, Button, Card, EmptyState, Icon, Skeleton, Spinner } from '../ui';

/*
 * Widżety huba (PRD §4, DS §6, §17). Spotkanie, Ranking, Timeline i Kolekcja mają na razie
 * tylko puste stany (CLUB-4); treść i CTA dla admina dochodzą w zadaniach [012], [014],
 * [023]–[026]. Członkowie pokazują już prawdziwą listę (MEM-1).
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

export function CollectionWidget() {
  return (
    <Card title={t.hub.collection.title}>
      <EmptyState
        icon="dice"
        title={t.hub.collection.emptyTitle}
        helper={t.hub.collection.emptyHelper}
      />
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
              <Avatar {...avatarPerson(me)} size={56} decorative />
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
              <Avatar {...avatarPerson(member)} size={64} decorative className="members-avatar" />
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
