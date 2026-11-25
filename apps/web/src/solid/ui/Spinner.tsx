/** @jsxImportSource @solidjs/web */
import { Show } from 'solid-js';
import { notFocusable, type ClassValue } from './dom';
import '../../ui/Feedback.css';

export interface SpinnerProps {
  readonly size?: number | undefined;
  /** Gdy podany, spinner jest ogłaszany jako `role="status"`; bez niego jest dekoracyjny. */
  readonly label?: string | undefined;
  readonly class?: ClassValue;
}

/** Wskaźnik ładowania w kolorze tekstu rodzica. */
export function Spinner(props: SpinnerProps) {
  const svg = () => (
    <svg
      class={['spinner', props.class]}
      width={props.size ?? 20}
      height={props.size ?? 20}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      {...notFocusable}
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-opacity="0.25" stroke-width="2" />
      <path d="M14 8A6 6 0 0 0 8 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
  );
  return (
    <Show when={props.label} fallback={svg()}>
      {(label) => (
        <span role="status" class="spinner-status">
          {svg()}
          <span class="sr-only">{label()}</span>
        </span>
      )}
    </Show>
  );
}
