import { useId, type KeyboardEvent, type ReactNode } from 'react';
import { t } from '../i18n';
import { IconButton } from './Button';
import { Icon, type IconName } from './Icon';
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
  /** 560 (lista, formularz), 880 (dwie kolumny), DS §7, albo 1120 (edytor notesu, DS §18). */
  readonly width?: 560 | 880 | 1120 | undefined;
  /** Okno przykryte przez popup wyżej na stosie: niewidoczne i poza kolejnością fokusu. */
  readonly covered?: boolean | undefined;
  /**
   * Okno pod własnym dialogiem (np. potwierdzeniem): widoczne, ale `inert`, więc fokus
   * i czytniki ekranu zostają w dialogu.
   */
  readonly blocked?: boolean | undefined;
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

/** Tab i Shift+Tab krążą w oknie dialogu (NFR-6). */
function trapFocus(event: KeyboardEvent<HTMLDivElement>) {
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
  blocked = false,
  level,
  children,
  footer,
  className,
}: ModalProps) {
  const titleId = useId();

  return (
    <div
      className={cx('popup-layer', covered && 'popup-layer--covered')}
      inert={covered || blocked}
    >
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

export interface DialogProps {
  readonly title: string;
  /** Opis pod tytułem (14/20, kolor pomocniczy). */
  readonly description?: ReactNode | undefined;
  /**
   * Ikona w kółku 44 nad tytułem; `danger` dla działań nieodwracalnych, `warning` dla
   * przeszkody do usunięcia (np. partie w toku, DS §15 „Dialog variants”).
   */
  readonly icon?: IconName | undefined;
  readonly tone?: 'accent' | 'danger' | 'warning' | undefined;
  /** Kliknięcie tła poza oknem. Esc obsługuje `PopupHost`. */
  readonly onScrimClick?: (() => void) | undefined;
  readonly covered?: boolean | undefined;
  readonly level?: number | undefined;
  /** Treść między opisem a przyciskami, np. pole hasła. */
  readonly children?: ReactNode | undefined;
  /** Dwa przyciski równej szerokości: Anuluj i działanie (DS §7). */
  readonly footer: ReactNode;
}

/**
 * Mały dialog (DS §7 „Small dialog”): potwierdzenia i krótkie formularze haseł. Karta 343 na
 * przyciemnionym tle na każdej szerokości ekranu, bez przycisku ×; zamyka go Anuluj, Esc albo
 * kliknięcie tła. Fokus zostaje w oknie jak w `Modal`.
 */
export function Dialog({
  title,
  description,
  icon,
  tone = 'accent',
  onScrimClick,
  covered = false,
  level,
  children,
  footer,
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <div
      className={cx('popup-layer', 'popup-layer--dialog', covered && 'popup-layer--covered')}
      inert={covered}
    >
      <div className="popup-layer__scrim" aria-hidden="true" onClick={onScrimClick} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        data-popup-level={level}
        className="dialog"
        onKeyDown={trapFocus}
      >
        {icon ? (
          <span className={cx('dialog__icon', `dialog__icon--${tone}`)} aria-hidden="true">
            <Icon name={icon} size={20} />
          </span>
        ) : null}
        <h2 id={titleId} className="dialog__title">
          {title}
        </h2>
        {description ? (
          <div id={descriptionId} className="dialog__description">
            {description}
          </div>
        ) : null}
        {children ? <div className="dialog__body">{children}</div> : null}
        <div className="dialog__footer">{footer}</div>
      </div>
    </div>
  );
}
