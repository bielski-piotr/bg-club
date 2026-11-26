import { t } from '../i18n';
import type { PopupRoute } from '../popups/routes';
import type { MenuItem } from '../solid/ui';
import type { Meeting } from './meetings';
import type { MeetingOverview } from './overview';

/**
 * Usunięcie: nie trwające i bez zapisanych partii (PLAN-3, PLAN-5, Q4). Zakończone dopiero
 * po wczytaniu liczby partii.
 */
export function canDelete(meeting: Meeting, overview: MeetingOverview | null | undefined): boolean {
  if (meeting.status === 'planned') return true;
  return meeting.status === 'finished' && overview?.playCount === 0;
}

/**
 * Pozycja menu: otwiera popup (`route`) albo, dla `reopen`, od razu otwiera głosowanie
 * ponownie (VOTE-6, bez potwierdzenia, jak w polu akcji).
 */
export type MeetingMenuItem = Omit<MenuItem, 'onSelect'> &
  ({ readonly route: PopupRoute } | { readonly route?: undefined; readonly reopen: true });

/**
 * Menu spotkania (DS §15 „Meeting menus”). Administrator: zaplanowane „Edytuj spotkanie”,
 * „Otwórz głosowanie ponownie” (po publikacji gier) i „Usuń spotkanie”; w trakcie „Dodaj uczestnika” i „Zmień prowadzącego” (PLAN-4, oba
 * w formularzu edycji); zakończone „Otwórz spotkanie ponownie” (RUN-5), a bez partii także „Usuń spotkanie”. Prowadzący: tylko „Zakończ
 * spotkanie” w trakcie (Q14), bez edycji uczestników i prowadzącego.
 */
export function menuItems(
  meeting: Meeting,
  overview: MeetingOverview | null | undefined,
  isAdmin: boolean,
  runner: boolean,
): MeetingMenuItem[] {
  const menu = t.meetings.menu;
  const edit: PopupRoute = { kind: 'edit-meeting', id: meeting.id };
  const items: MeetingMenuItem[] = [];
  if (isAdmin && meeting.status === 'planned') {
    items.push({ id: 'edit', label: menu.edit, icon: 'pencil', route: edit });
    if (!meeting.voting_open) {
      items.push({ id: 'reopen', label: menu.reopen, icon: 'refresh', reopen: true });
    }
  }
  if (isAdmin && meeting.status === 'in_progress') {
    items.push(
      { id: 'add-participant', label: menu.addParticipant, icon: 'user-plus', route: edit },
      { id: 'change-host', label: menu.changeHost, icon: 'user', route: edit },
    );
  }
  if (isAdmin && meeting.status === 'finished') {
    items.push({
      id: 'reopen-meeting',
      label: menu.reopenMeeting,
      icon: 'refresh',
      route: { kind: 'reopen-meeting', id: meeting.id },
    });
  }
  if (!isAdmin && runner && meeting.status === 'in_progress') {
    items.push({
      id: 'finish',
      label: menu.finish,
      icon: 'flag',
      route: { kind: 'finish-meeting', id: meeting.id },
    });
  }
  if (isAdmin && canDelete(meeting, overview)) {
    items.push({
      id: 'delete',
      label: menu.delete,
      icon: 'trash',
      destructive: true,
      route: { kind: 'delete-meeting', id: meeting.id },
    });
  }
  return items;
}
