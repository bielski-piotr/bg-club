import { useState, type CSSProperties } from 'react';
import { plural, t } from '../i18n';
import { paletteColor, paletteIndex, monogram } from './avatarUtils';
import { cx } from './cx';
import './Avatar.css';

/** Rozmiary z DS §8 (38 = awatar w chipie użytkownika w nagłówku, §17). */
export type AvatarSize = 20 | 24 | 28 | 32 | 36 | 38 | 40 | 56 | 64 | 80 | 88 | 104;

/** Monogram skaluje się z awatarem (DS §8): [rozmiar fontu, wysokość linii]. */
const MONOGRAM: Readonly<Record<AvatarSize, readonly [number, number]>> = {
  20: [9, 12],
  24: [10, 12],
  28: [11, 14],
  32: [13, 16],
  36: [14, 18],
  38: [14, 18],
  40: [15, 20],
  56: [20, 24],
  64: [18, 22],
  80: [26, 30],
  88: [30, 36],
  104: [34, 40],
};

export interface AvatarPerson {
  /** Stały klucz koloru (hook profilu, USR-2; id gry). Bez niego kolor wynika z imienia. */
  readonly id?: string | undefined;
  /** Imię i nazwisko; także tekst alternatywny (NFR-6). */
  readonly name: string;
  /** Zdjęcie profilowe (Storage). Bez niego monogram. */
  readonly src?: string | undefined;
  /** Usunięty członek: szary awatar (DS §8). */
  readonly removed?: boolean | undefined;
}

export interface AvatarProps extends AvatarPerson {
  readonly size?: AvatarSize | undefined;
  /** Obwódka (np. biała w wierszu bieżącego użytkownika, DS §6). */
  readonly ring?: 'white' | 'accent' | undefined;
  /** `true`, gdy obok jest już widoczne imię: awatar jest wtedy dekoracyjny. */
  readonly decorative?: boolean | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
}

/** Okrągły awatar: zdjęcie albo biały monogram na kolorze palety (DS §8). */
export function Avatar({
  id,
  name,
  src,
  removed = false,
  size = 36,
  ring,
  decorative = false,
  className,
  style,
}: AvatarProps) {
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const [font, line] = MONOGRAM[size];
  const label = removed ? `${name} ${t.ui.removedSuffix}` : name;
  const showImage = src !== undefined && failed !== src && !removed;
  const a11y = decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label };
  return (
    <span
      className={cx(
        'avatar',
        removed && 'avatar--removed',
        ring && `avatar--ring-${ring}`,
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: font,
        lineHeight: `${line}px`,
        background: removed ? undefined : paletteColor(paletteIndex(id ?? name)),
        ...style,
      }}
      {...a11y}
    >
      {showImage ? (
        <img className="avatar__img" src={src} alt="" onError={() => setFailed(src)} />
      ) : (
        <span className="avatar__monogram" aria-hidden="true">
          {monogram(name)}
        </span>
      )}
    </span>
  );
}

export interface AvatarStackProps {
  readonly people: readonly AvatarPerson[];
  readonly size?: 20 | 24 | 28 | 36 | 56 | 64 | undefined;
  /** Zakładka sąsiednich awatarów w px; domyślnie wg DS §8. */
  readonly overlap?: number | undefined;
  /** Ile awatarów pokazać; reszta trafia do bąbla „+N” (gdy `showOverflow`). */
  readonly max?: number | undefined;
  /** Bąbel „+N” (stos członków, DS §8). Stosy na Spotkaniach go nie mają. */
  readonly showOverflow?: boolean | undefined;
  readonly className?: string | undefined;
}

const DEFAULT_OVERLAP: Readonly<Record<NonNullable<AvatarStackProps['size']>, number>> = {
  20: 6,
  24: 8,
  28: 8,
  36: 8,
  56: 10,
  64: 12,
};

/**
 * Nachodzące na siebie awatary (DS §8). Dla czytnika ekranu stos to jeden obraz
 * z listą imion („Ania, Bartek i 8 innych osób”).
 */
export function AvatarStack({
  people,
  size = 36,
  overlap = DEFAULT_OVERLAP[size],
  max = people.length,
  showOverflow = false,
  className,
}: AvatarStackProps) {
  const visible = people.slice(0, Math.max(0, max));
  const rest = people.length - visible.length;
  const bubble = showOverflow && rest > 0;
  const count = visible.length + (bubble ? 1 : 0);
  const step = size - overlap;
  const width = count > 0 ? size + (count - 1) * step : 0;
  const large = size >= 56;
  const names = visible.map((p) => p.name).join(', ');
  const label = rest > 0 ? plural(rest, t.ui.stackOthers, { names }) : names;
  return (
    <span
      className={cx('avatar-stack', large && 'avatar-stack--large', className)}
      style={{ width, height: size }}
      role="img"
      aria-label={label}
    >
      {visible.map((person, index) => (
        <Avatar
          key={person.id ?? `${person.name}-${index}`}
          {...person}
          size={size}
          decorative
          className={cx(
            'avatar-stack__item',
            size === 64 && index < count - 1 && 'avatar--shifted',
          )}
          style={{ left: index * step }}
        />
      ))}
      {bubble ? (
        <span
          className="avatar avatar-stack__item avatar-stack__more tnum"
          style={{ left: visible.length * step, width: size, height: size }}
          aria-hidden="true"
        >
          +{rest}
        </span>
      ) : null}
    </span>
  );
}
