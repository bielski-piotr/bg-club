/** @jsxImportSource @solidjs/web */
import type { JSX } from '@solidjs/web';
import { format, t } from '../../i18n';
import { PopupLink } from '../popups/PopupLink';
import type { ClassValue } from '../ui/dom';
import '../../profile/profile.css';

interface ProfileLinkProps {
  readonly id: string;
  /** Imię i nazwisko: etykieta linku dla czytnika ekranu. */
  readonly name: string;
  /** Własna etykieta zamiast „Otwórz profil: …”. */
  readonly label?: string | undefined;
  readonly children: JSX.Element;
  readonly class?: ClassValue;
  readonly style?: JSX.CSSProperties | undefined;
}

/**
 * Awatar gracza jako link do jego profilu (PRD §4: kliknięcie awatara w dowolnym miejscu
 * otwiera profil). Awatar w środku powinien być `decorative`, bo etykietę ma link.
 */
export function ProfileLink(props: ProfileLinkProps) {
  return (
    <PopupLink
      to={{ kind: 'profile', id: props.id }}
      class={['profile-link', props.class]}
      style={props.style}
      aria-label={props.label ?? format(t.membersPopup.openProfile, { name: props.name })}
      title={props.name}
    >
      {props.children}
    </PopupLink>
  );
}
