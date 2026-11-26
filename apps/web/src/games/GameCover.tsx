import { createSignal, Show } from 'solid-js';
import { createCoverUrl } from '../club/clubData';
import type { ClassValue } from '../ui/dom';
import { monogram, paletteColor, paletteIndex } from '../ui/avatarUtils';
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
  readonly class?: ClassValue;
  /** Niedostępna gra: okładka wyszarzona (kolekcja, wybór w głosowaniu i partii). */
  readonly unavailable?: boolean | undefined;
}

/**
 * Okładka gry (GAME-6, DS §14): wgrany obraz albo kafelek w kolorze palety z białym
 * monogramem tytułu. Dekoracyjna: tytuł jest zawsze obok w tekście.
 */
export function GameCover(props: GameCoverProps) {
  const saved = createCoverUrl(() => (props.src === undefined ? props.coverPath : null));
  const [failed, setFailed] = createSignal<string | undefined>(undefined);
  const url = () => {
    const value = props.src ?? saved().data;
    return value !== undefined && value !== failed() ? value : undefined;
  };
  const letters = () => {
    const text = props.title.trim() === '' ? '?' : props.title;
    return props.size === 'thumb' ? (Array.from(monogram(text))[0] ?? '?') : monogram(text);
  };
  return (
    <span
      class={[
        'game-cover',
        `game-cover--${props.size}`,
        { 'game-cover--image': !!url(), 'game-cover--unavailable': !!props.unavailable },
        props.class,
      ]}
      style={{ background: url() ? undefined : paletteColor(paletteIndex(props.id)) }}
      aria-hidden="true"
    >
      <Show
        when={url()}
        fallback={
          <>
            <Show when={props.size !== 'thumb'}>
              <span class="game-cover__circle" />
              <span class="game-cover__dot" />
            </Show>
            <span class="game-cover__monogram">{letters()}</span>
          </>
        }
      >
        {(src) => (
          <img
            class="game-cover__img"
            src={src()}
            alt=""
            loading="lazy"
            onError={() => setFailed(src())}
          />
        )}
      </Show>
    </span>
  );
}
