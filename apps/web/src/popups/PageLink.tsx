import type { JSX } from '@solidjs/web';
import { omit, useContext } from 'solid-js';
import { callHandler } from '../ui/dom';
import { PopupsContext } from './popupContext';
import { isPlainClick } from './PopupLink';
import { pagePath, type AppPage } from './routes';

export interface PageLinkProps extends Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  readonly to: AppPage;
}

/**
 * Link to a page (`<a href>` with its address): a plain click goes there in the app, closing the
 * popups; Ctrl / Cmd / middle click is left to the browser (new tab).
 */
export function PageLink(props: PageLinkProps) {
  const popups = useContext(PopupsContext);
  const rest = omit(props, 'to', 'onClick', 'children');
  const onClick = (event: MouseEvent) => {
    callHandler(props.onClick, event);
    if (!isPlainClick(event)) return;
    event.preventDefault();
    popups.navigate(props.to);
  };
  return (
    <a href={pagePath(props.to)} onClick={onClick} {...rest}>
      {props.children}
    </a>
  );
}
