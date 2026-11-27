import type { JSX } from '@solidjs/web';
import { omit } from 'solid-js';
import { notFocusable } from './dom';
import { glyphs, more, pictograms, type IconName } from './iconPaths';

export type { IconName };

export interface IconProps extends Omit<JSX.SvgSVGAttributes<SVGSVGElement>, 'name'> {
  readonly name: IconName;
  /** Rozmiar w px (14, 16, 20 lub 22). */
  readonly size?: number | undefined;
}

function content(name: IconName): JSX.Element {
  if (name === 'more') return more();
  if (name in glyphs) return glyphs[name as keyof typeof glyphs]();
  return pictograms[name as keyof typeof pictograms]();
}

/**
 * Ikona dekoracyjna (`aria-hidden`). Znaczenie przekazuje etykieta kontrolki obok.
 * Kolor dziedziczy z `currentColor`. `data-icon` wybiera animację w `.hoverable` (hover.css).
 */
export function Icon(props: IconProps) {
  const rest = omit(props, 'name', 'size');
  const size = () => props.size ?? 16;
  return (
    <svg
      width={size()}
      height={size()}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width={props.name in glyphs ? 2 : 1.75}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      data-icon={props.name}
      {...notFocusable}
      {...rest}
    >
      {content(props.name)}
    </svg>
  );
}
