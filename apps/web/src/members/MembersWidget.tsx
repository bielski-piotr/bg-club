/** @jsxImportSource @solidjs/web */
import { createMemo, For, Match, Show, Switch, useContext } from 'solid-js';
import { visibleMembers } from '../hub/members';
import { format, plural, t } from '../i18n';
import { fullName, type Profile } from '../profile/profileQueries';
import { PopupsContext } from '../solid/context';
import { PopupLink } from '../solid/popups/PopupLink';
import { ProfileAvatar } from '../solid/profile/ProfileAvatar';
import { ProfileLink } from '../solid/profile/ProfileLink';
import { createMembers } from '../solid/profile/profiles';
import { Banner, Button, Card, EmptyState, Icon, Skeleton, Spinner } from '../solid/ui';

/**
 * Widżet Członkowie (MEM-1, DS §6 „Widget members”): awatary członków prowadzące do profili,
 * przy ponad 5 osobach cztery i licznik „+N” otwierający listę. Bez innych członków pusty stan
 * z awatarem zalogowanego i, dla administratora, „Dodaj członka” (CLUB-4, MEM-3).
 */
export function MembersWidget(props: { readonly me: Profile }) {
  const popups = useContext(PopupsContext);
  const members = createMembers();
  const others = createMemo(
    () => members().data?.filter((member) => member.id !== props.me.id) ?? [],
  );
  const count = () => {
    const list = members().data;
    return list ? plural(list.length, t.hub.members.count) : undefined;
  };
  const isAdmin = () => props.me.role === 'admin';

  return (
    <Card
      title={t.hub.members.title}
      count={count()}
      action={
        <Show when={members().data && others().length > 0}>
          <PopupLink to={{ kind: 'members' }} class="text-link">
            <span>{t.ui.seeMore}</span>
            <Icon name="chevron-right" />
          </PopupLink>
        </Show>
      }
    >
      <Switch fallback={<MembersStack members={members().data ?? []} />}>
        <Match when={members().isPending}>
          <div class="members-widget__loading">
            <Skeleton width={240} height={56} radius={999} />
            <Spinner label={t.hub.members.loading} class="sr-only" />
          </div>
        </Match>
        <Match when={members().isError}>
          <Banner
            variant="error"
            class="members-widget__error"
            action={
              <Button
                size="sm"
                variant="secondary"
                icon="refresh"
                onClick={() => void members().refetch()}
              >
                {t.hub.retry}
              </Button>
            }
          >
            {t.hub.loadError}
          </Banner>
        </Match>
        <Match when={others().length === 0}>
          <EmptyState
            lead={
              <ProfileLink id={props.me.id} name={fullName(props.me)}>
                <ProfileAvatar profile={props.me} size={56} decorative />
              </ProfileLink>
            }
            title={t.hub.members.emptyTitle}
            helper={isAdmin() ? t.hub.members.emptyHelperAdmin : t.hub.members.emptyHelper}
            action={
              <Show when={isAdmin()}>
                <Button icon="plus" fullWidth onClick={() => popups.open({ kind: 'add-member' })}>
                  {t.hub.members.add}
                </Button>
              </Show>
            }
          />
        </Match>
      </Switch>
    </Card>
  );
}

function MembersStack(props: { readonly members: readonly Profile[] }) {
  const view = createMemo(() => {
    const { shown, rest } = visibleMembers(props.members);
    const names = shown.map((member) => member.first_name);
    return {
      shown,
      rest,
      total: plural(props.members.length, t.hub.members.count),
      names:
        rest > 0 || names.length < 2
          ? names.join(', ')
          : `${names.slice(0, -1).join(', ')} ${t.hub.members.and} ${names.at(-1) ?? ''}`,
    };
  });
  return (
    <div class="members-widget">
      <ul class="members-widget__stack">
        <For each={view().shown} keyed={(member) => member.id}>
          {(member) => (
            <li class="members-widget__item">
              <ProfileLink id={member().id} name={fullName(member())}>
                <ProfileAvatar profile={member()} size={64} decorative class="members-avatar" />
              </ProfileLink>
            </li>
          )}
        </For>
        <Show when={view().rest > 0}>
          <li class="members-widget__item">
            <PopupLink
              to={{ kind: 'members' }}
              class="members-widget__more tnum"
              aria-label={format(t.hub.members.moreLink, { count: view().total })}
            >
              +{view().rest}
            </PopupLink>
          </li>
        </Show>
      </ul>
      <p class="members-widget__caption">
        <span class="members-widget__names">{view().names}</span>
        {view().rest > 0 ? ` ${plural(view().rest, t.hub.members.others)}` : null}
      </p>
    </div>
  );
}
