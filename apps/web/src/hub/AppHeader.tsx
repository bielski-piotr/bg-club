import { useAuth } from '../auth/authContext';
import { ClubLogo } from '../club/ClubLogo';
import { format, t } from '../i18n';
import { usePopups } from '../popups/popupContext';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import { fullName, type Profile } from '../profile/profiles';
import { IconButton, Menu, Skeleton } from '../ui';
import { cx } from '../ui/cx';
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
 * formularz klubu (CLUB-2), chip użytkownika po prawej. Chip otwiera menu awatara (CLUB-1):
 * własny profil, ustawienia i wylogowanie.
 */
export function AppHeader({ club, me }: AppHeaderProps) {
  const user = <UserMenu me={me} />;

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

function UserMenu({ me }: { readonly me: Profile }) {
  const { signOut } = useAuth();
  const { open } = usePopups();
  const text = t.avatarMenu;
  return (
    <Menu
      label={text.label}
      align="end"
      items={[
        {
          id: 'profile',
          label: text.profile,
          icon: 'user',
          onSelect: () => open({ kind: 'profile', id: me.id }),
        },
        {
          id: 'settings',
          label: text.settings,
          icon: 'settings',
          onSelect: () => open({ kind: 'settings' }),
        },
        {
          id: 'sign-out',
          label: text.signOut,
          icon: 'logout',
          // Wylogowanie lokalne usuwa sesję także bez sieci (AuthProvider).
          onSelect: () => void signOut(),
        },
      ]}
      trigger={(props, isOpen) => (
        <button
          type="button"
          {...props}
          className={cx('app-header__user', isOpen && 'app-header__user--open')}
          aria-label={format(text.trigger, { name: fullName(me) })}
          title={fullName(me)}
        >
          <ProfileAvatar profile={me} size={38} decorative />
        </button>
      )}
    />
  );
}
