import { Dialog, type DialogProps } from '../ui';
import { usePopupLevel } from './popupContext';

export type PopupDialogProps = Omit<DialogProps, 'onScrimClick' | 'covered' | 'level'>;

/** `Dialog` na stosie popupów: tło zamyka go jak Wstecz, widoczność wynika z poziomu stosu. */
export function PopupDialog(props: PopupDialogProps) {
  const { level, covered, onScrimClick } = usePopupLevel();
  return <Dialog {...props} level={level} covered={covered} onScrimClick={onScrimClick} />;
}
