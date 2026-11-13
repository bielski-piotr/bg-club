import { ClubPopup } from '../club/ClubPopup';
import { CollectionPopup } from '../games/CollectionPopup';
import { DeleteGameDialog } from '../games/DeleteGameDialog';
import { AddGamePopup, EditGamePopup } from '../games/GameFormPopup';
import { AddMemberPopup } from '../members/AddMemberPopup';
import { DeleteMemberDialog } from '../members/DeleteMemberDialog';
import { MembersPopup } from '../members/MembersPopup';
import { InvalidPopup } from '../popups/InvalidPopup';
import type { PopupRoute } from '../popups/routes';
import type { OwnProfile } from '../auth/useOwnProfile';
import { DeleteAccountDialog } from '../profile/DeleteAccountDialog';
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
      return <ProfilePopup id={route.id} isAdmin={me.role === 'admin'} />;
    case 'delete-member':
      // Członków usuwa tylko administrator (MEM-4); Edge Function i tak odrzuci gracza (403).
      return me.role === 'admin' ? <DeleteMemberDialog id={route.id} /> : <InvalidPopup />;
    case 'settings':
      // Ustawienia dotyczą zawsze zalogowanego: cudzych nie da się otworzyć (USR-7).
      return <SettingsPopup me={me} />;
    case 'change-password':
      return <PasswordPopup me={me} variant="change" />;
    case 'delete-account':
      // Administrator nie usuwa swojego konta i nie widzi tej opcji (USR-6).
      return me.role === 'admin' ? <InvalidPopup /> : <DeleteAccountDialog me={me} />;
    case 'first-login':
      return <PasswordPopup me={me} variant="first" />;
    case 'club':
      // Formularz klubu jest tylko dla administratora (CLUB-2); gracz z linku go nie zobaczy.
      return me.role === 'admin' ? <ClubPopup /> : <InvalidPopup />;
    case 'games':
      return <CollectionPopup isAdmin={me.role === 'admin'} />;
    case 'add-game':
      // Gry dodaje, edytuje i usuwa tylko administrator (GAME-3); bazę chroni RLS.
      return me.role === 'admin' ? <AddGamePopup /> : <InvalidPopup />;
    case 'edit-game':
      return me.role === 'admin' ? <EditGamePopup id={route.id} /> : <InvalidPopup />;
    case 'delete-game':
      return me.role === 'admin' ? <DeleteGameDialog id={route.id} /> : <InvalidPopup />;
    case 'invalid':
      return <InvalidPopup />;
  }
}
