import { ClubPopup } from '../club/ClubPopup';
import { MembersPopup } from '../members/MembersPopup';
import { InvalidPopup } from '../popups/InvalidPopup';
import type { PopupRoute } from '../popups/routes';
import type { Profile } from '../profile/profiles';
import { ProfilePopup } from '../profile/ProfilePopup';

interface HubPopupProps {
  readonly route: PopupRoute;
  readonly me: Profile;
}

/** Popup dla adresu `?p=…` (`routes.ts`). Kolejne zadania dopisują tu swoje popupy. */
export function HubPopup({ route, me }: HubPopupProps) {
  switch (route.kind) {
    case 'members':
      return <MembersPopup />;
    case 'profile':
      return <ProfilePopup id={route.id} />;
    case 'club':
      // Formularz klubu jest tylko dla administratora (CLUB-2); gracz z linku go nie zobaczy.
      return me.role === 'admin' ? <ClubPopup /> : <InvalidPopup />;
    case 'invalid':
      return <InvalidPopup />;
  }
}
