import type { CSSProperties, ReactNode } from 'react';
import { format, t } from '../i18n';
import { PopupLink } from '../popups/PopupLink';
import { cx } from '../ui/cx';
import './profile.css';

interface ProfileLinkProps {
  readonly id: string;
  /** Imię i nazwisko: etykieta linku dla czytnika ekranu. */
  readonly name: string;
  /** Własna etykieta zamiast „Otwórz profil: …”. */
  readonly label?: string | undefined;
  readonly children: ReactNode;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
}

/**
 * Awatar gracza jako link do jego profilu (PRD §4: kliknięcie awatara w dowolnym miejscu
 * otwiera profil). Awatar w środku powinien być `decorative`, bo etykietę ma link.
 */
export function ProfileLink({ id, name, label, children, className, style }: ProfileLinkProps) {
  return (
    <PopupLink
      to={{ kind: 'profile', id }}
      className={cx('profile-link', className)}
      style={style}
      aria-label={label ?? format(t.membersPopup.openProfile, { name })}
      title={name}
    >
      {children}
    </PopupLink>
  );
}
