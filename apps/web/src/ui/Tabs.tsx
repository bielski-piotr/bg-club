import type { JSX } from '@solidjs/web';
import { createUniqueId, For, Show } from 'solid-js';
import { ariaBool, type ClassValue } from './dom';
import './Choice.css';
import './Tabs.css';

export interface TabItem<T extends string> {
  readonly id: T;
  readonly label: string;
}

export interface TabsProps<T extends string> {
  /** Etykieta listy zakładek dla czytnika ekranu. */
  readonly label: string;
  readonly items: readonly TabItem<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  /** Treść aktywnej zakładki (renderowana w `role="tabpanel"`). */
  readonly children?: ((value: T) => JSX.Element) | undefined;
  readonly class?: ClassValue;
}

/**
 * Zakładki-pigułki: aktywna ciemna, nieaktywne z ramką.
 * Wzorzec WAI-ARIA Tabs z automatyczną aktywacją: strzałki, Home i End zmieniają zakładkę,
 * fokus jest tylko na aktywnej (roving tabindex).
 */
export function Tabs<T extends string>(props: TabsProps<T>) {
  const id = createUniqueId();
  const tabId = (item: T) => `${id}-tab-${item}`;
  const panelId = `${id}-panel`;
  const buttons = new Map<T, HTMLButtonElement>();

  const focusAt = (index: number) => {
    const item = props.items[(index + props.items.length) % props.items.length];
    if (!item) return;
    props.onChange(item.id);
    buttons.get(item.id)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const index = props.items.findIndex((i) => i.id === props.value);
    const keys: Record<string, () => void> = {
      ArrowRight: () => focusAt(index + 1),
      ArrowLeft: () => focusAt(index - 1),
      // Tab lists laid out vertically by CSS (side navigation) move with Up and Down.
      ArrowDown: () => focusAt(index + 1),
      ArrowUp: () => focusAt(index - 1),
      Home: () => focusAt(0),
      End: () => focusAt(props.items.length - 1),
    };
    const action = keys[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  };

  return (
    <div class={['tabs', props.class]}>
      <div role="tablist" aria-label={props.label} class="pills tabs__list" onKeyDown={onKeyDown}>
        <For each={props.items}>
          {(item) => (
            <button
              ref={(el) => buttons.set(item.id, el)}
              type="button"
              role="tab"
              id={tabId(item.id)}
              aria-selected={ariaBool(item.id === props.value)}
              aria-controls={props.children ? panelId : undefined}
              tabindex={item.id === props.value ? 0 : -1}
              class="pill"
              onClick={() => props.onChange(item.id)}
            >
              {item.label}
            </button>
          )}
        </For>
      </div>
      <Show when={props.children}>
        {(render) => (
          <div
            role="tabpanel"
            id={panelId}
            aria-labelledby={tabId(props.value)}
            class="tabs__panel"
            tabindex={0}
          >
            {render()(props.value)}
          </div>
        )}
      </Show>
    </div>
  );
}
