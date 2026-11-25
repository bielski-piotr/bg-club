import { useState } from 'react';
import { useAuth } from '../auth/authContext';
import { useCoverUrl } from '../hub/club';
import { monogram, paletteColor, paletteIndex } from '../ui';
import { cx } from '../ui/cx';
import './games.css';

interface GameCoverProps {
  /** Id gry: stały kolor palety monogramu (DS §14). */
  readonly id: string;
  readonly title: string;
  /** Ścieżka okładki w buckecie `covers`; `null` = monogram (GAME-6). */
  readonly coverPath: string | null;
  /** Adres obrazu, który ma pierwszeństwo przed `coverPath` (podgląd pliku w formularzu). */
  readonly src?: string | undefined;
  /**
   * `thumb` = miniatura 36 (promień 10, jedna litera), `form` = kafelek 88 w formularzu,
   * `large` = okładka w siatce i w widżecie (promień 18, motyw i monogram, DS §14).
   */
  readonly size: 'thumb' | 'form' | 'large';
  readonly className?: string | undefined;
  /** Niedostępna gra: okładka wyszarzona (kolekcja, wybór w głosowaniu i partii). */
  readonly unavailable?: boolean | undefined;
}

/**
 * Okładka gry (GAME-6, DS §14): wgrany obraz albo kafelek w kolorze palety z białym
 * monogramem tytułu. Dekoracyjna: tytuł jest zawsze obok w tekście.
 */
export function GameCover({
  id,
  title,
  coverPath,
  src,
  size,
  className,
  unavailable = false,
}: GameCoverProps) {
  const { client } = useAuth();
  const saved = useCoverUrl(client, src === undefined ? coverPath : null);
  const url = src ?? saved.data;
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const showImage = url !== undefined && url !== failed;
  const text = title.trim() === '' ? '?' : title;
  const letters = size === 'thumb' ? (Array.from(monogram(text))[0] ?? '?') : monogram(text);
  return (
    <span
      className={cx(
        'game-cover',
        `game-cover--${size}`,
        showImage && 'game-cover--image',
        unavailable && 'game-cover--unavailable',
        className,
      )}
      style={{ background: showImage ? undefined : paletteColor(paletteIndex(id)) }}
      aria-hidden="true"
    >
      {showImage ? (
        <img
          className="game-cover__img"
          src={url}
          alt=""
          loading="lazy"
          onError={() => setFailed(url)}
        />
      ) : (
        <>
          {size === 'thumb' ? null : (
            <>
              <span className="game-cover__circle" />
              <span className="game-cover__dot" />
            </>
          )}
          <span className="game-cover__monogram">{letters}</span>
        </>
      )}
    </span>
  );
}
