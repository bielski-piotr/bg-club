import { describe, expect, it } from 'vitest';
import { clipboardImage } from './cover';
import { newCoverSourcePath, unusedCoverFiles } from './games';

describe('okładka z kadrem (GAME-6)', () => {
  it('usuwa po zapisie tylko pliki, których nowa okładka nie używa', () => {
    // Nowy obraz: znikają stara okładka i stary oryginał.
    expect(
      unusedCoverFiles(['games/a.webp', 'games/a-src.webp'], ['games/b.webp', 'games/b-src.webp']),
    ).toEqual(['games/a.webp', 'games/a-src.webp']);
    // Zmiana kadru: oryginał zostaje.
    expect(
      unusedCoverFiles(['games/a.webp', 'games/a-src.webp'], ['games/c.webp', 'games/a-src.webp']),
    ).toEqual(['games/a.webp']);
    // Kadr okładki sprzed kadrowania: dawna okładka staje się oryginałem i zostaje.
    expect(unusedCoverFiles(['games/a.webp', null], ['games/c.webp', 'games/a.webp'])).toEqual([]);
    expect(unusedCoverFiles([null, null], [null, null])).toEqual([]);
  });

  it('oryginał ma osobną, zawsze nową nazwę', () => {
    expect(newCoverSourcePath('g', 'webp')).toMatch(/^games\/g-source-[0-9a-f-]{36}\.webp$/);
  });

  it('bierze pierwszy obraz ze schowka, pomija tekst', () => {
    const image = new File(['x'], 'obraz.png', { type: 'image/png' });
    const data = {
      items: [
        { kind: 'string', type: 'text/plain', getAsFile: () => null },
        { kind: 'file', type: 'image/png', getAsFile: () => image },
      ],
    } as unknown as DataTransfer;
    expect(clipboardImage(data)).toBe(image);
    expect(clipboardImage({ items: [] } as unknown as DataTransfer)).toBeNull();
    expect(clipboardImage(null)).toBeNull();
  });
});
