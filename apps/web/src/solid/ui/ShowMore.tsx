/** @jsxImportSource @solidjs/web */
import { Show } from 'solid-js';
import { format, t } from '../../i18n';
import { Button } from './Button';
import '../../ui/Button.css';

/** Przycisk „Pokaż więcej” pod listą rysowaną porcjami; bez ukrytych pozycji nic nie rysuje. */
export function ShowMore(props: { readonly hidden: number; readonly onClick: () => void }) {
  return (
    <Show when={props.hidden > 0}>
      <p class="show-more">
        <Button variant="secondary" size="sm" onClick={() => props.onClick()}>
          {format(t.ui.showMore, { count: props.hidden })}
        </Button>
      </p>
    </Show>
  );
}
