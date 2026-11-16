import type { SupabaseClient } from '@supabase/supabase-js';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { gameVoteTotalKey, gameVoteTotalQuery } from './gameVoteTotal';
import { meetingsKey } from '../meetings/meetings';

const ID = '00000000-0000-4000-b000-000000000001';

describe('suma głosów i odświeżenie cache', () => {
  it('pobiera tylko agregat, odróżnia zero, brak dostępu i błąd', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 0, error: null });
    const client = { rpc } as unknown as SupabaseClient;
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const query = () => cache.fetchQuery(gameVoteTotalQuery(client, ID));
    expect(await query()).toBe(0);
    expect(rpc).toHaveBeenCalledWith('game_vote_total', { game_id: ID });
    rpc.mockResolvedValue({ data: 7, error: null });
    expect(await query()).toBe(7);
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await query()).toBeNull();
    rpc.mockResolvedValue({ data: null, error: { message: 'offline' } });
    await expect(query()).rejects.toEqual({ message: 'offline' });
    expect(await cache.fetchQuery(gameVoteTotalQuery(client, 'invalid'))).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(4);
    cache.clear();
  });

  it('zmiana planu lub usunięcie spotkania unieważnia sumę tej samej gry', async () => {
    const cache = new QueryClient();
    cache.setQueryData(gameVoteTotalKey(ID), 3);
    await cache.invalidateQueries({ queryKey: meetingsKey });
    expect(cache.getQueryState(gameVoteTotalKey(ID))?.isInvalidated).toBe(true);
    cache.clear();
  });
});
