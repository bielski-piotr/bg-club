/** @jsxImportSource @solidjs/web */
import type { JSX } from '@solidjs/web';
import { render } from '@solidjs/testing-library';
import { Bridge } from './Bridge';
import type { IslandHost } from './context';

/** Render komponentu Solid w teście z kontekstami jak w wyspie (`host` jak z `SolidIsland`). */
export function renderSolid(
  ui: () => JSX.Element,
  host: IslandHost = {},
): ReturnType<typeof render> {
  return render(() => <Bridge providers={host}>{ui()}</Bridge>);
}
