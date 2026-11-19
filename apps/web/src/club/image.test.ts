import { describe, expect, it } from 'vitest';
import {
  encodeWithin,
  fitWithin,
  IMAGE_QUALITIES,
  IMAGE_TARGET_BYTES,
  ImageScaleError,
  scaleImage,
} from './image';

describe('skalowanie logo', () => {
  it('zmniejsza dłuższy bok do limitu i zachowuje proporcje', () => {
    expect(fitWithin(1600, 1200, 800)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(900, 3000, 800)).toEqual({ width: 240, height: 800 });
    expect(fitWithin(5000, 2, 800)).toEqual({ width: 800, height: 1 });
  });

  it('nie powiększa małych obrazów', () => {
    expect(fitWithin(120, 80, 800)).toEqual({ width: 120, height: 80 });
  });

  it('odrzuca pliki, które nie są WebP, JPEG ani PNG', async () => {
    const gif = new File(['GIF89a'], 'logo.gif', { type: 'image/gif' });
    await expect(scaleImage(gif)).rejects.toEqual(new ImageScaleError('type'));
  });
});

describe('kompresja do ok. 100 KB', () => {
  const blob = (type: string, size: number) => new Blob([new Uint8Array(size)], { type });

  it('wybiera najwyższą jakość WebP mieszczącą się w celu', async () => {
    const sizes = new Map([
      [0.86, 180_000],
      [0.78, 130_000],
      [0.7, 95_000],
    ]);
    const asked: number[] = [];
    const result = await encodeWithin(async (type, quality) => {
      asked.push(quality);
      return blob(type, sizes.get(quality) ?? 50_000);
    }, IMAGE_TARGET_BYTES);
    expect(result?.type).toBe('image/webp');
    expect(result?.size).toBe(95_000);
    expect(asked).toEqual([0.86, 0.78, 0.7]);
  });

  it('bez kodera WebP używa JPEG', async () => {
    const result = await encodeWithin(
      async (type) => (type === 'image/webp' ? blob('image/png', 900_000) : blob(type, 60_000)),
      IMAGE_TARGET_BYTES,
    );
    expect(result?.type).toBe('image/jpeg');
  });

  it('logo bez kodera WebP zostaje PNG (przezroczystość)', async () => {
    const asked: string[] = [];
    const result = await encodeWithin(
      async (type) => {
        asked.push(type);
        return type === 'image/webp' ? blob('image/png', 900_000) : blob(type, 300_000);
      },
      IMAGE_TARGET_BYTES,
      'image/png',
    );
    expect(result?.type).toBe('image/png');
    expect(asked).toEqual(['image/webp', 'image/png']);
  });

  it('gdy nawet najniższa jakość jest za duża, zwraca najmniejszy plik', async () => {
    const result = await encodeWithin(
      async (type, quality) => blob(type, Math.round(quality * 1_000_000)),
      IMAGE_TARGET_BYTES,
    );
    expect(result?.type).toBe('image/webp');
    expect(result?.size).toBe(Math.round((IMAGE_QUALITIES.at(-1) ?? 0) * 1_000_000));
  });
});
