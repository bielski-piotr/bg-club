import type { JSX } from '@solidjs/web';
import { omit, useContext } from 'solid-js';
import type { PopupRoute } from './routes';
import { PopupsContext } from './popupContext';
import { callHandler } from '../ui/dom';

/**
 * Kliknięcie linku do popupu: zwykłe kliknięcie otwiera popup w aplikacji, a kliknięcie
 * z Ctrl / Cmd / Shift / środkowym przyciskiem zostaje przeglądarce (nowa karta z tym adresem).
 */
export function isPlainClick(event: MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

export interface PopupLinkProps extends Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  /** Popup otwierany nad bieżącym stosem. */
  readonly to: PopupRoute;
}

/**
 * Link do popupu. To prawdziwy `<a href>` z adresem popupu, więc można go skopiować albo
 * otworzyć w nowej karcie; zwykłe kliknięcie otwiera popup bez przeładowania (PRD §4).
 */
export function PopupLink(props: PopupLinkProps) {
  const popups = useContext(PopupsContext);
  const rest = omit(props, 'to', 'onClick', 'children');
  const onClick = (event: MouseEvent) => {
    callHandler(props.onClick, event);
    if (!isPlainClick(event)) return;
    event.preventDefault();
    popups.open(props.to);
  };
  return (
    <a href={popups.hrefFor(props.to)} onClick={onClick} {...rest}>
      {props.children}
    </a>
  );
}
