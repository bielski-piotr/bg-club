import { ClubPopup } from '../club/ClubPopup';
import { CollectionPopup } from '../games/CollectionPopup';
import { DeleteGameDialog } from '../games/DeleteGameDialog';
import { AddGamePopup, EditGamePopup } from '../games/GameFormPopup';
import { AddMemberPopup } from '../members/AddMemberPopup';
import { DeleteMemberDialog } from '../members/DeleteMemberDialog';
import { MembersPopup } from '../members/MembersPopup';
import { CalendarPopup } from '../meetings/CalendarPopup';
import { DeleteMeetingDialog } from '../meetings/DeleteMeetingDialog';
import { AddMeetingPopup, EditMeetingPopup } from '../meetings/MeetingFormPopup';
import { MeetingPopup } from '../meetings/MeetingPopup';
import { NewPlayPopup } from '../meetings/NewPlayPopup';
import { PublishGamesPopup } from '../meetings/PublishGamesPopup';
import { FinishMeetingDialog, StartMeetingDialog } from '../meetings/RunMeetingDialogs';
import { InvalidPopup } from '../popups/InvalidPopup';
import type { PopupRoute } from '../popups/routes';
import type { OwnProfile } from '../auth/useOwnProfile';
import { DeleteAccountDialog } from '../profile/DeleteAccountDialog';
import { PasswordPopup } from '../profile/PasswordPopup';
import { ProfilePopup } from '../profile/ProfilePopup';
import { SettingsPopup } from '../profile/SettingsPopup';
import { DeleteScorepadDialog, RenameScorepadDialog } from '../score-pad/ScorepadDialogs';
import { AddScorepadPopup, EditScorepadPopup } from '../score-pad/ScorepadEditorPopup';
import { ScorepadsPopup } from '../score-pad/ScorepadsPopup';

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
    case 'scorepads':
      return <ScorepadsPopup gameId={route.gameId} isAdmin={me.role === 'admin'} />;
    case 'add-scorepad':
      // Notesy dodaje, zmienia i usuwa tylko administrator (GAME-7); bazę chroni RLS i RPC.
      return me.role === 'admin' ? <AddScorepadPopup gameId={route.gameId} /> : <InvalidPopup />;
    case 'edit-scorepad':
      return me.role === 'admin' ? <EditScorepadPopup id={route.id} /> : <InvalidPopup />;
    case 'rename-scorepad':
      return me.role === 'admin' ? <RenameScorepadDialog id={route.id} /> : <InvalidPopup />;
    case 'delete-scorepad':
      return me.role === 'admin' ? <DeleteScorepadDialog id={route.id} /> : <InvalidPopup />;
    case 'meeting':
      return <MeetingPopup id={route.id} me={me} />;
    case 'calendar':
      // Gracz widzi ten sam kalendarz bez „Zaplanuj” i bez podpowiedzi (DS §15.1).
      return <CalendarPopup isAdmin={me.role === 'admin'} />;
    case 'add-meeting':
      // Spotkania planuje, edytuje i usuwa tylko administrator (PLAN-1, §2.1); bazę chroni RPC.
      return me.role === 'admin' ? <AddMeetingPopup me={me} date={route.date} /> : <InvalidPopup />;
    case 'publish-games':
      // Gry publikuje tylko administrator (VOTE-5, §2.1); bazę chroni RPC.
      return me.role === 'admin' ? <PublishGamesPopup id={route.id} me={me} /> : <InvalidPopup />;
    case 'edit-meeting':
      return me.role === 'admin' ? <EditMeetingPopup id={route.id} me={me} /> : <InvalidPopup />;
    case 'delete-meeting':
      return me.role === 'admin' ? <DeleteMeetingDialog id={route.id} /> : <InvalidPopup />;
    case 'start-meeting':
      // Admin albo prowadzący (RUN-1, §2.1); dialog sam sprawdza rolę, bazę chroni RPC.
      return <StartMeetingDialog id={route.id} me={me} />;
    case 'finish-meeting':
      return <FinishMeetingDialog id={route.id} me={me} />;
    case 'new-play':
      // Admin albo prowadzący spotkania w trakcie (RUN-2, PAD-9); popup sprawdza rolę i status,
      // bazę chroni RPC start_play.
      return <NewPlayPopup meetingId={route.meetingId} me={me} />;
    case 'invalid':
      return <InvalidPopup />;
  }
}
