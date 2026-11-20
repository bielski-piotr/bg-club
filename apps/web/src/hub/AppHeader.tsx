import type { JSX } from '@solidjs/web';
import { ClubLogo } from '../club/ClubLogo';
import { format, t } from '../i18n';
import type { Club } from '../model/club';
import { fullName, type Member } from '../model/member';
import { Avatar, Menu } from '../ui';

interface AppHeaderProps {
  readonly club: Club;
  readonly me: Member;
  readonly onOpenProfile?: (() => void) | undefined;
  readonly onOpenSettings?: (() => void) | undefined;
  readonly onSignOut?: (() => void) | undefined;
}

/**
 * Nagłówek huba bez paska: logo i nazwa klubu po lewej, chip użytkownika po prawej.
 * Chip otwiera menu konta: własny profil, ustawienia i wylogowanie.
 */
export function AppHeader(props: AppHeaderProps): JSX.Element {
  const text = t.avatarMenu;
  return (
    <header class="app-header">
      <div class="app-header__club">
        <ClubLogo name={props.club.name} src={props.club.logoUrl} size={56} />
        <h1 class="app-header__name">{props.club.name}</h1>
      </div>
      <Menu
        label={text.label}
        align="end"
        items={[
          {
            id: 'profile',
            label: text.profile,
            icon: 'user',
            onSelect: () => props.onOpenProfile?.(),
          },
          {
            id: 'settings',
            label: text.settings,
            icon: 'settings',
            onSelect: () => props.onOpenSettings?.(),
          },
          {
            id: 'sign-out',
            label: text.signOut,
            icon: 'logout',
            onSelect: () => props.onSignOut?.(),
          },
        ]}
        trigger={(trigger) => (
          <button
            type="button"
            {...trigger}
            class="app-header__user"
            aria-label={format(text.trigger, { name: fullName(props.me) })}
            title={fullName(props.me)}
          >
            <Avatar
              name={fullName(props.me)}
              colorKey={props.me.hook}
              src={props.me.avatarUrl}
              size={38}
              decorative
            />
          </button>
        )}
      />
    </header>
  );
}
