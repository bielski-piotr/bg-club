import { useDeferredValue, useState } from 'react';
import { useAuth } from '../auth/authContext';
import { format, plural, t } from '../i18n';
import { usePopups } from '../popups/popupContext';
import { PopupLink } from '../popups/PopupLink';
import { PopupModal } from '../popups/PopupModal';
import { QueryStatus } from '../popups/QueryStatus';
import { avatarPerson, fullName, useMembers } from '../profile/profiles';
import { Avatar, Badge, Button, EmptyState, Icon, SearchField, Tray } from '../ui';
import { filterMembers } from './search';
import './members.css';

/**
 * Popup członków (PRD MEM-2): aktywni członkowie z hookiem i oznaczeniem admina, wyszukiwanie
 * po imieniu, nazwisku i hooku (bez polskich znaków). Wiersz otwiera profil nad tym popupem
 * (stos). Administrator ma w nagłówku „Dodaj członka” (MEM-3).
 */
export function MembersPopup({ isAdmin }: { readonly isAdmin: boolean }) {
  const { client, state } = useAuth();
  const { open } = usePopups();
  const members = useMembers(client);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const ownId = state.status === 'signedIn' ? state.session.user.id : null;
  const count = members.data ? plural(members.data.length, t.hub.members.count) : undefined;
  const shown = members.data ? filterMembers(members.data, deferredQuery) : [];
  const searching = deferredQuery.trim() !== '';

  const actions = isAdmin ? (
    // Na telefonie krótka etykieta „Dodaj” (DS §7); nazwa dostępna jest zawsze pełna.
    <Button
      size="sm"
      icon="plus"
      aria-label={t.membersPopup.add}
      onClick={() => open({ kind: 'add-member' })}
    >
      <span className="members-add__long">{t.membersPopup.add}</span>
      <span className="members-add__short">{t.membersPopup.addShort}</span>
    </Button>
  ) : undefined;

  return (
    <PopupModal title={t.membersPopup.title} count={count} actions={actions}>
      {members.isSuccess ? (
        <>
          <SearchField
            label={t.membersPopup.searchLabel}
            placeholder={t.membersPopup.searchPlaceholder}
            value={query}
            onValueChange={setQuery}
            className="members-search"
          />
          <p className="sr-only" role="status">
            {searching ? plural(shown.length, t.membersPopup.results) : ''}
          </p>
          {shown.length > 0 ? (
            <Tray label={t.membersPopup.listLabel} className="members-list">
              {shown.map((member) => (
                <li key={member.id} className="tray__item">
                  <PopupLink
                    to={{ kind: 'profile', id: member.id }}
                    className="row row--64 row--interactive member-row"
                  >
                    <Avatar {...avatarPerson(member)} size={40} decorative />
                    <span className="row__text">
                      <span className="row__title">{fullName(member)}</span>
                      <span className="row__meta member-row__hook">{member.hook}</span>
                    </span>
                    <span className="row__trailing">
                      {member.role === 'admin' ? (
                        <Badge tone="accent">{t.ui.adminBadge}</Badge>
                      ) : null}
                      {member.id === ownId ? <Badge tone="ink">{t.ui.youBadge}</Badge> : null}
                    </span>
                    <Icon name="chevron-right" className="row__chevron" />
                  </PopupLink>
                </li>
              ))}
            </Tray>
          ) : (
            <div className="members-list">
              <EmptyState
                icon="search"
                title={format(t.membersPopup.noResultsTitle, { query: deferredQuery.trim() })}
                helper={t.membersPopup.noResultsHelper}
              />
            </div>
          )}
        </>
      ) : (
        <QueryStatus isError={members.isError} onRetry={() => void members.refetch()} />
      )}
    </PopupModal>
  );
}
