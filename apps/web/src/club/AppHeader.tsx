import { Show, useContext } from 'solid-js';
import { format, t } from '../i18n';
import { fullName, type Profile } from '../profile/profileQueries';
import { AuthContext } from '../auth/authContext';
import { PopupsContext } from '../popups/popupContext';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import { IconButton, Menu, Skeleton } from '../ui';
import type { Club } from './club';

interface AppHeaderProps {
  /**
   * Klub do pokazania. `null` = błąd wczytania (nazwa aplikacji zamiast nazwy klubu),
   * `undefined` = wczytywanie (szkielet, żeby nie mignęła nazwa aplikacji),
   * `'none'` = klub jeszcze nie założony: sam chip użytkownika, bez paska.
   */
  readonly club: Club | null | undefined | 'none';
  readonly me: Profile;
}

/**
 * App header: the club name on the left (with a pencil opening the club form for admins),
 * the main navigation and the user chip on the right. The chip opens the avatar menu:
 * own profile, settings and sign-out.
 */
export function AppHeader(props: AppHeaderProps) {
  /** Klub albo `null` (błąd) poza wczytywaniem i pustą bazą. */
  const shown = (): Club | null =>
    props.club === undefined || props.club === 'none' ? null : props.club;
  return (
    <Show
      when={props.club !== 'none'}
      fallback={
        <header class="app-header app-header--bare">
          <UserMenu me={props.me} />
        </header>
      }
    >
      <header class="app-header">
        <div class="app-header__club">
          <Show
            when={props.club !== undefined}
            fallback={
              <h1 class="app-header__name">
                <Skeleton width={140} height={18} />
                <span class="sr-only">{t.ui.loading}</span>
              </h1>
            }
          >
            <ClubIdentity club={shown()} isAdmin={props.me.role === 'admin'} />
          </Show>
        </div>
        <MainNav />
        <UserMenu me={props.me} />
      </header>
    </Show>
  );
}

function ClubIdentity(props: { readonly club: Club | null; readonly isAdmin: boolean }) {
  const popups = useContext(PopupsContext);
  return (
    <>
      <h1 class="app-header__name">{props.club?.name ?? t.app.name}</h1>
      <Show when={props.club && props.isAdmin}>
        <IconButton
          icon="pencil"
          size={32}
          label={t.club.edit}
          class="app-header__edit"
          onClick={() => popups.open({ kind: 'club' })}
        />
      </Show>
    </>
  );
}

/** Club is the only view so far; Meetings and Games are placeholders until their pages exist. */
function MainNav() {
  return (
    <nav class="app-nav" aria-label={t.nav.label}>
      <a class="app-nav__link" href="/" aria-current="page">
        {t.nav.club}
      </a>
      <a class="app-nav__link">{t.nav.meetings}</a>
      <a class="app-nav__link">{t.nav.games}</a>
    </nav>
  );
}

function UserMenu(props: { readonly me: Profile }) {
  const auth = useContext(AuthContext);
  const popups = useContext(PopupsContext);
  const text = t.avatarMenu;
  const name = () => fullName(props.me);
  return (
    <Menu
      label={text.label}
      align="end"
      items={[
        {
          id: 'profile',
          label: text.profile,
          icon: 'user',
          onSelect: () => popups.open({ kind: 'profile', id: props.me.id }),
        },
        {
          id: 'settings',
          label: text.settings,
          icon: 'settings',
          onSelect: () => popups.open({ kind: 'settings' }),
        },
        {
          id: 'sign-out',
          label: text.signOut,
          icon: 'logout',
          // Wylogowanie lokalne usuwa sesję także bez sieci (AuthProvider).
          onSelect: () => void auth.signOut(),
        },
      ]}
      trigger={(trigger, open) => (
        <button
          type="button"
          {...trigger}
          class={['app-header__user', { 'app-header__user--open': open() }]}
          aria-label={format(text.trigger, { name: name() })}
          title={name()}
        >
          <ProfileAvatar profile={props.me} size={38} decorative />
        </button>
      )}
    />
  );
}
