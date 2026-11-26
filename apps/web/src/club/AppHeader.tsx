/** @jsxImportSource @solidjs/web */
import { Show, useContext } from 'solid-js';
import { format, t } from '../i18n';
import { fullName, type Profile } from '../profile/profileQueries';
import { createCoverUrl } from '../solid/club';
import { AuthContext, PopupsContext } from '../solid/context';
import { ProfileAvatar } from '../solid/profile/ProfileAvatar';
import { IconButton, Menu, Skeleton } from '../solid/ui';
import type { Club } from './club';
import { ClubLogo } from './ClubLogo';

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
              <>
                <Skeleton width={36} height={36} radius={12} />
                <h1 class="app-header__name">
                  <Skeleton width={140} height={18} />
                  <span class="sr-only">{t.ui.loading}</span>
                </h1>
              </>
            }
          >
            <ClubIdentity club={shown()} isAdmin={props.me.role === 'admin'} />
          </Show>
        </div>
        <UserMenu me={props.me} />
      </header>
    </Show>
  );
}

function ClubIdentity(props: { readonly club: Club | null; readonly isAdmin: boolean }) {
  const popups = useContext(PopupsContext);
  const logo = createCoverUrl(() => props.club?.logo_path ?? null);
  const name = () => props.club?.name ?? t.app.name;
  return (
    <>
      <ClubLogo name={name()} src={logo().data} size={36} />
      <h1 class="app-header__name">{name()}</h1>
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
