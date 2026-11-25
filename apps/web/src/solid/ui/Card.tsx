/** @jsxImportSource @solidjs/web */
import type { JSX } from '@solidjs/web';
import { createUniqueId, Show } from 'solid-js';
import { createSlot, type ClassValue } from './dom';
import { Icon } from './Icon';
import '../../ui/Card.css';

export interface CardProps {
  readonly title: string;
  /** Licznik obok tytułu, np. „12 osób”. */
  readonly count?: string | undefined;
  /** Element po prawej w nagłówku: link „Zobacz więcej”, odliczanie, chip „Trwa”. */
  readonly action?: JSX.Element | undefined;
  readonly children: JSX.Element;
  /** Poziom nagłówka tytułu (domyślnie h2). */
  readonly headingLevel?: 2 | 3 | undefined;
  readonly class?: ClassValue;
}

/**
 * Karta widżetu (DS §6): biała, ramka #E4E7F0, promień 28/24, padding 28/16, cień karty.
 * Szerokość wyznacza rodzic (520 desktop / 343 telefon).
 */
export function Card(props: CardProps) {
  const id = createUniqueId();
  const action = createSlot(() => props.action);
  return (
    <section class={['card', props.class]} aria-labelledby={id}>
      <header class="card__header">
        <div class="card__title-group">
          <Show
            when={props.headingLevel === 3}
            fallback={
              <h2 id={id} class="card__title">
                {props.title}
              </h2>
            }
          >
            <h3 id={id} class="card__title">
              {props.title}
            </h3>
          </Show>
          <Show when={props.count}>
            <span class="card__count">{props.count}</span>
          </Show>
        </div>
        <Show when={action()}>
          <div class="card__action">{action()}</div>
        </Show>
      </header>
      {props.children}
    </section>
  );
}

export interface TrayProps {
  readonly children: JSX.Element;
  /** Etykieta listy dla czytnika ekranu. */
  readonly label?: string | undefined;
  readonly class?: ClassValue;
}

/** Taca listy (DS §6): tło #F1F3F9, promień 22, padding 10, odstęp 6. Dzieci: `ListRow`. */
export function Tray(props: TrayProps) {
  return (
    <ul class={['tray', props.class]} aria-label={props.label}>
      {props.children}
    </ul>
  );
}

export interface ListRowProps {
  /** Element na początku: pozycja, awatar, miniatura, checkbox. */
  readonly leading?: JSX.Element | undefined;
  readonly title: JSX.Element;
  readonly meta?: JSX.Element | undefined;
  /** Element na końcu: wynik, badge, przycisk ⋯. */
  readonly trailing?: JSX.Element | undefined;
  /** 54 (ranking, gry) albo 64 (członkowie w popupie), DS §6–§7. */
  readonly height?: 54 | 64 | undefined;
  /** Wiersz bieżącego użytkownika: tło akcentu, biały tekst (DS §6). */
  readonly highlighted?: boolean | undefined;
  /** Wyszarzony wiersz (np. usunięty członek). */
  readonly muted?: boolean | undefined;
  /** Cały wiersz jest przyciskiem (otwiera szczegóły); dodaje strzałkę. */
  readonly onClick?: ((event: MouseEvent) => void) | undefined;
}

export function ListRow(props: ListRowProps) {
  const leading = createSlot(() => props.leading);
  const meta = createSlot(() => props.meta);
  const trailing = createSlot(() => props.trailing);
  const body = () => (
    <>
      <Show when={leading()}>
        <span class="row__leading">{leading()}</span>
      </Show>
      <span class="row__text">
        <span class="row__title">{props.title}</span>
        <Show when={meta()}>
          <span class="row__meta">{meta()}</span>
        </Show>
      </span>
      <Show when={trailing()}>
        <span class="row__trailing">{trailing()}</span>
      </Show>
      <Show when={props.onClick}>
        <Icon name="chevron-right" class="row__chevron" />
      </Show>
    </>
  );
  const classes = () => [
    'row',
    `row--${props.height ?? 54}`,
    {
      'row--highlighted': !!props.highlighted,
      'row--muted': !!props.muted,
      'row--interactive': !!props.onClick,
    },
  ];
  return (
    <li class="tray__item">
      <Show when={props.onClick} fallback={<div class={classes()}>{body()}</div>}>
        <button type="button" class={classes()} onClick={(event) => props.onClick?.(event)}>
          {body()}
        </button>
      </Show>
    </li>
  );
}
