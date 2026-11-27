import type { JSX } from '@solidjs/web';
import { Dynamic } from '@solidjs/web';
import { createMemo, Show } from 'solid-js';
import { ClubPopup } from '../club/ClubPopup';
import { CollectionPopup } from '../games/CollectionPopup';
import { DeleteGameDialog } from '../games/DeleteGameDialog';
import { GameDetailsPopup } from '../games/GameDetailsPopup';
import { AddExpansionPopup, AddGamePopup, EditGamePopup } from '../games/GameFormPopup';
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
import { showsAdminTools, type OwnProfile } from '../auth/ownProfile';
import { PasswordPopup } from '../profile/PasswordPopup';
import { SheetPopup } from '../sheets/SheetPopup';
import {
  DeleteScorepadDialog,
  MoveScorepadPopup,
  RenameScorepadDialog,
} from '../score-pad/ScorepadDialogs';
import { AddScorepadPopup, EditScorepadPopup } from '../score-pad/ScorepadEditorPopup';
import { ScorepadsPopup } from '../score-pad/ScorepadsPopup';

type RouteOf<K extends PopupRoute['kind']> = Extract<PopupRoute, { readonly kind: K }>;

interface ViewProps<R extends PopupRoute = PopupRoute> {
  readonly route: R;
  readonly me: OwnProfile;
}

const isAdmin = (me: OwnProfile) => showsAdminTools(me);

/** Treść tylko dla administratora; gracz z linku widzi „Nie znaleziono”. */
function AdminOnly(props: { readonly me: OwnProfile; readonly children: JSX.Element }) {
  return (
    <Show when={isAdmin(props.me)} fallback={<InvalidPopup />}>
      {props.children}
    </Show>
  );
}

/** Popup każdego rodzaju adresu `?p=…` (`routes.ts`). Propsy są reaktywne (`p.me`, `p.route`). */
const views: { readonly [K in PopupRoute['kind']]: (p: ViewProps<RouteOf<K>>) => JSX.Element } = {
  members: (p) => <MembersPopup isAdmin={isAdmin(p.me)} />,
  // Członków dodaje tylko administrator; bazę i tak chroni Edge Function (403).
  'add-member': (p) => (
    <AdminOnly me={p.me}>
      <AddMemberPopup />
    </AdminOnly>
  ),
  // Członków usuwa tylko administrator; Edge Function i tak odrzuci gracza (403).
  'delete-member': (p) => (
    <AdminOnly me={p.me}>
      <DeleteMemberDialog id={p.route.id} />
    </AdminOnly>
  ),
  'first-login': (p) => <PasswordPopup me={p.me} />,
  // Formularz klubu jest tylko dla administratora; gracz z linku go nie zobaczy.
  club: (p) => (
    <AdminOnly me={p.me}>
      <ClubPopup />
    </AdminOnly>
  ),
  games: (p) => <CollectionPopup isAdmin={isAdmin(p.me)} />,
  game: (p) => <GameDetailsPopup id={p.route.id} isAdmin={isAdmin(p.me)} />,
  sheet: (p) => <SheetPopup id={p.route.id} isAdmin={isAdmin(p.me)} />,
  // Gry dodaje, edytuje i usuwa tylko administrator; bazę chroni RLS.
  'add-game': (p) => (
    <AdminOnly me={p.me}>
      <AddGamePopup />
    </AdminOnly>
  ),
  // Dodatki dodaje tylko administrator (jak gry); bazę chroni RLS.
  'add-expansion': (p) => (
    <AdminOnly me={p.me}>
      <AddExpansionPopup baseId={p.route.baseId} />
    </AdminOnly>
  ),
  'edit-game': (p) => (
    <AdminOnly me={p.me}>
      <EditGamePopup id={p.route.id} />
    </AdminOnly>
  ),
  'delete-game': (p) => (
    <AdminOnly me={p.me}>
      <DeleteGameDialog id={p.route.id} />
    </AdminOnly>
  ),
  scorepads: (p) => <ScorepadsPopup gameId={p.route.gameId} isAdmin={isAdmin(p.me)} />,
  // Notesy dodaje, zmienia i usuwa tylko administrator; bazę chroni RLS i RPC.
  'add-scorepad': (p) => (
    <AdminOnly me={p.me}>
      <AddScorepadPopup gameId={p.route.gameId} />
    </AdminOnly>
  ),
  'edit-scorepad': (p) => (
    <AdminOnly me={p.me}>
      <EditScorepadPopup id={p.route.id} />
    </AdminOnly>
  ),
  'rename-scorepad': (p) => (
    <AdminOnly me={p.me}>
      <RenameScorepadDialog id={p.route.id} />
    </AdminOnly>
  ),
  'move-scorepad': (p) => (
    <AdminOnly me={p.me}>
      <MoveScorepadPopup id={p.route.id} />
    </AdminOnly>
  ),
  'delete-scorepad': (p) => (
    <AdminOnly me={p.me}>
      <DeleteScorepadDialog id={p.route.id} />
    </AdminOnly>
  ),
  meeting: (p) => <MeetingPopup id={p.route.id} me={p.me} />,
  // Gracz widzi ten sam kalendarz bez „Zaplanuj” i bez podpowiedzi.
  calendar: (p) => <CalendarPopup isAdmin={isAdmin(p.me)} />,
  leaderboard: (p) => <LeaderboardPopup me={p.me} tab={p.route.tab} filters={p.route.filters} />,
  'leaderboard-ties': (p) => <TiesPopup me={p.me} tab={p.route.tab} filters={p.route.filters} />,
  // Spotkania planuje, edytuje i usuwa tylko administrator; bazę chroni RPC.
  'add-meeting': (p) => (
    <AdminOnly me={p.me}>
      <AddMeetingPopup me={p.me} date={p.route.date} />
    </AdminOnly>
  ),
  // Gry publikuje tylko administrator; bazę chroni RPC.
  'publish-games': (p) => (
    <AdminOnly me={p.me}>
      <PublishGamesPopup id={p.route.id} me={p.me} />
    </AdminOnly>
  ),
  'edit-meeting': (p) => (
    <AdminOnly me={p.me}>
      <EditMeetingPopup id={p.route.id} me={p.me} />
    </AdminOnly>
  ),
  'delete-meeting': (p) => (
    <AdminOnly me={p.me}>
      <DeleteMeetingDialog id={p.route.id} />
    </AdminOnly>
  ),
  // Admin albo prowadzący; dialog sam sprawdza rolę, bazę chroni RPC.
  'start-meeting': (p) => <StartMeetingDialog id={p.route.id} me={p.me} />,
  'finish-meeting': (p) => <FinishMeetingDialog id={p.route.id} me={p.me} />,
  'reopen-meeting': (p) => (
    <AdminOnly me={p.me}>
      <ReopenMeetingDialog id={p.route.id} />
    </AdminOnly>
  ),
  // Admin albo prowadzący spotkania w trakcie; popup sprawdza rolę i status, bazę chroni RPC start_play.
  'new-play': (p) => <NewPlayPopup meetingId={p.route.meetingId} me={p.me} />,
  // Notes tylko dla admina i prowadzącego trwającego spotkania, inni widzą „Trwa partia”; popup sprawdza rolę i status, bazę chroni RPC save_play_draft.
  play: (p) => <PlayPopup id={p.route.id} me={p.me} />,
  'discard-play': (p) => <DiscardPlayDialog id={p.route.id} me={p.me} />,
  // Tylko admin; bazę chroni RPC delete_play.
  'delete-play': (p) => (
    <AdminOnly me={p.me}>
      <DeletePlayDialog id={p.route.id} />
    </AdminOnly>
  ),
  invalid: () => <InvalidPopup />,
};

/**
 * Popup dla adresu `?p=…`. Popup powstaje od nowa tylko przy zmianie rodzaju adresu: zmiana
 * profilu (`me`) nie gubi stanu otwartego formularza.
 */
export function HubPopup(props: ViewProps) {
  const view = createMemo(() => views[props.route.kind] as (p: ViewProps) => JSX.Element);
  return <Dynamic component={view()} route={props.route} me={props.me} />;
}
