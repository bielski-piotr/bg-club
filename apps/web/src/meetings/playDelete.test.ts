import type { SupabaseClient } from '@supabase/supabase-js';
import { QueryClient } from '@tanstack/query-core';
import { describe, expect, it } from 'vitest';
import { gamesKey } from '../games/games';
import { meetingsKey } from './meetings';
import {
  deletePlay,
  invalidatePlayData,
  PlayDeleteError,
  playDeleteFailure,
  removeDeletedPlayImage,
} from './playDelete';

const PLAY = '00000000-0000-4000-f000-000000000001';
const IMAGE = `00000000-0000-4000-c000-000000000001/${PLAY}-aaaaaaaaaaaa.webp`;

type RpcResult = { data: unknown; error: null } | { data: null; error: Record<string, string> };
type RemoveResult = { data: unknown[] | null; error: unknown } | Error;

function fakeClient(script: { rpc?: RpcResult; remove?: RemoveResult }) {
  const calls = { rpc: [] as [string, unknown][], removed: [] as string[][] };
  const client = {
    rpc: (name: string, args: unknown) => {
      calls.rpc.push([name, args]);
      return Promise.resolve(script.rpc ?? { data: null, error: null });
    },
    storage: {
      from: (bucket: string) => {
        expect(bucket).toBe('sheets');
        return {
          remove: (paths: string[]) => {
            calls.removed.push(paths);
            const next = script.remove ?? { data: [{ name: paths[0] }], error: null };
            return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
          },
        };
      },
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe('deletePlay (VIEW-6, §5.6.5)', () => {
  it('wywołuje delete_play i zwraca ścieżkę obrazu do sprzątania', async () => {
    const { client, calls } = fakeClient({ rpc: { data: IMAGE, error: null } });
    await expect(deletePlay(client, PLAY)).resolves.toEqual({ imagePath: IMAGE, deleted: true });
    expect(calls.rpc).toEqual([['delete_play', { play_id: PLAY }]]);
  });

  it('partia bez obrazu', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: null } });
    await expect(deletePlay(client, PLAY)).resolves.toEqual({ imagePath: null, deleted: true });
  });

  it('partii już nie ma (ponowienie, druga karta): sukces bez przywracania wyniku', async () => {
    const { client } = fakeClient({
      rpc: { data: null, error: { code: 'P0002', hint: 'plays_not_found' } },
    });
    await expect(deletePlay(client, PLAY)).resolves.toEqual({ imagePath: null, deleted: false });
  });

  it('błędy: brak uprawnień, szkic, serwer', async () => {
    for (const [error, reason] of [
      [{ code: '42501' }, 'forbidden'],
      [{ code: '23514', hint: 'plays_not_saved' }, 'draft'],
      [{ code: '500' }, 'server'],
      [{ message: 'Failed to fetch' }, 'server'],
    ] as const) {
      const { client } = fakeClient({ rpc: { data: null, error } });
      const failure = await deletePlay(client, PLAY).catch((e: unknown) => e);
      expect(failure).toBeInstanceOf(PlayDeleteError);
      expect((failure as PlayDeleteError).reason).toBe(reason);
    }
    expect(playDeleteFailure({ code: '42501', hint: 'plays_not_saved' })).toBe('forbidden');
  });
});

describe('removeDeletedPlayImage', () => {
  it('usuwa obraz z bucketu sheets', async () => {
    const { client, calls } = fakeClient({});
    await expect(removeDeletedPlayImage(client, IMAGE)).resolves.toBe(true);
    expect(calls.removed).toEqual([[IMAGE]]);
  });

  it('pliku już nie ma: sukces', async () => {
    const { client } = fakeClient({ remove: { data: [], error: null } });
    await expect(removeDeletedPlayImage(client, IMAGE)).resolves.toBe(true);
  });

  it('błąd Storage albo sieci: false (można ponowić)', async () => {
    for (const remove of [{ data: null, error: { message: 'boom' } }, new Error('offline')]) {
      const { client } = fakeClient({ remove });
      await expect(removeDeletedPlayImage(client, IMAGE)).resolves.toBe(false);
    }
  });
});

describe('invalidatePlayData', () => {
  it('unieważnia spotkania, kolekcję i profile (bez własnego), bez innych widoków', async () => {
    const queryClient = new QueryClient();
    const keys = [
      [...meetingsKey, 'plays', 'm1'],
      [...meetingsKey, 'game-sheets', 'g1'],
      [...gamesKey, 'widget'],
      ['profiles', 'byId', 'p1'],
      ['profiles', 'own', 'p1'],
      ['club'],
      ['scorepads'],
    ];
    for (const key of keys) queryClient.setQueryData(key, 1);
    await invalidatePlayData(queryClient);
    const stale = keys.map((key) => queryClient.getQueryState(key)?.isInvalidated);
    expect(stale).toEqual([true, true, true, true, false, false, false]);
  });
});
