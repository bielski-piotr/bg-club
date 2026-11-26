/** @jsxImportSource @solidjs/web */
import { Show, useContext } from 'solid-js';
import { t } from '../i18n';
import { PopupsContext } from '../solid/context';
import { Button } from '../solid/ui';
import { FirstRunIllustration } from './FirstRunIllustration';
import './club.css';

/**
 * Pierwsze uruchomienie na pustej bazie (CLUB-1, CLUB-3, DS §17): zamiast widżetów ilustracja,
 * powitanie i dla administratora przycisk „Dodaj klub”. Gracz widzi tę samą ilustrację bez
 * przycisku. Tytuł jest nagłówkiem strony (nagłówek aplikacji nie ma jeszcze nazwy klubu).
 */
export function FirstRun(props: { readonly isAdmin: boolean }) {
  const popups = useContext(PopupsContext);
  const text = t.club.firstRun;
  return (
    <div class="first-run">
      <FirstRunIllustration class="first-run__art" />
      <h1 class="first-run__title">{props.isAdmin ? text.adminTitle : text.playerTitle}</h1>
      <p class="first-run__text">{props.isAdmin ? text.adminText : text.playerText}</p>
      <Show when={props.isAdmin}>
        <div class="first-run__action">
          <Button icon="plus" onClick={() => popups.open({ kind: 'club' })}>
            {text.add}
          </Button>
        </div>
      </Show>
    </div>
  );
}
