import { afterEach, describe, expect, it } from 'vitest';
import {
  applyTheme,
  readStoredPreference,
  resolveTheme,
  storePreference,
  THEME_STORAGE_KEY,
} from './theme';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data,
  };
}

describe('preferencja motywu', () => {
  it('domyślnie systemowa, także przy nieznanej wartości lub błędzie pamięci', () => {
    expect(readStoredPreference(memoryStorage())).toBe('system');
    expect(readStoredPreference(memoryStorage({ [THEME_STORAGE_KEY]: 'sepia' }))).toBe('system');
    expect(
      readStoredPreference({
        getItem: () => {
          throw new Error('SecurityError');
        },
      }),
    ).toBe('system');
  });

  it('zapisuje jasny i ciemny, a systemowy usuwa wpis', () => {
    const storage = memoryStorage();
    storePreference(storage, 'dark');
    expect(readStoredPreference(storage)).toBe('dark');
    storePreference(storage, 'system');
    expect(storage.data.has(THEME_STORAGE_KEY)).toBe(false);
  });

  it('rozwiązuje motyw systemowy według ustawień urządzenia', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
  });
});

describe('applyTheme', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.head.innerHTML = '';
  });

  it('ustawia data-theme i kolor paska przeglądarki', () => {
    document.head.innerHTML =
      '<meta name="theme-color" content="#F3F4F8" media="(prefers-color-scheme: light)">' +
      '<meta name="theme-color" content="#0F1220" media="(prefers-color-scheme: dark)">';
    const root = document.documentElement;
    const metas = () =>
      [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map(
        (m) => m.content,
      );

    applyTheme(root, 'dark');
    expect(root.dataset.theme).toBe('dark');
    expect(metas()).toEqual(['#0F1220', '#0F1220']);

    applyTheme(root, 'system');
    expect(root.hasAttribute('data-theme')).toBe(false);
    expect(metas()).toEqual(['#F3F4F8', '#0F1220']);
  });
});
