import { format, t } from '../i18n';
import { ProfileLink } from '../profile/ProfileLink';
import { avatarPerson, fullName, type Profile } from '../profile/profiles';
import { Avatar, monogram } from '../ui';
import type { Club } from './club';

interface AppHeaderProps {
  /** `null` = klub jeszcze nie założony (zadanie [008]); wtedy nazwa aplikacji. */
  readonly club: Club | null;
  readonly me: Profile;
}

/**
 * Nagłówek huba (DS §17): logo i nazwa klubu po lewej, chip użytkownika po prawej. Chip
 * otwiera własny profil (PRD §4). Ołówek edycji klubu i menu awatara: zadania [008], [010].
 */
export function AppHeader({ club, me }: AppHeaderProps) {
  const name = club?.name ?? t.app.name;
  return (
    <header className="app-header">
      <div className="app-header__club">
        <span className="app-header__logo" aria-hidden="true">
          {monogram(name)}
        </span>
        <h1 className="app-header__name">{name}</h1>
      </div>
      <ProfileLink
        id={me.id}
        name={fullName(me)}
        className="app-header__user"
        label={format(t.hub.yourProfile, { name: fullName(me) })}
      >
        <Avatar {...avatarPerson(me)} size={38} decorative />
      </ProfileLink>
    </header>
  );
}
