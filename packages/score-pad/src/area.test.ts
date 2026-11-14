import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MIN_AREA_POINTS,
  areaCorners,
  areaShape,
  areaValid,
  convexHull,
  fullArea,
  insertPoint,
  limitPoints,
  orderQuad,
  removePoint,
  rotatePoint,
  smoothRing,
  toPhotoRing,
  toSheetRing,
} from './editor/area';
import { Persp, dataUrlBytes, encodeSheet, sheetSize, type Pt, type Quad } from './editor/photo';

/*
 * Obszar kartki (EDT-10, zadanie [017]): wielokąt na zdjęciu → narożniki do prostowania
 * perspektywy i kształt kartki. Próbki: zaokrąglone rogi, wycięcia i zdjęcie perspektywiczne.
 */

/** Prostokąt z zaokrąglonymi rogami (promień r, `seg` punktów na łuk). */
function roundedRect(x0: number, y0: number, x1: number, y1: number, r: number, seg = 6): Pt[] {
  const out: Pt[] = [];
  const corners: [number, number, number][] = [
    [x0 + r, y0 + r, Math.PI],
    [x1 - r, y0 + r, -Math.PI / 2],
    [x1 - r, y1 - r, 0],
    [x0 + r, y1 - r, Math.PI / 2],
  ];
  for (const [cx, cy, a0] of corners)
    for (let k = 0; k <= seg; k++) {
      const a = a0 + (k / seg) * (Math.PI / 2);
      out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
  return out;
}

/** Punkty kartki (u, v) przeniesione na zdjęcie przez perspektywę `quad`. */
const onPhoto = (quad: Quad, uv: [number, number][]): Pt[] => {
  const P = new Persp(quad);
  return uv.map(([u, v]) => P.toPhoto(u, v));
};

const near = (a: Pt, b: Pt, tol: number) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;

describe('narożniki z obszaru', () => {
  it('prostokąt daje swoje narożniki w kolejności LG, PG, PD, LD', () => {
    const area = [
      { x: 400, y: 300 },
      { x: 100, y: 300 },
      { x: 100, y: 50 },
      { x: 400, y: 50 },
    ];
    expect(areaCorners(area, 1000, 800)).toEqual([
      { x: 100, y: 50 },
      { x: 400, y: 50 },
      { x: 400, y: 300 },
      { x: 100, y: 300 },
    ]);
  });

  it('zaokrąglone rogi: narożnik to przecięcie przedłużonych boków, nie punkt na łuku', () => {
    const area = roundedRect(100, 80, 700, 980, 60);
    const q = areaCorners(area, 1000, 1200);
    const want = [
      { x: 100, y: 80 },
      { x: 700, y: 80 },
      { x: 700, y: 980 },
      { x: 100, y: 980 },
    ];
    q.forEach((p, i) => expect(near(p, want[i] as Pt, 3)).toBe(true));
  });

  it('wycięcie w boku nie przesuwa narożników', () => {
    const area: Pt[] = [
      { x: 50, y: 50 },
      { x: 250, y: 50 },
      { x: 280, y: 120 },
      { x: 320, y: 120 },
      { x: 350, y: 50 },
      { x: 550, y: 50 },
      { x: 550, y: 450 },
      { x: 50, y: 450 },
    ];
    expect(areaCorners(area, 800, 600)).toEqual([
      { x: 50, y: 50 },
      { x: 550, y: 50 },
      { x: 550, y: 450 },
      { x: 50, y: 450 },
    ]);
  });

  it('zdjęcie perspektywiczne z zaokrąglonymi rogami: narożniki trapezu', () => {
    const quad: Quad = [
      { x: 220, y: 140 },
      { x: 780, y: 180 },
      { x: 900, y: 1050 },
      { x: 120, y: 1000 },
    ];
    // zaokrąglone rogi kartki w jej układzie (r = 6% krótszego boku)
    const uv = roundedRect(0, 0, 1, 1, 0.06, 8).map((p) => [p.x, p.y] as [number, number]);
    const q = areaCorners(onPhoto(quad, uv), 1000, 1200);
    q.forEach((p, i) => expect(near(p, quad[i] as Pt, 6)).toBe(true));
  });

  it('narożniki prawie w rogach zdjęcia to całe zdjęcie (skan, kartka już wyprostowana)', () => {
    const area = [
      { x: 6, y: 4 },
      { x: 995, y: 3 },
      { x: 994, y: 797 },
      { x: 4, y: 796 },
    ];
    expect(areaCorners(area, 1000, 800)).toEqual(fullArea(1000, 800));
  });

  it('trójkąt i obszar zdegenerowany prostuje się według prostokąta opisanego', () => {
    const tri = [
      { x: 100, y: 100 },
      { x: 500, y: 120 },
      { x: 300, y: 500 },
    ];
    expect(areaCorners(tri, 1000, 1000)).toEqual([
      { x: 100, y: 100 },
      { x: 500, y: 100 },
      { x: 500, y: 500 },
      { x: 100, y: 500 },
    ]);
    const line = [
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 30, y: 10 },
    ];
    expect(areaCorners(line, 100, 100)).toEqual(fullArea(100, 100));
  });

  it('otoczka i kolejność narożników nie zależą od kolejności punktów', () => {
    const pts = [
      { x: 5, y: 5 },
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    expect(convexHull(pts)).toHaveLength(4);
    expect(orderQuad(convexHull(pts))[0]).toEqual({ x: 0, y: 0 });
  });
});

describe('kształt kartki z obszaru', () => {
  it('prostokątna kartka nie ma kształtu (zwykły prostokąt)', () => {
    const quad: Quad = [
      { x: 220, y: 140 },
      { x: 780, y: 180 },
      { x: 900, y: 1050 },
      { x: 120, y: 1000 },
    ];
    expect(areaShape(quad, [], quad, 0)).toBeUndefined();
  });

  it('wycięcie zostaje w obrysie kartki po wyprostowaniu perspektywy', () => {
    const quad: Quad = [
      { x: 200, y: 100 },
      { x: 800, y: 160 },
      { x: 880, y: 1000 },
      { x: 120, y: 980 },
    ];
    const uv: [number, number][] = [
      [0, 0],
      [0.4, 0],
      [0.45, 0.1],
      [0.55, 0.1],
      [0.6, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const area = onPhoto(quad, uv);
    const shape = areaShape(area, [], areaCorners(area, 1000, 1100), 0);
    expect(shape?.outline).toHaveLength(8);
    shape?.outline.forEach(([u, v], i) => {
      expect(u).toBeCloseTo((uv[i] as [number, number])[0], 2);
      expect(v).toBeCloseTo((uv[i] as [number, number])[1], 2);
    });
  });

  it('otwory przechodzą do kształtu; zbyt małe są pomijane', () => {
    const q = fullArea(100, 100) as Quad;
    const hole = [
      { x: 40, y: 40 },
      { x: 60, y: 40 },
      { x: 60, y: 60 },
      { x: 40, y: 60 },
    ];
    const dot = [
      { x: 10, y: 10 },
      { x: 10.5, y: 10 },
      { x: 10.5, y: 10.5 },
    ];
    const s = areaShape(q, [hole, dot], q, 0);
    expect(s?.holes).toHaveLength(1);
    expect(s?.outline).toHaveLength(4);
  });

  it('pierścień kartki → zdjęcie → kartka wraca do tych samych punktów', () => {
    const quad: Quad = [
      { x: 10, y: 20 },
      { x: 300, y: 5 },
      { x: 320, y: 410 },
      { x: 0, y: 400 },
    ];
    const ring: [number, number][] = [
      [0.1, 0.2],
      [0.9, 0.1],
      [0.8, 0.95],
    ];
    expect(toSheetRing(toPhotoRing(ring, quad), quad)).toEqual(ring);
  });
});

describe('wygładzanie krawędzi', () => {
  const square: [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];

  it('siła 0 nie zmienia obrysu', () => {
    expect(smoothRing(square, 0)).toEqual(square);
  });

  it('dodaje punkty pośrednie, zaokrągla rogi i zostaje w kartce', () => {
    const soft = smoothRing(square, 4);
    expect(soft.length).toBeGreaterThan(12);
    expect(soft.some(([u, v]) => u === 0 && v === 0)).toBe(false);
    for (const [u, v] of soft) {
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('większa siła mocniej zaokrągla róg', () => {
    const cornerGap = (r: [number, number][]) => Math.min(...r.map(([u, v]) => Math.hypot(u, v)));
    expect(cornerGap(smoothRing(square, 9))).toBeGreaterThan(cornerGap(smoothRing(square, 2)));
  });

  it('wygładzony prostokąt ma już kształt (zaokrąglone rogi)', () => {
    const q = fullArea(200, 300) as Quad;
    expect(areaShape(q, [], q, 5)?.outline.length).toBeGreaterThan(8);
  });
});

describe('edycja punktów', () => {
  const area: Pt[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  it('kliknięcie przy krawędzi wstawia punkt na krawędzi', () => {
    const r = insertPoint(area, { x: 50, y: 3 }, 8);
    expect(r?.index).toBe(1);
    expect(r?.area[1]).toEqual({ x: 50, y: 0 });
    expect(r?.area).toHaveLength(5);
    expect(insertPoint(area, { x: 50, y: 50 }, 8)).toBeNull();
  });

  it('usuwa punkt, ale zostawia co najmniej trzy', () => {
    const three = removePoint(area, 0);
    expect(three).toHaveLength(MIN_AREA_POINTS);
    expect(removePoint(three as Pt[], 0)).toBeNull();
  });

  it('obrót o 90° w prawo i z powrotem wraca do punktu', () => {
    const p = { x: 30, y: 70 };
    const r = rotatePoint(p, 400, 300, 1);
    expect(r).toEqual({ x: 230, y: 30 });
    expect(rotatePoint(r, 300, 400, -1)).toEqual(p);
  });

  it('obszar musi mieć pole', () => {
    expect(areaValid(area, 100, 100)).toBe(true);
    expect(
      areaValid(
        [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
          { x: 100, y: 0 },
        ],
        100,
        100,
      ),
    ).toBe(false);
  });

  it('wynik wykrywania ma ograniczoną liczbę punktów', () => {
    const many = roundedRect(0, 0, 1000, 800, 120, 60);
    const few = limitPoints(many, 24, Math.hypot(1000, 800));
    expect(few.length).toBeLessThanOrEqual(24);
    expect(few.length).toBeGreaterThanOrEqual(8);
  });
});

describe('rozdzielczość i zapis kartki (EDT-12)', () => {
  afterEach(() => vi.restoreAllMocks());

  const rect = (w: number, h: number): Quad => fullArea(w, h) as Quad;

  it('dłuższy bok jak na zdjęciu źródłowym, bez powiększania małego źródła', () => {
    expect(sheetSize(rect(800, 600), 4 / 3)).toEqual({ w: 800, h: 600 });
    expect(sheetSize(rect(3000, 4000), 0.75)).toEqual({ w: 3000, h: 4000 });
  });

  it('dłuższy bok najwyżej 4096 px; proporcje z rozmiaru w centymetrach', () => {
    expect(sheetSize(rect(6000, 8000), 10.5 / 14.8)).toEqual({ w: 2906, h: 4096 });
    expect(sheetSize(rect(8000, 6000), 2)).toEqual({ w: 4096, h: 2048 });
  });

  it('bajty pliku z data URL', () => {
    expect(dataUrlBytes('data:image/jpeg;base64,AAAA')).toBe(3);
    expect(dataUrlBytes('data:image/jpeg;base64,AAA=')).toBe(2);
  });

  const fakeCanvas = (w: number, h: number, webp: boolean) => {
    const toDataURL = vi.fn((type: string) =>
      type === 'image/webp' && !webp ? 'data:image/png;base64,AAAA' : `data:${type};base64,AAAA`,
    );
    return {
      canvas: { width: w, height: h, toDataURL } as unknown as HTMLCanvasElement,
      toDataURL,
    };
  };

  it('WebP o jakości 0,92, a bez WebP w przeglądarce JPEG 0,92', () => {
    const a = fakeCanvas(4096, 3072, true);
    expect(encodeSheet(a.canvas)).toBe('data:image/webp;base64,AAAA');
    expect(a.toDataURL).toHaveBeenCalledWith('image/webp', 0.92);
    const b = fakeCanvas(4096, 3072, false);
    expect(encodeSheet(b.canvas)).toBe('data:image/jpeg;base64,AAAA');
    expect(b.toDataURL).toHaveBeenLastCalledWith('image/jpeg', 0.92);
  });

  it('za duży plik zmniejsza wymiary, a nie jakość', () => {
    const sizes: number[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: () => undefined,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (
      this: HTMLCanvasElement,
      type?: string,
      quality?: unknown,
    ) {
      sizes.push(this.width);
      expect(quality).toBe(0.92);
      // „plik” rośnie z liczbą pikseli: 1 bajt na piksel
      return `data:${type};base64,${'A'.repeat(Math.round((this.width * this.height * 4) / 3))}`;
    });
    const big = { width: 4096, height: 3072, toDataURL: HTMLCanvasElement.prototype.toDataURL };
    const url = encodeSheet(big as unknown as HTMLCanvasElement, 4096 * 3072 * 0.6);
    expect(dataUrlBytes(url)).toBeLessThanOrEqual(4096 * 3072 * 0.6);
    expect(sizes[0]).toBe(4096);
    expect(sizes.at(-1)).toBeLessThan(4096);
  });
});
