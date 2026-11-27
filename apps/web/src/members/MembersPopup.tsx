import { createMemo, createSignal, For, Show, useContext } from 'solid-js';
import { format, plural, t } from '../i18n';
import { fullName } from '../profile/profileQueries';
import { AuthContext } from '../auth/authContext';
import { PopupsContext } from '../popups/popupContext';
import { PageLink } from '../popups/PageLink';
import { PopupModal } from '../popups/PopupModal';
import { QueryBoundary } from '../popups/QueryStatus';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import { createMembers } from '../profile/profiles';
import { Badge, Button, createChunks, EmptyState, Icon, SearchField, ShowMore, Tray } from '../ui';
import { filterMembers } from './search';
import './members.css';

/**
 * Popup członków: aktywni członkowie z hookiem i oznaczeniem admina, wyszukiwanie
 * po imieniu, nazwisku i hooku (bez polskich znaków). Wiersz otwiera stronę profilu. Administrator ma w nagłówku „Dodaj członka”.
 */
export function MembersPopup(props: { readonly isAdmin: boolean }) {
  const auth = useContext(AuthContext);
  const popups = useContext(PopupsContext);
  const members = createMembers();
  const [query, setQuery] = createSignal('');
  const ownId = () => (auth.state.status === 'signedIn' ? auth.state.session.user.id : null);
  /** Lista po wyszukiwaniu: czeka na dane pod `<QueryBoundary>`. */
  const shown = createMemo(() => filterMembers(members(), query()));
  const searching = () => query().trim() !== '';
  const chunks = createChunks(shown, query);
  const count = () => {
    const list = members.current();
    return list ? plural(list.length, t.hub.members.count) : undefined;
  };

  return (
    <PopupModal
      title={t.membersPopup.title}
      count={count()}
      actions={
        <Show when={props.isAdmin}>
          {/* Na telefonie krótka etykieta „Dodaj”; nazwa dostępna jest zawsze pełna. */}
          <Button
            size="sm"
            icon="plus"
            aria-label={t.membersPopup.add}
            onClick={() => popups.open({ kind: 'add-member' })}
          >
            <span class="members-add__long">{t.membersPopup.add}</span>
            <span class="members-add__short">{t.membersPopup.addShort}</span>
          </Button>
        </Show>
      }
    >
      <QueryBoundary>
        <SearchField
          label={t.membersPopup.searchLabel}
          placeholder={t.membersPopup.searchPlaceholder}
          value={query()}
          onValueChange={setQuery}
          class="members-search"
        />
        <p class="sr-only" role="status">
          {searching() ? plural(shown().length, t.membersPopup.results) : ''}
        </p>
        <Show
          when={shown().length > 0}
          fallback={
            <div class="members-list">
              <EmptyState
                icon="search"
                title={
                  searching()
                    ? format(t.membersPopup.noResultsTitle, { query: query().trim() })
                    : t.membersPopup.emptyTitle
                }
                helper={searching() ? t.membersPopup.noResultsHelper : undefined}
              />
            </div>
          }
        >
          <Tray label={t.membersPopup.listLabel} class="members-list">
            <For each={chunks.visible()} keyed={(member) => member.id}>
              {(member, index) => (
                <li class="tray__item" data-chunk-start={chunks.chunkStart(index())}>
                  <PageLink
                    to={{ kind: 'profile', id: member().id }}
                    class="row row--64 row--interactive member-row"
                  >
                    <ProfileAvatar profile={member()} size={40} decorative />
                    <span class="row__text">
                      <span class="row__title">{fullName(member())}</span>
                      <span class="row__meta member-row__hook">{member().hook}</span>
                    </span>
                    <span class="row__trailing">
                      <Show when={member().role === 'admin'}>
                        <Badge tone="accent">{t.ui.adminBadge}</Badge>
                      </Show>
                      <Show when={member().id === ownId()}>
                        <Badge tone="ink">{t.ui.youBadge}</Badge>
                      </Show>
                    </span>
                    <Icon name="chevron-right" class="row__chevron" />
                  </PageLink>
                </li>
              )}
            </For>
          </Tray>
          <ShowMore hidden={chunks.hidden()} onClick={chunks.showMore} />
        </Show>
      </QueryBoundary>
    </PopupModal>
  );
}
