import type { JSX } from '@solidjs/web';
import { createEffect, createSignal, For, onSettled } from 'solid-js';
import { t } from '../i18n';
import { IconButton } from './Button';
import './SectionLayout.css';

export interface SectionItem {
  /** Id of the `PageSection` the link scrolls to. */
  readonly id: string;
  readonly label: string;
}

/** Part of the viewport height from the top: the section crossing it is the current one. */
const CURRENT_LINE = 0.3;
/** Fallback for browsers without `scrollend`: a link click scrolls for at most this long. */
const CLICK_SCROLL_MS = 1000;

/**
 * Page with all its sections one under another and a side menu of links to them (profile,
 * settings). The menu stays in place while the page scrolls and marks the section in view;
 * a link scrolls smoothly to its section. The back button sits on top of the menu. On the phone
 * the back button and the links are one row above the content; the links scroll sideways.
 */
export function SectionLayout(props: {
  /** Name of the section menu for screen readers. */
  readonly label: string;
  readonly items: readonly SectionItem[];
  /** Back to the previous view: a button on top of the menu. */
  readonly onBack: () => void;
  /** A narrower content column for forms, which read badly when stretched. */
  readonly narrow?: boolean;
  readonly children: JSX.Element;
}) {
  const [current, setCurrent] = createSignal(() => props.items[0]?.id ?? '');
  /** After a click the clicked link stays current until the smooth scroll ends. */
  let pinned = false;
  let nav: HTMLElement | undefined;

  // On the phone the links scroll sideways: the current one is brought to the middle of the row.
  // From 768 px the menu doesn't overflow, so this changes nothing there.
  createEffect(
    () => current(),
    (id) => {
      const link = nav?.querySelector(`a[href="#${CSS.escape(id)}"]`);
      if (!nav || !link) return;
      const box = nav.getBoundingClientRect();
      const item = link.getBoundingClientRect();
      nav.scrollTo({
        left: nav.scrollLeft + item.left - box.left - (box.width - item.width) / 2,
        behavior: 'smooth',
      });
    },
  );

  onSettled(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      if (pinned) return;
      const doc = document.documentElement;
      const scrolled = window.scrollY > 0 && doc.scrollHeight > window.innerHeight + 2;
      // At the bottom the last sections can't reach the line: the last one is current.
      if (scrolled && window.innerHeight + window.scrollY >= doc.scrollHeight - 2) {
        setCurrent(props.items.at(-1)?.id ?? '');
        return;
      }
      const line = window.innerHeight * CURRENT_LINE;
      let next = props.items[0]?.id ?? '';
      for (const item of props.items) {
        const top = document.getElementById(item.id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= line) next = item.id;
      }
      setCurrent(next);
    };
    // Scrolling changes the current section rarely: positions are read once per frame.
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
    };
  });

  const go = (event: MouseEvent, id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    setCurrent(id);
    pinned = true;
    const release = () => {
      pinned = false;
    };
    window.addEventListener('scrollend', release, { once: true });
    setTimeout(release, CLICK_SCROLL_MS);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div class={['section-layout', { 'section-layout--narrow': !!props.narrow }]}>
      <div class="section-layout__side">
        <IconButton
          icon="chevron-left"
          label={t.ui.back}
          class="section-layout__back"
          onClick={() => props.onBack()}
        />
        <nav ref={(el) => (nav = el)} class="section-layout__nav" aria-label={props.label}>
          <ul class="section-layout__links">
            <For each={props.items}>
              {(item) => (
                <li>
                  <a
                    href={`#${item.id}`}
                    class="section-layout__link"
                    aria-current={current() === item.id ? 'location' : undefined}
                    onClick={(event) => go(event, item.id)}
                  >
                    {item.label}
                  </a>
                </li>
              )}
            </For>
          </ul>
        </nav>
      </div>
      <div class="section-layout__content">{props.children}</div>
    </div>
  );
}

/** One section of a `SectionLayout` page with its heading. */
export function PageSection(props: {
  readonly id: string;
  readonly title: string;
  readonly children: JSX.Element;
}) {
  return (
    <section id={props.id} class="page-section" aria-labelledby={`${props.id}-title`}>
      <h2 id={`${props.id}-title`} class="page-section__title">
        {props.title}
      </h2>
      {props.children}
    </section>
  );
}
