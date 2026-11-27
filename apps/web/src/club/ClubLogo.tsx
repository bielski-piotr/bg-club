import { createSignal, Show } from 'solid-js';
import { monogram, type ClassValue } from '../ui';
import './club.css';

interface ClubLogoProps {
  readonly name: string;
  /** Adres obrazu (podpisany URL albo podgląd pliku); bez niego monogram nazwy. */
  readonly src?: string | undefined;
  /** 56 = Club view heading, 88 = club form. */
  readonly size: 56 | 88;
  readonly class?: ClassValue;
}

/** Kafelek logo klubu: wgrane logo albo biały monogram nazwy na ciemnym tle. */
export function ClubLogo(props: ClubLogoProps) {
  // Adres, którego obraz się nie wczytał: dla niego monogram, nowy adres próbuje od nowa.
  const [failed, setFailed] = createSignal<string | undefined>(undefined);
  const shown = () => (props.src !== undefined && props.src !== failed() ? props.src : undefined);
  return (
    <span class={['club-logo', `club-logo--${props.size}`, props.class]} aria-hidden="true">
      <Show when={shown()} fallback={monogram(props.name.trim() === '' ? '?' : props.name)}>
        {(src) => (
          <img class="club-logo__img" src={src()} alt="" onError={() => setFailed(src())} />
        )}
      </Show>
    </span>
  );
}
