import { describe, expect, it } from 'vitest';
import { fitWithin, ImageScaleError, scaleImage } from './image';

describe('skalowanie logo (CLUB-2, GAME-6)', () => {
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
