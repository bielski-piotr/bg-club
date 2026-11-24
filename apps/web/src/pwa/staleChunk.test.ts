import { describe, expect, it, vi } from 'vitest';
import { importOrReload, STALE_RELOAD_KEY, STALE_RELOAD_WINDOW_MS } from './staleChunk';
import { PwaStore } from './updates';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

const failing = () => Promise.reject(new TypeError('Failed to fetch dynamically imported module'));

describe('importOrReload', () => {
  it('passes through a successful import', async () => {
    const reload = vi.fn();
    await expect(importOrReload(() => Promise.resolve(42), { reload })()).resolves.toBe(42);
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads once when a chunk from the previous deploy is missing', async () => {
    const reload = vi.fn();
    const storage = memoryStorage();
    const options = { reload, storage, now: () => 1000, online: () => true, store: new PwaStore() };
    void importOrReload(failing, options)();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(storage.getItem(STALE_RELOAD_KEY)).toBe('1000');
    // Second failure right after the reload: show the error instead of looping.
    await expect(importOrReload(failing, options)()).rejects.toThrow(TypeError);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads again after the guard window', async () => {
    const reload = vi.fn();
    const storage = memoryStorage();
    storage.setItem(STALE_RELOAD_KEY, '1000');
    void importOrReload(failing, {
      reload,
      storage,
      now: () => 1000 + STALE_RELOAD_WINDOW_MS,
      online: () => true,
      store: new PwaStore(),
    })();
    await vi.waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it('does not reload offline or with an unsaved draft', async () => {
    const reload = vi.fn();
    const base = { reload, now: () => 1000, store: new PwaStore() };
    await expect(
      importOrReload(failing, { ...base, storage: memoryStorage(), online: () => false })(),
    ).rejects.toThrow();
    const busy = new PwaStore();
    busy.setDraft('play-1', true);
    await expect(
      importOrReload(failing, {
        ...base,
        store: busy,
        storage: memoryStorage(),
        online: () => true,
      })(),
    ).rejects.toThrow();
    expect(reload).not.toHaveBeenCalled();
  });
});
