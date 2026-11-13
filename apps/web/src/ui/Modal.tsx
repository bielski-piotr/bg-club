import { useId, type KeyboardEvent, type ReactNode } from 'react';
import { t } from '../i18n';
import { IconButton } from './Button';
import { cx } from './cx';
import { focusableIn } from './focusable';
import './Modal.css';

export interface ModalProps {
  readonly title: string;
  /** Licznik obok tytułu na desktopie, np. „12 osób” (DS §7). */
  readonly count?: string | undefined;
  /** Akcje w nagłówku przed ×, np. przycisk „Dodaj” h36. */
  readonly actions?: ReactNode | undefined;
  /** Zamknięcie (×). */
  readonly onClose: () => void;
  /** Powrót do poprzedniego popupu (←); bez niego przycisku nie ma. */
  readonly onBack?: (() => void) | undefined;
  /** Kliknięcie tła poza oknem (desktop). */
  readonly onScrimClick?: (() => void) | undefined;
  /** 560 (lista, formularz) albo 880 (dwie kolumny), DS §7. */
  readonly width?: 560 | 880 | undefined;
  /** Okno przykryte przez popup wyżej na stosie: niewidoczne i poza kolejnością fokusu. */
  readonly covered?: boolean | undefined;
  /** Poziom na stosie (atrybut `data-popup-level`, po nim host przenosi fokus). */
  readonly level?: number | undefined;
  readonly children: ReactNode;
  /**
   * Stopka formularza (DS §7, §17): na desktopie przyciski do prawej, na telefonie dwa
   * przyciski po równo na dole arkusza. Zostaje widoczna, gdy treść się przewija.
   */
  readonly footer?: ReactNode | undefined;
  readonly className?: string | undefined;
}

/**
 * Popup (DS §7): na desktopie okno 560/880 na przyciemnionym tle, na telefonie pełnoekranowy
 * arkusz. Fokus nie wychodzi poza okno (Tab i Shift+Tab krążą w nim, NFR-6); resztę strony
 * wyłącza `inert` u rodzica. Esc, przewijanie tła i przywracanie fokusu obsługuje `PopupHost`.
 */
export function Modal({
  title,
  count,
  actions,
  onClose,
  onBack,
  onScrimClick,
  width = 560,
  covered = false,
  level,
  children,
  footer,
  className,
}: ModalProps) {
  const titleId = useId();

  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const dialog = event.currentTarget;
    const items = focusableIn(dialog);
    const first = items[0];
    const last = items.at(-1);
    if (!first || !last) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className={cx('popup-layer', covered && 'popup-layer--covered')} inert={covered}>
      <div className="popup-layer__scrim" aria-hidden="true" onClick={onScrimClick} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-popup-level={level}
        className={cx('modal', `modal--${width}`, className)}
        onKeyDown={trapFocus}
      >
        <header className="modal__header">
          <div className="modal__heading">
            {onBack ? <IconButton icon="chevron-left" label={t.ui.back} onClick={onBack} /> : null}
            <div className="modal__title-group">
              <h2 id={titleId} className="modal__title">
                {title}
              </h2>
              {count ? <span className="modal__count">{count}</span> : null}
            </div>
          </div>
          <div className="modal__actions">
            {actions}
            <IconButton icon="x" label={t.ui.close} onClick={onClose} />
          </div>
        </header>
        <div className="modal__body">
          {count ? <p className="modal__count-line">{count}</p> : null}
          {children}
        </div>
        {footer ? <footer className="modal__footer">{footer}</footer> : null}
      </div>
    </div>
  );
}
