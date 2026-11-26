import { ClubPopup } from '../club/ClubPopup';
import { CollectionPopup } from '../games/CollectionPopup';
import { DeleteGameDialog } from '../games/DeleteGameDialog';
import { GameDetailsPopup } from '../games/GameDetailsPopup';
import { AddExpansionPopup, AddGamePopup, EditGamePopup } from '../games/GameFormPopup';
import { SolidIsland } from '../bridge/SolidIsland';
import { AddMemberPopup } from '../members/AddMemberPopup';
import { DeleteMemberDialog } from '../members/DeleteMemberDialog';
import { MembersPopup } from '../members/MembersPopup';
import { CalendarPopup } from '../meetings/CalendarPopup';
import { LeaderboardPopup } from '../leaderboard/LeaderboardPopup';
import { TiesPopup } from '../leaderboard/TiesPopup';
import { DeleteMeetingDialog } from '../meetings/DeleteMeetingDialog';
import { AddMeetingPopup, EditMeetingPopup } from '../meetings/MeetingFormPopup';
import { MeetingPopup } from '../meetings/MeetingPopup';
import { DeletePlayDialog } from '../meetings/DeletePlayDialog';
import { DiscardPlayDialog } from '../meetings/DiscardPlayDialog';
import { NewPlayPopup } from '../meetings/NewPlayPopup';
import { PlayPopup } from '../meetings/PlayPopup';
import { PublishGamesPopup } from '../meetings/PublishGamesPopup';
import {
  FinishMeetingDialog,
  ReopenMeetingDialog,
  StartMeetingDialog,
} from '../meetings/RunMeetingDialogs';
import { InvalidPopup } from '../popups/InvalidPopup';
import type { PopupRoute } from '../popups/routes';
import type { OwnProfile } from '../auth/useOwnProfile';
import { DeleteAccountDialog } from '../profile/DeleteAccountDialog';
import { PasswordPopup } from '../profile/PasswordPopup';
import { ProfilePopup } from '../profile/ProfilePopup';
import { SettingsPopup } from '../profile/SettingsPopup';
import { SheetPopup } from '../sheets/SheetPopup';
import {
  DeleteScorepadDialog,
  MoveScorepadPopup,
  RenameScorepadDialog,
} from '../score-pad/ScorepadDialogs';
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
      // Obszar Członkowie jest w Solid 2.0 (docs/solidjs-2-migration.md, etap 2).
      return <SolidIsland component={MembersPopup} props={{ isAdmin: me.role === 'admin' }} />;
    case 'add-member':
      // Członków dodaje tylko administrator (MEM-3); bazę i tak chroni Edge Function (403).
      return me.role === 'admin' ? (
        <SolidIsland component={AddMemberPopup} props={{}} />
      ) : (
        <InvalidPopup />
      );
    case 'profile':
      return (
        <SolidIsland
          component={ProfilePopup}
          props={{ id: route.id, isAdmin: me.role === 'admin' }}
        />
      );
    case 'delete-member':
      // Członków usuwa tylko administrator (MEM-4); Edge Function i tak odrzuci gracza (403).
      return me.role === 'admin' ? (
        <SolidIsland component={DeleteMemberDialog} props={{ id: route.id }} />
      ) : (
        <InvalidPopup />
      );
    case 'settings':
      // Ustawienia dotyczą zawsze zalogowanego: cudzych nie da się otworzyć (USR-7).
      return <SolidIsland component={SettingsPopup} props={{ me }} />;
    case 'change-password':
      return <SolidIsland component={PasswordPopup} props={{ me, variant: 'change' }} />;
    case 'delete-account':
      // Administrator nie usuwa swojego konta i nie widzi tej opcji (USR-6).
      return me.role === 'admin' ? (
        <InvalidPopup />
      ) : (
        <SolidIsland component={DeleteAccountDialog} props={{ me }} />
      );
    case 'first-login':
      return <SolidIsland component={PasswordPopup} props={{ me, variant: 'first' }} />;
    case 'club':
      // Formularz klubu jest tylko dla administratora (CLUB-2); gracz z linku go nie zobaczy.
      // Klub i nagłówek są w Solid 2.0 (docs/solidjs-2-migration.md, etap 7).
      return me.role === 'admin' ? (
        <SolidIsland component={ClubPopup} props={{}} />
      ) : (
        <InvalidPopup />
      );
    case 'games':
      // Kolekcja, gry i karteczki są w Solid 2.0 (docs/solidjs-2-migration.md, etap 5a).
      return <SolidIsland component={CollectionPopup} props={{ isAdmin: me.role === 'admin' }} />;
    case 'game':
      return (
        <SolidIsland
          component={GameDetailsPopup}
          props={{ id: route.id, isAdmin: me.role === 'admin' }}
        />
      );
    case 'sheet':
      return (
        <SolidIsland
          component={SheetPopup}
          props={{ id: route.id, isAdmin: me.role === 'admin' }}
        />
      );
    case 'add-game':
      // Gry dodaje, edytuje i usuwa tylko administrator (GAME-3); bazę chroni RLS.
      return me.role === 'admin' ? (
        <SolidIsland component={AddGamePopup} props={{}} />
      ) : (
        <InvalidPopup />
      );
    case 'add-expansion':
      // Dodatki dodaje tylko administrator (jak gry); bazę chroni RLS.
      return me.role === 'admin' ? (
        <SolidIsland component={AddExpansionPopup} props={{ baseId: route.baseId }} />
      ) : (
        <InvalidPopup />
      );
    case 'edit-game':
      return me.role === 'admin' ? (
        <SolidIsland component={EditGamePopup} props={{ id: route.id }} />
      ) : (
        <InvalidPopup />
      );
    case 'delete-game':
      return me.role === 'admin' ? (
        <SolidIsland component={DeleteGameDialog} props={{ id: route.id }} />
      ) : (
        <InvalidPopup />
      );
    case 'scorepads':
      // Notesy są w Solid 2.0 (docs/solidjs-2-migration.md, etap 5b).
      return (
        <SolidIsland
          component={ScorepadsPopup}
          props={{ gameId: route.gameId, isAdmin: me.role === 'admin' }}
        />
      );
    case 'add-scorepad':
      // Notesy dodaje, zmienia i usuwa tylko administrator (GAME-7); bazę chroni RLS i RPC.
      return me.role === 'admin' ? (
        <SolidIsland component={AddScorepadPopup} props={{ gameId: route.gameId }} />
      ) : (
        <InvalidPopup />
      );
    case 'edit-scorepad':
      return me.role === 'admin' ? (
        <SolidIsland component={EditScorepadPopup} props={{ id: route.id }} />
      ) : (
        <InvalidPopup />
      );
    case 'rename-scorepad':
      return me.role === 'admin' ? (
        <SolidIsland component={RenameScorepadDialog} props={{ id: route.id }} />
      ) : (
        <InvalidPopup />
      );
    case 'move-scorepad':
      return me.role === 'admin' ? (
        <SolidIsland component={MoveScorepadPopup} props={{ id: route.id }} />
      ) : (
        <InvalidPopup />
      );
    case 'delete-scorepad':
      return me.role === 'admin' ? (
        <SolidIsland component={DeleteScorepadDialog} props={{ id: route.id }} />
      ) : (
        <InvalidPopup />
      );
    case 'meeting':
      // Spotkania i Timeline są w Solid 2.0 (docs/solidjs-2-migration.md, etap 6).
      return <SolidIsland component={MeetingPopup} props={{ id: route.id, me }} />;
    case 'calendar':
      // Gracz widzi ten sam kalendarz bez „Zaplanuj” i bez podpowiedzi (DS §15.1).
      return <SolidIsland component={CalendarPopup} props={{ isAdmin: me.role === 'admin' }} />;
    case 'leaderboard':
      // Obszar Ranking jest w Solid 2.0 (docs/solidjs-2-migration.md, etap 4).
      return (
        <SolidIsland
          component={LeaderboardPopup}
          props={{ me, tab: route.tab, filters: route.filters }}
        />
      );
    case 'leaderboard-ties':
      return (
        <SolidIsland component={TiesPopup} props={{ me, tab: route.tab, filters: route.filters }} />
      );
    case 'add-meeting':
      // Spotkania planuje, edytuje i usuwa tylko administrator (PLAN-1, §2.1); bazę chroni RPC.
      return me.role === 'admin' ? (
        <SolidIsland component={AddMeetingPopup} props={{ me, date: route.date }} />
      ) : (
        <InvalidPopup />
      );
    case 'publish-games':
      // Gry publikuje tylko administrator (VOTE-5, §2.1); bazę chroni RPC.
      return me.role === 'admin' ? (
        <SolidIsland component={PublishGamesPopup} props={{ id: route.id, me }} />
      ) : (
        <InvalidPopup />
      );
    case 'edit-meeting':
      return me.role === 'admin' ? (
        <SolidIsland component={EditMeetingPopup} props={{ id: route.id, me }} />
      ) : (
        <InvalidPopup />
      );
    case 'delete-meeting':
      return me.role === 'admin' ? (
        <SolidIsland component={DeleteMeetingDialog} props={{ id: route.id }} />
      ) : (
        <InvalidPopup />
      );
    case 'start-meeting':
      // Admin albo prowadzący (RUN-1, §2.1); dialog sam sprawdza rolę, bazę chroni RPC.
      return <SolidIsland component={StartMeetingDialog} props={{ id: route.id, me }} />;
    case 'finish-meeting':
      return <SolidIsland component={FinishMeetingDialog} props={{ id: route.id, me }} />;
    case 'reopen-meeting':
      return me.role === 'admin' ? (
        <SolidIsland component={ReopenMeetingDialog} props={{ id: route.id }} />
      ) : (
        <InvalidPopup />
      );
    case 'new-play':
      // Admin albo prowadzący spotkania w trakcie (RUN-2, PAD-9); popup sprawdza rolę i status,
      // bazę chroni RPC start_play.
      return <SolidIsland component={NewPlayPopup} props={{ meetingId: route.meetingId, me }} />;
    case 'play':
      // Notes tylko dla admina i prowadzącego trwającego spotkania, inni widzą „Trwa partia”
      // (PAD-9); popup sprawdza rolę i status, bazę chroni RPC save_play_draft.
      return <SolidIsland component={PlayPopup} props={{ id: route.id, me }} />;
    case 'discard-play':
      return <SolidIsland component={DiscardPlayDialog} props={{ id: route.id, me }} />;
    case 'delete-play':
      // Tylko admin (VIEW-6); bazę chroni RPC delete_play.
      return me.role === 'admin' ? (
        <SolidIsland component={DeletePlayDialog} props={{ id: route.id }} />
      ) : (
        <InvalidPopup />
      );
    case 'invalid':
      return <InvalidPopup />;
  }
}
