import { Show, useContext } from 'solid-js';
import { t } from '../i18n';
import { PopupsContext } from '../popups/popupContext';
import { IconButton } from '../ui';
import type { Club } from './club';
import { createCoverUrl } from './clubData';
import { ClubLogo } from './ClubLogo';

/**
 * Club logo and name on top of the Club view. The edit button lives here only until the club
 * page exists; it moves there then.
 */
export function ClubHeading(props: { readonly club: Club; readonly isAdmin: boolean }) {
  const popups = useContext(PopupsContext);
  const logo = createCoverUrl(() => props.club.logo_path);
  return (
    <div class="club-heading">
      <ClubLogo name={props.club.name} src={logo.current()} size={56} />
      <h1 class="club-heading__name">{props.club.name}</h1>
      <Show when={props.isAdmin}>
        <IconButton
          icon="pencil"
          size={32}
          label={t.club.edit}
          onClick={() => popups.open({ kind: 'club' })}
        />
      </Show>
    </div>
  );
}
