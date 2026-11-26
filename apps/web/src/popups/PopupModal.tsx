import { useContext } from 'solid-js';
import { PopupLevelContext } from './popupContext';
import { Modal, type ModalProps } from '../ui/Modal';

export type PopupModalProps = Omit<
  ModalProps,
  'onClose' | 'onBack' | 'onScrimClick' | 'covered' | 'level'
>;

/** `Modal` na stosie popupów: ←, ×, tło i widoczność wynikają z poziomu na stosie. */
export function PopupModal(props: PopupModalProps) {
  const level = useContext(PopupLevelContext);
  return (
    <Modal
      {...props}
      level={level.level}
      covered={level.covered}
      onBack={level.onBack}
      onClose={() => level.onClose()}
      onScrimClick={() => level.onScrimClick()}
    />
  );
}
