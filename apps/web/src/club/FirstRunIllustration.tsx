/** @jsxImportSource @solidjs/web */
import { For } from 'solid-js';
import { notFocusable } from '../solid/ui/dom';
/**
 * Jedyna ilustracja aplikacji (DS §14, §17): stół z planszówkami widziany z góry. Płaskie
 * kształty, linie włosowe tylko w kolorze ramki. Stół, cień i ciemna kostka biorą kolory
 * z motywu, więc ilustracja działa w motywie jasnym i ciemnym. Dekoracyjna (obok jest tytuł).
 */

const PAWNS = [
  { x: 72, y: 128, fill: '#3A9D6E' },
  { x: 100, y: 108, fill: '#E09F1F' },
  { x: 128, y: 134, fill: '#FFFFFF', stroke: true },
  { x: 60, y: 92, fill: '#161A2B' },
] as const;

const CARDS = [
  { angle: -18, fill: '#E09F1F' },
  { angle: 0, fill: '#8E5BD6' },
  { angle: 18, fill: '#D9479A' },
] as const;

type PawnSpec = (typeof PAWNS)[number];

/** Pionek ze stałych danych (`PAWNS`): zwykła funkcja, bez reaktywnych propsów. */
function pawnShape(pawn: PawnSpec) {
  const { x, y, fill } = pawn;
  const stroke = 'stroke' in pawn;
  return (
    <g
      fill={fill}
      stroke={stroke ? 'var(--illu-hairline)' : undefined}
      stroke-width={stroke ? 1 : undefined}
    >
      <path
        d={`M${x - 7} ${y + 16}C${x - 7} ${y + 9} ${x - 3} ${y + 5} ${x} ${y + 5}C${x + 3} ${y + 5} ${x + 7} ${y + 9} ${x + 7} ${y + 16}Z`}
      />
      <circle cx={x} cy={y} r={5.5} />
    </g>
  );
}

export function FirstRunIllustration(props: { readonly class?: string }) {
  return (
    <svg
      class={props.class}
      viewBox="0 0 320 224"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...notFocusable}
    >
      {/* Cień i stół */}
      <ellipse cx="160" cy="208" rx="138" ry="12" fill="var(--illu-shadow)" />
      <rect
        x="16.5"
        y="16.5"
        width="287"
        height="183"
        rx="40"
        fill="var(--illu-table)"
        stroke="var(--illu-hairline)"
      />

      {/* Plansza gry (motyw okładki z DS §14) */}
      <rect x="40" y="40" width="124" height="124" rx="18" fill="#2E86AB" />
      <circle cx="128" cy="76" r="30" fill="#FFFFFF29" />
      <circle cx="70" cy="62" r="6" fill="#FFFFFF99" />
      <rect
        x="54"
        y="54"
        width="96"
        height="96"
        rx="12"
        fill="none"
        stroke="#FFFFFF59"
        stroke-width="2"
      />
      <For each={PAWNS}>{(pawn) => pawnShape(pawn)}</For>

      {/* Karteczka z wynikami (kolory z DS §15) */}
      <g transform="rotate(7 222 82)">
        <rect x="186.5" y="36.5" width="72" height="92" rx="8" fill="#FFFFFF" stroke="#E4E7F0" />
        <path d="M187 44.5a8 8 0 0 1 8-8h55a8 8 0 0 1 8 8V54H187Z" fill="#E4572E" />
        <path
          d="M198 70H246M198 84H238M198 98H246M198 112H230"
          stroke="#E4E7F0"
          stroke-width="3"
          stroke-linecap="round"
        />
        <path d="M232 64V118" stroke="#E4E7F0" stroke-width="1.5" />
      </g>

      {/* Wachlarz kart */}
      <For each={CARDS}>
        {(card) => (
          <rect
            x="232"
            y="136"
            width="30"
            height="42"
            rx="5"
            fill={card.fill}
            stroke="var(--illu-table)"
            stroke-width="1.5"
            transform={`rotate(${card.angle} 247 176)`}
          />
        )}
      </For>

      {/* Kostki */}
      <g transform="rotate(-10 180 172)">
        <rect x="166" y="158" width="28" height="28" rx="7" fill="var(--illu-die)" />
        <g fill="var(--illu-die-pip)">
          <circle cx="173" cy="165" r="2.5" />
          <circle cx="180" cy="172" r="2.5" />
          <circle cx="187" cy="179" r="2.5" />
        </g>
      </g>
      <g transform="rotate(14 211.5 179.5)">
        <rect x="200.5" y="168.5" width="22" height="22" rx="6" fill="#FFFFFF" stroke="#E4E7F0" />
        <g fill="#161A2B">
          <circle cx="206" cy="174" r="2" />
          <circle cx="217" cy="185" r="2" />
          <circle cx="206" cy="185" r="2" />
          <circle cx="217" cy="174" r="2" />
        </g>
      </g>
    </svg>
  );
}
