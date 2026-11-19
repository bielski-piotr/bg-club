import type { SVGProps } from 'react';
import { glyphs, more, pictograms, type IconName } from './iconPaths';

export type { IconName };

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  readonly name: IconName;
  /** Rozmiar w px (14, 16, 20 lub 22). */
  readonly size?: number | undefined;
}

/**
 * Ikona dekoracyjna (`aria-hidden`). Znaczenie przekazuje etykieta kontrolki obok.
 * Kolor dziedziczy z `currentColor`.
 */
export function Icon({ name, size = 16, ...rest }: IconProps) {
  const isGlyph = name in glyphs;
  const content =
    name === 'more'
      ? more
      : isGlyph
        ? glyphs[name as keyof typeof glyphs]
        : pictograms[name as keyof typeof pictograms];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={isGlyph ? 2 : 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {content}
    </svg>
  );
}
