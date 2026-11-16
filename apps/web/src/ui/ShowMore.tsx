import { format, t } from '../i18n';
import { Button } from './Button';
import './Button.css';

/** Przycisk „Pokaż więcej” pod listą rysowaną porcjami; bez ukrytych pozycji nic nie rysuje. */
export function ShowMore({
  hidden,
  onClick,
}: {
  readonly hidden: number;
  readonly onClick: () => void;
}) {
  if (hidden <= 0) return null;
  return (
    <p className="show-more">
      <Button variant="secondary" size="sm" onClick={onClick}>
        {format(t.ui.showMore, { count: hidden })}
      </Button>
    </p>
  );
}
