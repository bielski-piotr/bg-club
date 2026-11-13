import { useAuth } from '../auth/authContext';
import { plural, t } from '../i18n';
import { PopupLink } from '../popups/PopupLink';
import { PopupModal } from '../popups/PopupModal';
import { QueryStatus } from '../popups/QueryStatus';
import { avatarPerson, fullName, useMembers } from '../profile/profiles';
import { Avatar, Badge, Icon, Tray } from '../ui';
import './members.css';

/**
 * Popup członków (PRD MEM-2): aktywni członkowie z hookiem i oznaczeniem admina. Wiersz
 * otwiera profil nad tym popupem (stos). Wyszukiwanie i „Dodaj członka”: zadanie [009].
 */
export function MembersPopup() {
  const { client, state } = useAuth();
  const members = useMembers(client);
  const ownId = state.status === 'signedIn' ? state.session.user.id : null;
  const count = members.data ? plural(members.data.length, t.hub.members.count) : undefined;

  return (
    <PopupModal title={t.membersPopup.title} count={count}>
      {members.isSuccess ? (
        <Tray label={t.membersPopup.listLabel}>
          {members.data.map((member) => {
            return (
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
            );
          })}
        </Tray>
      ) : (
        <QueryStatus isError={members.isError} onRetry={() => void members.refetch()} />
      )}
    </PopupModal>
  );
}
