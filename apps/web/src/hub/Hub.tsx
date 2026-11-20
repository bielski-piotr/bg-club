import type { JSX } from '@solidjs/web';
import { getClub, getCurrentMember } from '../data';
import { t } from '../i18n';
import { AppHeader } from './AppHeader';
import './Hub.css';

/** Widok klubu: nagłówek i miejsce na widżety. */
export function Hub(): JSX.Element {
  const club = getClub();
  const me = getCurrentMember();
  return (
    <div class="hub">
      <AppHeader club={club} me={me} />
      <main id="hub-main" class="hub__main" tabindex="-1" aria-label={t.hub.mainLabel} />
    </div>
  );
}
