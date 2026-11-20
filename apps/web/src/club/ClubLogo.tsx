import { createSignal } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { monogram } from '../ui';
import './club.css';

interface ClubLogoProps {
  readonly name: string;
  /** Adres logo; bez niego albo po błędzie wczytania monogram nazwy. */
  readonly src: string | null;
  /** 56 = nagłówek huba, 88 = formularz klubu. */
  readonly size: 56 | 88;
}

/** Kafelek logo klubu: wgrane logo albo biały monogram nazwy na ciemnym tle. Dekoracyjny. */
export function ClubLogo(props: ClubLogoProps): JSX.Element {
  const [failed, setFailed] = createSignal<string | null>(null);
  const image = () => (props.src && props.src !== failed() ? props.src : null);
  return (
    <span class={['club-logo', `club-logo--${props.size}`]} aria-hidden="true">
      {image() ? (
        <img
          class="club-logo__img"
          src={image() ?? undefined}
          alt=""
          onError={(e) => setFailed(e.currentTarget.getAttribute('src'))}
        />
      ) : (
        monogram(props.name)
      )}
    </span>
  );
}
