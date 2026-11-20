import { createSignal } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { t } from '../i18n';
import { monogram, paletteColor, paletteIndex } from './avatarUtils';
import './Avatar.css';

/** Dostępne rozmiary (38 = chip użytkownika w nagłówku). */
export type AvatarSize = 20 | 24 | 28 | 32 | 36 | 38 | 40 | 56 | 64 | 80 | 88 | 104;

/** Monogram skaluje się z awatarem: [rozmiar fontu, wysokość linii]. */
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

export interface AvatarProps {
  /** Imię i nazwisko: monogram i tekst alternatywny. */
  readonly name: string;
  /** Stały klucz koloru (hook profilu). Bez niego kolor wynika z imienia. */
  readonly colorKey?: string | undefined;
  /** Zdjęcie; bez niego albo po błędzie wczytania monogram. */
  readonly src?: string | null | undefined;
  /** Usunięty członek: szary awatar. */
  readonly removed?: boolean | undefined;
  readonly size?: AvatarSize | undefined;
  /** `true`, gdy obok jest już widoczne imię albo etykieta: awatar jest wtedy dekoracyjny. */
  readonly decorative?: boolean | undefined;
  readonly class?: string | undefined;
}

/** Okrągły awatar: zdjęcie albo biały monogram na kolorze palety. */
export function Avatar(props: AvatarProps): JSX.Element {
  const [failed, setFailed] = createSignal<string | null>(null);
  const size = () => props.size ?? 36;
  const image = () => {
    const src = props.src;
    return src && src !== failed() && !props.removed ? src : null;
  };
  const label = () => (props.removed ? `${props.name} ${t.ui.removedSuffix}` : props.name);
  return (
    <span
      class={['avatar', props.class, { 'avatar--removed': props.removed }]}
      role={props.decorative ? undefined : 'img'}
      aria-label={props.decorative ? undefined : label()}
      aria-hidden={props.decorative ? 'true' : undefined}
      style={{
        width: `${size()}px`,
        height: `${size()}px`,
        'font-size': `${MONOGRAM[size()][0]}px`,
        'line-height': `${MONOGRAM[size()][1]}px`,
        background: props.removed
          ? undefined
          : paletteColor(paletteIndex(props.colorKey ?? props.name)),
      }}
    >
      {image() ? (
        <img
          class="avatar__img"
          src={image() ?? undefined}
          alt=""
          onError={(e) => setFailed(e.currentTarget.getAttribute('src'))}
        />
      ) : (
        <span class="avatar__monogram" aria-hidden="true">
          {monogram(props.name)}
        </span>
      )}
    </span>
  );
}
