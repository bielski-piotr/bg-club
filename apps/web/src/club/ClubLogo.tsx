import { useState } from 'react';
import { monogram } from '../ui';
import { cx } from '../ui/cx';
import './club.css';

interface ClubLogoProps {
  readonly name: string;
  /** Adres obrazu (podpisany URL albo podgląd pliku); bez niego monogram nazwy. */
  readonly src?: string | undefined;
  /** 36 = nagłówek huba, 88 = formularz klubu (DS §17). */
  readonly size: 36 | 88;
  readonly className?: string | undefined;
}

/** Kafelek logo klubu: wgrane logo albo biały monogram nazwy na ciemnym tle (DS §17). */
export function ClubLogo({ name, src, size, className }: ClubLogoProps) {
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const showImage = src !== undefined && src !== failed;
  return (
    <span className={cx('club-logo', `club-logo--${size}`, className)} aria-hidden="true">
      {showImage ? (
        <img className="club-logo__img" src={src} alt="" onError={() => setFailed(src)} />
      ) : (
        monogram(name.trim() === '' ? '?' : name)
      )}
    </span>
  );
}
