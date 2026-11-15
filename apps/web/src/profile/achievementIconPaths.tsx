import type { ReactNode } from 'react';
import { pictograms } from '../ui/iconPaths';

/**
 * Piktogramy odznak z katalogu osiągnięć (`ACHIEVEMENTS[].icon`, PRD ACH-1, ACH-3): liniowe,
 * rysowane ręcznie na siatce 16×16 jak pozostałe piktogramy (DS §13, grubość 1,75). Część
 * pochodzi ze wspólnego zestawu (`iconPaths.tsx`). Ikona jest dekoracyjna: nazwę i stan
 * odznaki podaje tekst obok (dostępność, NFR-6).
 */
export const achievementIcons: Readonly<Record<string, ReactNode>> = {
  footsteps: (
    <>
      <path d="M5 2.5C6.1 2.5 6.75 3.6 6.75 5C6.75 6.4 6.1 7.5 5 7.5C3.9 7.5 3.25 6.4 3.25 5C3.25 3.6 3.9 2.5 5 2.5Z" />
      <path d="M3.75 9.5H6.25V10.5C6.25 11.2 5.7 11.75 5 11.75C4.3 11.75 3.75 11.2 3.75 10.5V9.5Z" />
      <path d="M11 4.5C12.1 4.5 12.75 5.6 12.75 7C12.75 8.4 12.1 9.5 11 9.5C9.9 9.5 9.25 8.4 9.25 7C9.25 5.6 9.9 4.5 11 4.5Z" />
      <path d="M9.75 11.5H12.25V12.5C12.25 13.2 11.7 13.75 11 13.75C10.3 13.75 9.75 13.2 9.75 12.5V11.5Z" />
    </>
  ),
  calendar: pictograms.calendar,
  medal: (
    <>
      <path d="M5.5 2.5L7 6.5M10.5 2.5L9 6.5" />
      <circle cx="8" cy="10" r="3.5" />
      <path d="M8 8.5V11.5" />
    </>
  ),
  columns: <path d="M2.5 5.5L8 2.5L13.5 5.5M3.5 13.5H12.5M4.5 7.5V11.5M8 7.5V11.5M11.5 7.5V11.5" />,
  dice: pictograms.dice,
  flame: (
    <path d="M8 13.5C10.5 13.5 12.5 11.8 12.5 9.3C12.5 6.5 10 5 9.5 2.5C8 3.5 7 5 7.2 7C6.3 6.6 5.8 5.9 5.6 5C4.3 6.1 3.5 7.6 3.5 9.3C3.5 11.8 5.5 13.5 8 13.5Z" />
  ),
  hundred: (
    <>
      <path d="M2.5 6L4 4.75V11.25" />
      <ellipse cx="7.5" cy="8" rx="1.75" ry="3.25" />
      <ellipse cx="11.75" cy="8" rx="1.75" ry="3.25" />
    </>
  ),
  timer: (
    <>
      <circle cx="8" cy="9" r="4.5" />
      <path d="M6.5 2H9.5M8 2V4.5M8 9L10 7.5M12 4.5L13 3.5" />
    </>
  ),
  trophy: pictograms.trophy,
  crown: <path d="M2.5 5L5.25 8L8 3.5L10.75 8L13.5 5L12.5 12H3.5L2.5 5ZM3.5 13.5H12.5" />,
  hat: (
    <path d="M2.5 11.5H13.5M4.5 11.5V8C4.5 5.5 5.5 4 8 4C10.5 4 11.5 5.5 11.5 8V11.5M4.5 9.5H11.5" />
  ),
  diamond: (
    <path d="M4.5 3H11.5L13.5 6L8 13L2.5 6L4.5 3ZM2.5 6H13.5M6.5 3L5.75 6L8 13L10.25 6L9.5 3" />
  ),
  bolt: <path d="M9 2L3.5 9H8L7 14L12.5 7H8L9 2Z" />,
  rocket: (
    <>
      <path d="M9.5 10.5C12.5 8.5 13.5 5.5 13.5 2.5C10.5 2.5 7.5 3.5 5.5 6.5L9.5 10.5Z" />
      <path d="M5.5 6.5H3L4.5 4.75H7M9.5 10.5V13L11.25 11.5V9M5 11C4 11.5 3.25 12.5 2.75 13.25C3.5 12.75 4.5 12 5 11Z" />
      <circle cx="10.25" cy="5.75" r="1" />
    </>
  ),
  star: (
    <path d="M8 2.5L9.7 5.95L13.5 6.5L10.75 9.2L11.4 13L8 11.2L4.6 13L5.25 9.2L2.5 6.5L6.3 5.95L8 2.5Z" />
  ),
  compass: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M10.5 5.5L9 9L5.5 10.5L7 7L10.5 5.5Z" />
    </>
  ),
  map: <path d="M2.5 4L6 2.5L10 4L13.5 2.5V12L10 13.5L6 12L2.5 13.5V4ZM6 2.5V12M10 4V13.5" />,
  shapes: (
    <>
      <circle cx="5" cy="5" r="2.5" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
      <path d="M8 9L10.75 13.5H5.25L8 9Z" />
    </>
  ),
  target: pictograms.target,
  clover: (
    <path d="M8 7.5C6.5 4.5 5 3 3.75 4.25C2.5 5.5 4.5 7 7.5 8C4.5 9 2.5 10.5 3.75 11.75C5 13 6.5 11.5 8 8.5C9.5 11.5 11 13 12.25 11.75C13.5 10.5 11.5 9 8.5 8C11.5 7 13.5 5.5 12.25 4.25C11 3 9.5 4.5 8 7.5ZM8 8.5V14" />
  ),
  chart: (
    <path d="M2.5 13.5H13.5M4 13.5V9M7 13.5V6.5M10 13.5V8.5M13 13.5V3M3.5 6.5L7 3.5L10 5.5L13 2.5" />
  ),
  table: (
    <>
      <path d="M2.5 7.5H13.5M4 7.5V12.5M12 7.5V12.5" />
      <circle cx="4.5" cy="4" r="1.25" />
      <circle cx="8" cy="3.5" r="1.25" />
      <circle cx="11.5" cy="4" r="1.25" />
    </>
  ),
  handshake: (
    <path d="M1.5 6.5L4 4.5L6.5 5.5L8.5 4.5L11.5 5L14.5 7.5M3 8L6.5 11.5C7 12 7.75 12 8.25 11.5L12.5 7.5M8.5 4.5L6 7C5.6 7.4 5.9 8 6.5 8C7.5 8 8.5 7 9.5 7L11.5 9M7 9.5L9 11.25M5 9.25L7.25 11.25" />
  ),
  phoenix: (
    <path d="M8 13.5V8M8 8C6 8 3.5 6.5 2.5 3.5C4.5 4 6 4.5 7 6M8 8C10 8 12.5 6.5 13.5 3.5C11.5 4 10 4.5 9 6M8 8C8 6 8 4 8 2.5M6 13.5L8 11.5L10 13.5" />
  ),
  lantern: (
    <>
      <path d="M6 2.5H10M8 2.5V1.5M5.5 4.5H10.5L11.5 6.5V11L10.5 12.5H5.5L4.5 11V6.5L5.5 4.5ZM6 14.5H10" />
      <path d="M8 7.5C8.8 8.3 8.8 9.7 8 10.5C7.2 9.7 7.2 8.3 8 7.5Z" />
    </>
  ),
  coins: (
    <>
      <ellipse cx="6.5" cy="4.5" rx="4" ry="2" />
      <path d="M2.5 4.5V7.5C2.5 8.6 4.3 9.5 6.5 9.5M2.5 7.5V10.5C2.5 11.6 4.3 12.5 6.5 12.5M10.5 4.5V6.5" />
      <ellipse cx="10" cy="9" rx="3.5" ry="1.75" />
      <path d="M6.5 9V12C6.5 13 8 13.75 10 13.75C12 13.75 13.5 13 13.5 12V9" />
    </>
  ),
  gem: <path d="M8 2.5L13 6.5L8 13.5L3 6.5L8 2.5ZM3 6.5H13M8 2.5L6 6.5L8 13.5L10 6.5L8 2.5" />,
  ballot: (
    <>
      <path d="M2.5 9.5H13.5V13.5H2.5V9.5ZM5 9.5V8.5M11 9.5V8.5M6 11.5H10" />
      <path d="M5.5 2.5H10.5V8.5H5.5V2.5ZM6.75 5.5L7.75 6.5L9.5 4.5" />
    </>
  ),
};
