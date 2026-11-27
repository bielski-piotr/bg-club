import { Show, useContext } from 'solid-js';
import { format, t } from '../i18n';
import { fullName, type Profile } from '../profile/profileQueries';
import { AuthContext } from '../auth/authContext';
import { PopupsContext } from '../popups/popupContext';
import { isPlainClick } from '../popups/PopupLink';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import { Menu, Nav } from '../ui';

interface AppHeaderProps {
  /** Before the club is set up: only the user chip, without the bar and navigation. */
  readonly bare: boolean;
  readonly me: Profile;
}

/**
 * App header: the app name and logo on the left, the main navigation and the user chip on the
 * right. The chip opens the avatar menu: own profile, settings and sign-out.
 */
export function AppHeader(props: AppHeaderProps) {
  const popups = useContext(PopupsContext);
  return (
    <Show
      when={!props.bare}
      fallback={
        <header class="app-header app-header--bare">
          <UserMenu me={props.me} />
        </header>
      }
    >
      <header class="app-header">
        <div class="app-header__brand">
          {/* The favicon is precached by the service worker, so the logo shows on first paint. */}
          <img class="app-header__logo" src="/favicon.svg" width="32" height="32" alt="" />
          <span class="app-header__name">{t.app.name}</span>
        </div>
        {/* Club is the only view so far; Meetings and Games are placeholders until their pages exist. */}
        <Nav
          label={t.nav.label}
          class="app-header__nav"
          items={[
            {
              id: 'club',
              label: t.nav.club,
              icon: 'home',
              href: '/',
              current: popups.page.kind === 'club',
              onClick: (event) => {
                if (!isPlainClick(event)) return;
                event.preventDefault();
                popups.navigate({ kind: 'club' });
              },
            },
            { id: 'meetings', label: t.nav.meetings, icon: 'calendar' },
            { id: 'games', label: t.nav.games, icon: 'meeple' },
          ]}
        />
        <UserMenu me={props.me} />
      </header>
    </Show>
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
          onSelect: () => popups.navigate({ kind: 'profile', id: props.me.id }),
        },
        {
          id: 'settings',
          label: text.settings,
          icon: 'settings',
          onSelect: () => popups.navigate({ kind: 'settings' }),
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
