import { useAuth } from '../auth/authContext';
import { ClubLogo } from '../club/ClubLogo';
import { format, t } from '../i18n';
import { usePopups } from '../popups/popupContext';
import { ProfileLink } from '../profile/ProfileLink';
import { avatarPerson, fullName, type Profile } from '../profile/profiles';
import { Avatar, IconButton, Skeleton } from '../ui';
import { useCoverUrl, type Club } from './club';

interface AppHeaderProps {
  /**
   * Klub do pokazania. `null` = błąd wczytania (nazwa aplikacji zamiast nazwy klubu),
   * `undefined` = wczytywanie (szkielet, żeby nie mignęła nazwa aplikacji),
   * `'none'` = klub jeszcze nie założony: sam chip użytkownika, bez paska (CLUB-1, DS §17).
   */
  readonly club: Club | null | undefined | 'none';
  readonly me: Profile;
}

/**
 * Nagłówek huba (DS §17): logo i nazwa klubu po lewej, dla admina ołówek otwierający
 * formularz klubu (CLUB-2), chip użytkownika po prawej. Chip otwiera własny profil (PRD §4).
 * Menu awatara: zadanie [010].
 */
export function AppHeader({ club, me }: AppHeaderProps) {
  const user = (
    <ProfileLink
      id={me.id}
      name={fullName(me)}
      className="app-header__user"
      label={format(t.hub.yourProfile, { name: fullName(me) })}
    >
      <Avatar {...avatarPerson(me)} size={38} decorative />
    </ProfileLink>
  );

  if (club === 'none') {
    return <header className="app-header app-header--bare">{user}</header>;
  }

  return (
    <header className="app-header">
      <div className="app-header__club">
        {club === undefined ? (
          <>
            <Skeleton width={36} height={36} radius={12} />
            <h1 className="app-header__name">
              <Skeleton width={140} height={18} />
              <span className="sr-only">{t.ui.loading}</span>
            </h1>
          </>
        ) : (
          <ClubIdentity club={club} isAdmin={me.role === 'admin'} />
        )}
      </div>
      {user}
    </header>
  );
}

function ClubIdentity({
  club,
  isAdmin,
}: {
  readonly club: Club | null;
  readonly isAdmin: boolean;
}) {
  const { client } = useAuth();
  const { open } = usePopups();
  const logo = useCoverUrl(client, club?.logo_path ?? null);
  const name = club?.name ?? t.app.name;
  return (
    <>
      <ClubLogo name={name} src={logo.data} size={36} />
      <h1 className="app-header__name">{name}</h1>
      {club && isAdmin ? (
        <IconButton
          icon="pencil"
          size={32}
          label={t.club.edit}
          className="app-header__edit"
          onClick={() => open({ kind: 'club' })}
        />
      ) : null}
    </>
  );
}
