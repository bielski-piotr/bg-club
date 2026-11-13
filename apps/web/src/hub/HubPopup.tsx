import { ClubPopup } from '../club/ClubPopup';
import { AddMemberPopup } from '../members/AddMemberPopup';
import { MembersPopup } from '../members/MembersPopup';
import { InvalidPopup } from '../popups/InvalidPopup';
import type { PopupRoute } from '../popups/routes';
import type { OwnProfile } from '../auth/useOwnProfile';
import { PasswordPopup } from '../profile/PasswordPopup';
import { ProfilePopup } from '../profile/ProfilePopup';
import { SettingsPopup } from '../profile/SettingsPopup';

interface HubPopupProps {
  readonly route: PopupRoute;
  readonly me: OwnProfile;
}

/** Popup dla adresu `?p=…` (`routes.ts`). Kolejne zadania dopisują tu swoje popupy. */
export function HubPopup({ route, me }: HubPopupProps) {
  switch (route.kind) {
    case 'members':
      return <MembersPopup isAdmin={me.role === 'admin'} />;
    case 'add-member':
      // Członków dodaje tylko administrator (MEM-3); bazę i tak chroni Edge Function (403).
      return me.role === 'admin' ? <AddMemberPopup /> : <InvalidPopup />;
    case 'profile':
      return <ProfilePopup id={route.id} />;
    case 'settings':
      // Ustawienia dotyczą zawsze zalogowanego: cudzych nie da się otworzyć (USR-7).
      return <SettingsPopup me={me} />;
    case 'change-password':
      return <PasswordPopup me={me} variant="change" />;
    case 'first-login':
      return <PasswordPopup me={me} variant="first" />;
    case 'club':
      // Formularz klubu jest tylko dla administratora (CLUB-2); gracz z linku go nie zobaczy.
      return me.role === 'admin' ? <ClubPopup /> : <InvalidPopup />;
    case 'invalid':
      return <InvalidPopup />;
  }
}
