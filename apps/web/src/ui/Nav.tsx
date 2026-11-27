import { For } from 'solid-js';
import type { ClassValue } from './dom';
import { Icon, type IconName } from './Icon';
import './hover.css';
import './Nav.css';

export interface NavItem {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  /** Without an address the link is a placeholder for a view that doesn't exist yet. */
  readonly href?: string | undefined;
  readonly current?: boolean | undefined;
}

/** Navigation links with an icon; the hover state matches the menu items (hover.css). */
export function Nav(props: {
  readonly label: string;
  readonly items: readonly NavItem[];
  readonly class?: ClassValue;
}) {
  return (
    <nav class={['nav', props.class]} aria-label={props.label}>
      <For each={props.items}>
        {(item) => (
          <a
            class="nav__link hoverable"
            href={item.href}
            aria-current={item.current ? 'page' : undefined}
          >
            <Icon name={item.icon} size={20} />
            {item.label}
          </a>
        )}
      </For>
    </nav>
  );
}
