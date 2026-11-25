import { describe, expect, it } from 'vitest';
import { SOLID_DIRS } from '../../solid-files.js';

// Migracja na Solid 2.0 (docs/solidjs-2-migration.md): Vite i ESLint wybierają kod Solid po
// katalogu (`solid-files.js`), a TypeScript po dyrektywie typów JSX na początku pliku. Oba
// podziały muszą się zgadzać, inaczej plik Solid dostałby typy Reacta albo odwrotnie.
const PRAGMA = '/** @jsxImportSource @solidjs/web */';

const sources = import.meta.glob<string>('../**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const files = Object.entries(sources).map(([path, text]) => ({
  path,
  solid: SOLID_DIRS.includes(path.split('/')[1] ?? ''),
  pragma: text.startsWith(PRAGMA),
}));

describe('pliki Solid i React', () => {
  it('skanuje pliki z obu światów', () => {
    expect(files.some((f) => f.solid)).toBe(true);
    expect(files.some((f) => !f.solid)).toBe(true);
  });

  it('każdy plik .tsx w katalogu Solid zaczyna się od dyrektywy @solidjs/web', () => {
    expect(files.filter((f) => f.solid && !f.pragma).map((f) => f.path)).toEqual([]);
  });

  it('pliki React nie mają dyrektywy @solidjs/web', () => {
    expect(files.filter((f) => !f.solid && f.pragma).map((f) => f.path)).toEqual([]);
  });
});
