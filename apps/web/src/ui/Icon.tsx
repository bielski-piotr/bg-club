import type { JSX } from '@solidjs/web';

/*
 * Ikony liniowe rysowane ręcznie na siatce 16×16. Glify interfejsu mają grubość 2,
 * piktogramy 1,75. Bez biblioteki ikon.
 */
const glyphs = {
  'chevron-right': () => <path d="M6 4L10 8L6 12" />,
} as const;

const pictograms = {
  user: () => (
    <>
      <circle cx="8" cy="5.5" r="2.5" />
      <path d="M3.5 13C3.9 10.8 5.7 9.5 8 9.5C10.3 9.5 12.1 10.8 12.5 13" />
    </>
  ),
  settings: () => <path d="M2.5 4.5H9M12 4.5H13.5M2.5 11.5H4M7 11.5H13.5M10.5 3V6M5.5 10V13" />,
  logout: () => (
    <path d="M6.5 13.5H4C3.2 13.5 2.5 12.8 2.5 12V4C2.5 3.2 3.2 2.5 4 2.5H6.5M10 11L13 8L10 5M13 8H6" />
  ),
} as const;

export type IconName = keyof typeof glyphs | keyof typeof pictograms;

function isGlyph(name: IconName): name is keyof typeof glyphs {
  return name in glyphs;
}

export interface IconProps {
  readonly name: IconName;
  /** Rozmiar w px (14, 16, 20 lub 22). */
  readonly size?: number | undefined;
  readonly class?: string | undefined;
}

/** Ikona dekoracyjna; znaczenie przekazuje etykieta kontrolki obok. Kolor z `currentColor`. */
export function Icon(props: IconProps): JSX.Element {
  const shape = () => {
    const name = props.name;
    return isGlyph(name) ? glyphs[name]() : pictograms[name]();
  };
  return (
    <svg
      class={props.class}
      width={props.size ?? 16}
      height={props.size ?? 16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width={isGlyph(props.name) ? 2 : 1.75}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {shape()}
    </svg>
  );
}
