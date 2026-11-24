import type { ReactNode } from 'react';

/**
 * Ikony liniowe rysowane ręcznie na siatce 16×16 (DS §13, §15, §17, §18).
 * Glify interfejsu mają grubość 2, piktogramy 1,75. Bez biblioteki ikon.
 */
export const glyphs = {
  'chevron-right': <path d="M6 4L10 8L6 12" />,
  'chevron-left': <path d="M10 4L6 8L10 12" />,
  'chevron-down': <path d="M4 6L8 10L12 6" />,
  'chevron-up': <path d="M4 10L8 6L12 10" />,
  x: <path d="M4 4L12 12M12 4L4 12" />,
  plus: <path d="M8 3V13M3 8H13" />,
  minus: <path d="M3 8H13" />,
  /** Przybliż i oddal podgląd (lupa z plusem i minusem). */
  'zoom-in': (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14M7 5V9M5 7H9" />
    </>
  ),
  'zoom-out': (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14M5 7H9" />
    </>
  ),
  check: <path d="M3.5 8.5L6.5 11.5L12.5 4.5" />,
  search: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L13.5 13.5" />
    </>
  ),
} as const satisfies Record<string, ReactNode>;

export const pictograms = {
  calendar: (
    <>
      <rect x="2.5" y="3.5" width="11" height="10" rx="2" />
      <path d="M2.5 7H13.5M5.5 2V5M10.5 2V5" />
    </>
  ),
  clock: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 5V8L10 9.5" />
    </>
  ),
  user: (
    <>
      <circle cx="8" cy="5.5" r="2.5" />
      <path d="M3.5 13C3.9 10.8 5.7 9.5 8 9.5C10.3 9.5 12.1 10.8 12.5 13" />
    </>
  ),
  'user-plus': (
    <>
      <circle cx="6.5" cy="5.5" r="2.5" />
      <path d="M2 13C2.4 10.8 4.2 9.5 6.5 9.5C8.8 9.5 10.6 10.8 11 13M12.5 4.5V8.5M10.5 6.5H14.5" />
    </>
  ),
  trash: <path d="M3 4.5H13M6.5 4.5V3H9.5V4.5M4.5 4.5L5 13H11L11.5 4.5" />,
  copy: (
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="2" />
      <path d="M10.5 5.5V4.5C10.5 3.4 9.6 2.5 8.5 2.5H4.5C3.4 2.5 2.5 3.4 2.5 4.5V8.5C2.5 9.6 3.4 10.5 4.5 10.5H5.5" />
    </>
  ),
  alert: (
    <>
      <path d="M8 2.5L14 13H2L8 2.5Z" />
      <path d="M8 6.5V9M8 11.25V11.3" />
    </>
  ),
  info: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 7.5V11M8 5V5.05" />
    </>
  ),
  eye: (
    <>
      <path d="M1.75 8C3.1 5.3 5.4 3.75 8 3.75C10.6 3.75 12.9 5.3 14.25 8C12.9 10.7 10.6 12.25 8 12.25C5.4 12.25 3.1 10.7 1.75 8Z" />
      <circle cx="8" cy="8" r="2" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M6.6 4C7.05 3.85 7.5 3.75 8 3.75C10.6 3.75 12.9 5.3 14.25 8C13.8 8.9 13.25 9.7 12.6 10.35M10.1 11.85C9.45 12.1 8.75 12.25 8 12.25C5.4 12.25 3.1 10.7 1.75 8C2.4 6.7 3.3 5.65 4.35 4.9" />
      <path d="M2.5 2.5L13.5 13.5M6.6 6.6C6.25 6.95 6 7.45 6 8C6 9.1 6.9 10 8 10C8.55 10 9.05 9.75 9.4 9.4" />
    </>
  ),
  pencil: (
    <>
      <path d="M10.5 3L13 5.5L6 12.5L3 13L3.5 10L10.5 3Z" />
      <path d="M9 4.5L11.5 7" />
    </>
  ),
  upload: <path d="M8 11V3.5M5 6.5L8 3.5L11 6.5M3.5 13H12.5" />,
  download: <path d="M8 3.5V11M5 8L8 11L11 8M3.5 13H12.5" />,
  globe: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M2.5 8H13.5M8 2.5C9.5 4 10.25 6 10.25 8C10.25 10 9.5 12 8 13.5C6.5 12 5.75 10 5.75 8C5.75 6 6.5 4 8 2.5Z" />
    </>
  ),
  dice: (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" />
      <path d="M5.5 5.5V5.55M10.5 5.5V5.55M8 8V8.05M5.5 10.5V10.55M10.5 10.5V10.55" />
    </>
  ),
  trophy: (
    <>
      <path d="M5 2.5H11V6.5C11 8.2 9.7 9.5 8 9.5C6.3 9.5 5 8.2 5 6.5V2.5Z" />
      <path d="M5 4H3C3 5.7 3.8 6.8 5.2 7.1M11 4H13C13 5.7 12.2 6.8 10.8 7.1M8 9.5V11.5M5.5 13.5H10.5M6.5 11.5H9.5V13.5H6.5V11.5Z" />
    </>
  ),
  play: <path d="M5 3.5L12 8L5 12.5V3.5Z" />,
  flag: <path d="M4 13.5V2.5M4 3H12L10 6L12 9H4" />,
  pad: (
    <>
      <rect x="3" y="2.5" width="10" height="11" rx="2" />
      <path d="M5.5 6H10.5M5.5 8.5H10.5M5.5 11H8.5" />
    </>
  ),
  'rotate-left': <path d="M3.5 8A4.5 4.5 0 1 0 5 4.65M3.25 2.5V5.25H6" />,
  'rotate-right': <path d="M12.5 8A4.5 4.5 0 1 1 11 4.65M12.75 2.5V5.25H10" />,
  undo: (
    <path d="M5.5 9.5L2.75 6.75L5.5 4M3 6.75H9.5C11.43 6.75 13 8.32 13 10.25C13 12.18 11.43 13.75 9.5 13.75H7" />
  ),
  /** Dopasuj widok / widok z góry (DS §18). */
  target: (
    <>
      <circle cx="8" cy="8" r="4.5" />
      <circle cx="8" cy="8" r="1.25" />
      <path d="M8 1.5V3.5M8 12.5V14.5M1.5 8H3.5M12.5 8H14.5" />
    </>
  ),
  /** Oderwij kartkę (DS §18): kartka z perforacją u góry i strzałką w dół. */
  'tear-off': (
    <>
      <path d="M3 5.5H4.5M6.25 5.5H7.75M9.5 5.5H11M12.5 5.5H13" />
      <path d="M3.5 8.5V12.5C3.5 13.05 3.95 13.5 4.5 13.5H11.5C12.05 13.5 12.5 13.05 12.5 12.5V8.5" />
      <path d="M4 2.5H12" />
    </>
  ),
  refresh: (
    <path d="M13 8C13 10.8 10.8 13 8 13C5.9 13 4.1 11.7 3.4 9.8M3 8C3 5.2 5.2 3 8 3C10.1 3 11.9 4.3 12.6 6.2M12.75 3V6.25H9.5M3.25 13V9.75H6.5" />
  ),
  image: (
    <>
      <rect x="2.5" y="3" width="11" height="10" rx="2" />
      <circle cx="6" cy="6.5" r="1.25" />
      <path d="M2.5 11.5L6 8.5L8.5 10.5L10.5 9L13.5 11.5" />
    </>
  ),
  camera: (
    <>
      <path d="M2.5 5.5C2.5 4.95 2.95 4.5 3.5 4.5H5.25L6.25 3H9.75L10.75 4.5H12.5C13.05 4.5 13.5 4.95 13.5 5.5V12C13.5 12.55 13.05 13 12.5 13H3.5C2.95 13 2.5 12.55 2.5 12V5.5Z" />
      <circle cx="8" cy="8.5" r="2.25" />
    </>
  ),
  logout: (
    <path d="M6.5 13.5H4C3.2 13.5 2.5 12.8 2.5 12V4C2.5 3.2 3.2 2.5 4 2.5H6.5M10 11L13 8L10 5M13 8H6" />
  ),
  /** Ustawienia profilu (USR-5): suwaki. */
  settings: <path d="M2.5 4.5H9M12 4.5H13.5M2.5 11.5H4M7 11.5H13.5M10.5 3V6M5.5 10V13" />,
  /** Hasło (USR-5, AUTH-6). */
  lock: (
    <>
      <rect x="3" y="7" width="10" height="6.5" rx="1.75" />
      <path d="M5.5 7V5C5.5 3.6 6.6 2.5 8 2.5C9.4 2.5 10.5 3.6 10.5 5V7" />
    </>
  ),
} as const satisfies Record<string, ReactNode>;

export const more = (
  <>
    <circle cx="3.5" cy="8" r="1.25" fill="currentColor" stroke="none" />
    <circle cx="8" cy="8" r="1.25" fill="currentColor" stroke="none" />
    <circle cx="12.5" cy="8" r="1.25" fill="currentColor" stroke="none" />
  </>
);

export type IconName = keyof typeof glyphs | keyof typeof pictograms | 'more';

export const iconNames = [
  ...Object.keys(glyphs),
  ...Object.keys(pictograms),
  'more',
] as readonly IconName[];
