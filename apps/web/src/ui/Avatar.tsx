import type { JSX } from '@solidjs/web';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { plural, t } from '../i18n';
import { monogram, paletteColor, paletteIndex } from './avatarUtils';
import { px, type ClassValue } from './dom';
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
  readonly class?: ClassValue;
  readonly style?: JSX.CSSProperties | undefined;
}

/** Okrągły awatar: zdjęcie albo biały monogram na kolorze palety (DS §8). */
export function Avatar(props: AvatarProps) {
  // Adres zdjęcia, którego nie udało się wczytać: inny adres próbuje od nowa.
  const [failed, setFailed] = createSignal<string | undefined>(undefined);
  const size = () => props.size ?? 36;
  const label = () => (props.removed ? `${props.name} ${t.ui.removedSuffix}` : props.name);
  const image = () => (props.src !== failed() && !props.removed ? props.src : undefined);
  return (
    <span
      class={[
        'avatar',
        { 'avatar--removed': !!props.removed },
        props.ring ? `avatar--ring-${props.ring}` : undefined,
        props.class,
      ]}
      style={{
        width: px(size()),
        height: px(size()),
        'font-size': px(MONOGRAM[size()][0]),
        'line-height': px(MONOGRAM[size()][1]),
        background: props.removed ? undefined : paletteColor(paletteIndex(props.id ?? props.name)),
        ...props.style,
      }}
      role={props.decorative ? undefined : 'img'}
      aria-label={props.decorative ? undefined : label()}
      aria-hidden={props.decorative ? 'true' : undefined}
    >
      <Show
        when={image()}
        fallback={
          <span class="avatar__monogram" aria-hidden="true">
            {monogram(props.name)}
          </span>
        }
      >
        {(src) => <img class="avatar__img" src={src()} alt="" onError={() => setFailed(src())} />}
      </Show>
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
  readonly class?: ClassValue;
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
export function AvatarStack(props: AvatarStackProps) {
  const size = () => props.size ?? 36;
  const layout = createMemo(() => {
    const visible = props.people.slice(0, Math.max(0, props.max ?? props.people.length));
    const rest = props.people.length - visible.length;
    const bubble = !!props.showOverflow && rest > 0;
    const count = visible.length + (bubble ? 1 : 0);
    const step = size() - (props.overlap ?? DEFAULT_OVERLAP[size()]);
    const names = visible.map((p) => p.name).join(', ');
    return {
      visible,
      rest,
      bubble,
      count,
      step,
      width: count > 0 ? size() + (count - 1) * step : 0,
      label: rest > 0 ? plural(rest, t.ui.stackOthers, { names }) : names,
    };
  });
  return (
    <span
      class={['avatar-stack', { 'avatar-stack--large': size() >= 56 }, props.class]}
      style={{ width: px(layout().width), height: px(size()) }}
      role="img"
      aria-label={layout().label}
    >
      <For each={layout().visible}>
        {(person, index) => (
          <Avatar
            id={person.id}
            name={person.name}
            src={person.src}
            removed={person.removed}
            size={size()}
            decorative
            class={[
              'avatar-stack__item',
              { 'avatar--shifted': size() === 64 && index() < layout().count - 1 },
            ]}
            style={{ left: px(index() * layout().step) }}
          />
        )}
      </For>
      <Show when={layout().bubble}>
        <span
          class="avatar avatar-stack__item avatar-stack__more tnum"
          style={{
            left: px(layout().visible.length * layout().step),
            width: px(size()),
            height: px(size()),
          }}
          aria-hidden="true"
        >
          +{layout().rest}
        </span>
      </Show>
    </span>
  );
}
