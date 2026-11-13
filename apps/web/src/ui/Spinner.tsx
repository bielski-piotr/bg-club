import { cx } from './cx';
import './Feedback.css';

export interface SpinnerProps {
  readonly size?: number | undefined;
  /** Gdy podany, spinner jest ogłaszany jako `role="status"`; bez niego jest dekoracyjny. */
  readonly label?: string | undefined;
  readonly className?: string | undefined;
}

/** Wskaźnik ładowania w kolorze tekstu rodzica. */
export function Spinner({ size = 20, label, className }: SpinnerProps) {
  const svg = (
    <svg
      className={cx('spinner', className)}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8A6 6 0 0 0 8 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
  if (!label) return svg;
  return (
    <span role="status" className="spinner-status">
      {svg}
      <span className="sr-only">{label}</span>
    </span>
  );
}
