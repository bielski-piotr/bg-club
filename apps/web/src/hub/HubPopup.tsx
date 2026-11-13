import { MembersPopup } from '../members/MembersPopup';
import { InvalidPopup } from '../popups/InvalidPopup';
import type { PopupRoute } from '../popups/routes';
import { ProfilePopup } from '../profile/ProfilePopup';

/** Popup dla adresu `?p=…` (`routes.ts`). Kolejne zadania dopisują tu swoje popupy. */
export function HubPopup({ route }: { readonly route: PopupRoute }) {
  switch (route.kind) {
    case 'members':
      return <MembersPopup />;
    case 'profile':
      return <ProfilePopup id={route.id} />;
    case 'invalid':
      return <InvalidPopup />;
  }
}
