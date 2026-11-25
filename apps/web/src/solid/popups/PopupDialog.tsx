/** @jsxImportSource @solidjs/web */
import { useContext } from 'solid-js';
import { PopupLevelContext } from '../context';
import { Dialog, type DialogProps } from '../ui/Modal';

export type PopupDialogProps = Omit<DialogProps, 'onScrimClick' | 'covered' | 'level'>;

/** `Dialog` na stosie popupów: tło zamyka go jak Wstecz, widoczność wynika z poziomu stosu. */
export function PopupDialog(props: PopupDialogProps) {
  const level = useContext(PopupLevelContext);
  return (
    <Dialog
      {...props}
      level={level.level}
      covered={level.covered}
      onScrimClick={() => level.onScrimClick()}
    />
  );
}
