import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  attachSheetImage,
  discardSheetImage,
  finishSheetImage,
  newSheetImagePath,
  uploadSheetImage,
} from './sheetImages';

const MEETING = '00000000-0000-4000-C000-000000000001';
const PLAY = '00000000-0000-4000-f000-000000000001';
const play = { id: PLAY, meeting_id: MEETING };
const noWait = { retryDelays: [0, 0], sleep: () => Promise.resolve() };

type Result = { error: unknown } | Error;

/** Klient Supabase z Storage i RPC obrazów; kolejne odpowiedzi z kolejek. */
function fakeClient(script: {
  upload?: Result[];
  attach?: ({ data: { sheet_image_path: string | null }; error: null } | { error: unknown })[];
  orphans?: string[];
}) {
  const calls = {
    uploads: [] as { path: string; type: string | undefined }[],
    attach: [] as unknown[],
    removed: [] as string[][],
    rpc: [] as string[],
  };
  const client = {
    storage: {
      from: (bucket: string) => {
        expect(bucket).toBe('sheets');
        return {
          upload: (path: string, _blob: Blob, opts: { contentType?: string }) => {
            calls.uploads.push({ path, type: opts.contentType });
            const next = script.upload?.shift() ?? { error: null };
            return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
          },
          remove: (paths: string[]) => {
            calls.removed.push(paths);
            return Promise.resolve({ data: [], error: null });
          },
        };
      },
    },
    rpc: (name: string, args: unknown) => {
      calls.rpc.push(name);
      if (name === 'orphan_sheet_images') {
        return Promise.resolve({ data: script.orphans ?? [], error: null });
      }
      calls.attach.push(args);
      const next = script.attach?.shift() ?? { error: { code: '23514' } };
      return { select: () => ({ single: () => Promise.resolve(next) }) };
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const webp = new Blob(['x'], { type: 'image/webp' });

describe('obraz karteczki', () => {
  it('nazwa: folder spotkania, partia, losowy sufiks i rozszerzenie typu', () => {
    expect(newSheetImagePath(MEETING, PLAY, 'image/webp', () => 'abcdefgh12')).toBe(
      `${MEETING.toLowerCase()}/${PLAY}-abcdefgh12.webp`,
    );
    expect(newSheetImagePath(MEETING, PLAY, 'image/png', () => 'abcdefgh12')).toMatch(/\.png$/);
    expect(newSheetImagePath(MEETING, PLAY, 'image/webp')).toMatch(
      new RegExp(`^${MEETING.toLowerCase()}/${PLAY}-[0-9a-f]{18}\\.webp$`),
    );
  });

  it('upload ponawia po błędzie sieci, każda próba pod nową nazwą', async () => {
    const { client, calls } = fakeClient({ upload: [new Error('offline'), { error: null }] });
    const path = await uploadSheetImage(client, play, webp, noWait);
    expect(calls.uploads).toHaveLength(2);
    expect(calls.uploads[0]?.path).not.toBe(calls.uploads[1]?.path);
    expect(path).toBe(calls.uploads[1]?.path);
    expect(calls.uploads[1]?.type).toBe('image/webp');
  });

  it('bez obrazu albo po ostatecznym błędzie Storage: partia bez obrazu', async () => {
    const none = fakeClient({});
    expect(await uploadSheetImage(none.client, play, null, noWait)).toBeNull();
    expect(none.calls.uploads).toHaveLength(0);
    const denied = fakeClient({ upload: [{ error: { statusCode: '403' } }] });
    expect(await uploadSheetImage(denied.client, play, webp, noWait)).toBeNull();
    expect(denied.calls.uploads).toHaveLength(1);
    const offline = fakeClient({ upload: [new Error('a'), new Error('b'), new Error('c')] });
    expect(await uploadSheetImage(offline.client, play, webp, noWait)).toBeNull();
    expect(offline.calls.uploads).toHaveLength(3);
  });

  it('dołączenie: ponowienie po sieci, naruszenie reguły kończy próby', async () => {
    const retry = fakeClient({
      attach: [{ error: {} }, { data: { sheet_image_path: 'p' }, error: null }],
    });
    expect(await attachSheetImage(retry.client, PLAY, 'p', noWait)).toBe('p');
    expect(retry.calls.attach).toEqual([
      { play_id: PLAY, image_path: 'p' },
      { play_id: PLAY, image_path: 'p' },
    ]);
    const rule = fakeClient({ attach: [{ error: { code: '23503' } }] });
    expect(await attachSheetImage(rule.client, PLAY, 'p', noWait)).toBeNull();
    expect(rule.calls.attach).toHaveLength(1);
  });

  it('po zapisie: dołącza obraz i sprząta osierocone pliki spotkania', async () => {
    const { client, calls } = fakeClient({
      attach: [{ data: { sheet_image_path: 'mine' }, error: null }],
      orphans: ['old-1', 'old-2'],
    });
    expect(await finishSheetImage(client, play, Promise.resolve('mine'), noWait)).toBe('mine');
    expect(calls.removed).toEqual([['old-1', 'old-2']]);
  });

  it('obraz był już dołączony (ponowienie): zbędny plik jest usuwany', async () => {
    const { client, calls } = fakeClient({
      attach: [{ data: { sheet_image_path: 'first' }, error: null }],
    });
    expect(await finishSheetImage(client, play, Promise.resolve('second'), noWait)).toBe('first');
    expect(calls.removed).toEqual([['second']]);
  });

  it('nieudane dołączenie albo brak uploadu nie przerywa zapisu partii', async () => {
    const failed = fakeClient({ attach: [{ error: { code: '23503' } }] });
    expect(await finishSheetImage(failed.client, play, Promise.resolve('p'), noWait)).toBeNull();
    expect(failed.calls.removed).toEqual([['p']]);
    const none = fakeClient({});
    expect(await finishSheetImage(none.client, play, Promise.resolve(null), noWait)).toBeNull();
    expect(none.calls.attach).toHaveLength(0);
    expect(none.calls.rpc).toEqual(['orphan_sheet_images']);
  });

  it('zapis nie czeka bez końca na zawieszony upload', async () => {
    const { client, calls } = fakeClient({});
    const hanging = new Promise<string | null>(() => undefined);
    expect(
      await finishSheetImage(client, play, hanging, { ...noWait, uploadWaitMs: 5 }),
    ).toBeNull();
    expect(calls.attach).toHaveLength(0);
  });

  it('anulowane podsumowanie usuwa wgrany obraz', async () => {
    const { client, calls } = fakeClient({});
    await discardSheetImage(client, Promise.resolve('p'));
    await discardSheetImage(client, Promise.resolve(null));
    expect(calls.removed).toEqual([['p']]);
  });
});
