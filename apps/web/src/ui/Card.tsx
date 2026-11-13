import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';
import './Card.css';

export interface CardProps {
  readonly title: string;
  /** Licznik obok tytułu, np. „12 osób”. */
  readonly count?: string | undefined;
  /** Element po prawej w nagłówku: link „Zobacz więcej”, odliczanie, chip „Trwa”. */
  readonly action?: ReactNode | undefined;
  readonly children: ReactNode;
  /** Poziom nagłówka tytułu (domyślnie h2). */
  readonly headingLevel?: 2 | 3 | undefined;
  readonly className?: string | undefined;
}

/**
 * Karta widżetu (DS §6): biała, ramka #E4E7F0, promień 28/24, padding 28/16, cień karty.
 * Szerokość wyznacza rodzic (520 desktop / 343 telefon).
 */
export function Card({ title, count, action, children, headingLevel = 2, className }: CardProps) {
  const id = useId();
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section className={cx('card', className)} aria-labelledby={id}>
      <header className="card__header">
        <div className="card__title-group">
          <Heading id={id} className="card__title">
            {title}
          </Heading>
          {count ? <span className="card__count">{count}</span> : null}
        </div>
        {action ? <div className="card__action">{action}</div> : null}
      </header>
      {children}
    </section>
  );
}

export interface TrayProps {
  readonly children: ReactNode;
  /** Etykieta listy dla czytnika ekranu. */
  readonly label?: string | undefined;
  readonly className?: string | undefined;
}

/** Taca listy (DS §6): tło #F1F3F9, promień 22, padding 10, odstęp 6. Dzieci: `ListRow`. */
export function Tray({ children, label, className }: TrayProps) {
  return (
    <ul className={cx('tray', className)} aria-label={label}>
      {children}
    </ul>
  );
}

export interface ListRowProps {
  /** Element na początku: pozycja, awatar, miniatura, checkbox. */
  readonly leading?: ReactNode | undefined;
  readonly title: ReactNode;
  readonly meta?: ReactNode | undefined;
  /** Element na końcu: wynik, badge, przycisk ⋯. */
  readonly trailing?: ReactNode | undefined;
  /** 54 (ranking, gry) albo 64 (członkowie w popupie), DS §6–§7. */
  readonly height?: 54 | 64 | undefined;
  /** Wiersz bieżącego użytkownika: tło akcentu, biały tekst (DS §6). */
  readonly highlighted?: boolean | undefined;
  /** Wyszarzony wiersz (np. usunięty członek). */
  readonly muted?: boolean | undefined;
  /** Cały wiersz jest przyciskiem (otwiera szczegóły); dodaje strzałkę. */
  readonly onClick?: ButtonHTMLAttributes<HTMLButtonElement>['onClick'] | undefined;
}

export function ListRow({
  leading,
  title,
  meta,
  trailing,
  height = 54,
  highlighted = false,
  muted = false,
  onClick,
}: ListRowProps) {
  const body = (
    <>
      {leading ? <span className="row__leading">{leading}</span> : null}
      <span className="row__text">
        <span className="row__title">{title}</span>
        {meta ? <span className="row__meta">{meta}</span> : null}
      </span>
      {trailing ? <span className="row__trailing">{trailing}</span> : null}
      {onClick ? <Icon name="chevron-right" className="row__chevron" /> : null}
    </>
  );
  const classes = cx(
    'row',
    `row--${height}`,
    highlighted && 'row--highlighted',
    muted && 'row--muted',
    onClick && 'row--interactive',
  );
  return (
    <li className="tray__item">
      {onClick ? (
        <button type="button" className={classes} onClick={onClick}>
          {body}
        </button>
      ) : (
        <div className={classes}>{body}</div>
      )}
    </li>
  );
}
