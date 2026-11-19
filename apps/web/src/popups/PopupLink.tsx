import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { isPlainClick, usePopups } from './popupContext';
import type { PopupRoute } from './routes';

export interface PopupLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  /** Popup otwierany nad bieżącym stosem. */
  readonly to: PopupRoute;
}

/**
 * Link do popupu. To prawdziwy `<a href>` z adresem popupu, więc można go skopiować albo
 * otworzyć w nowej karcie; zwykłe kliknięcie otwiera popup bez przeładowania.
 */
export function PopupLink({ to, onClick, children, ...rest }: PopupLinkProps) {
  const { open, hrefFor } = usePopups();
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (!isPlainClick(event)) return;
    event.preventDefault();
    open(to);
  };
  return (
    <a href={hrefFor(to)} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
