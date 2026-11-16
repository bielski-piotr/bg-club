import { format, t } from '../i18n';
import { Button } from './Button';
import './Button.css';

/** Przycisk „Pokaż więcej” pod listą rysowaną porcjami; bez ukrytych pozycji nic nie rysuje. */
export function ShowMore({
  hidden,
  onClick,
  className,
}: {
  readonly hidden: number;
  readonly onClick: () => void;
  readonly className?: string | undefined;
}) {
  if (hidden <= 0) return null;
  return (
    <p className={className ?? 'show-more'}>
      <Button variant="secondary" size="sm" onClick={onClick}>
        {format(t.ui.showMore, { count: hidden })}
      </Button>
    </p>
  );
}
