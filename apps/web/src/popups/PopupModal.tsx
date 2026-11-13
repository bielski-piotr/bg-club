import { Modal, type ModalProps } from '../ui';
import { usePopupLevel } from './popupContext';

export type PopupModalProps = Omit<
  ModalProps,
  'onClose' | 'onBack' | 'onScrimClick' | 'covered' | 'level'
>;

/** `Modal` na stosie popupów: ←, ×, tło i widoczność wynikają z poziomu na stosie. */
export function PopupModal(props: PopupModalProps) {
  const { level, covered, onBack, onClose, onScrimClick } = usePopupLevel();
  return (
    <Modal
      {...props}
      level={level}
      covered={covered}
      onBack={onBack}
      onClose={onClose}
      onScrimClick={onScrimClick}
    />
  );
}
