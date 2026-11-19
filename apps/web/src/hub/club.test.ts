import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { ClubSaveError, saveClub, type Club } from './club';

const CLUB: Club = {
  name: 'Planszówki',
  logo_path: 'club/logo-old.webp',
  timezone: 'Europe/Warsaw',
};
const IMAGE = {
  blob: new Blob(['webp'], { type: 'image/webp' }),
  extension: 'webp' as const,
  width: 800,
  height: 600,
};

/** Atrapa: zapisuje kolejność operacji Storage i PostgREST. */
function fakeClient(result: { data: unknown; error: { code: string } | null }) {
  const log: string[] = [];
  const bucket = {
    upload: vi.fn(async (path: string) => {
      log.push(`upload ${path}`);
      return { data: {}, error: null };
    }),
    remove: vi.fn(async (paths: string[]) => {
      log.push(`remove ${paths.join(',')}`);
      return { data: [], error: null };
    }),
  };
  const query = {
    insert: vi.fn((row: object) => {
      log.push(`insert ${JSON.stringify(row)}`);
      return query;
    }),
    update: vi.fn((row: object) => {
      log.push(`update ${JSON.stringify(row)}`);
      return query;
    }),
    eq: () => query,
    select: () => query,
    single: async () => result,
  };
  const client = {
    from: () => query,
    storage: { from: () => bucket },
  } as unknown as SupabaseClient;
  return { client, log };
}

describe('zapis klubu', () => {
  it('zakłada klub bez logo jednym INSERT z przyciętą nazwą', async () => {
    const saved = { name: 'Nowy', logo_path: null, timezone: 'Asia/Tokyo' };
    const { client, log } = fakeClient({ data: saved, error: null });
    await expect(
      saveClub(client, null, { name: ' Nowy ', timezone: 'Asia/Tokyo', logo: { kind: 'keep' } }),
    ).resolves.toEqual(saved);
    expect(log).toEqual(['insert {"name":"Nowy","timezone":"Asia/Tokyo","logo_path":null}']);
  });

  it('nowe logo wysyła przed zapisem, a potem usuwa poprzedni plik', async () => {
    const { client, log } = fakeClient({
      data: { ...CLUB, logo_path: 'club/logo-new.webp' },
      error: null,
    });
    await saveClub(client, CLUB, {
      name: CLUB.name,
      timezone: CLUB.timezone,
      logo: { kind: 'new', image: IMAGE },
    });
    expect(log[0]).toMatch(/^upload club\/logo-[0-9a-f-]{36}\.webp$/);
    expect(log[1]).toMatch(/^update .*"logo_path":"club\/logo-[0-9a-f-]{36}\.webp"/);
    expect(log[2]).toBe('remove club/logo-old.webp');
  });

  it('drugi klub (23505) odrzuca jako „exists” i sprząta wysłane logo', async () => {
    const { client, log } = fakeClient({ data: null, error: { code: '23505' } });
    const attempt = saveClub(client, null, {
      name: 'Drugi',
      timezone: 'Europe/Warsaw',
      logo: { kind: 'new', image: IMAGE },
    });
    await expect(attempt).rejects.toEqual(new ClubSaveError('exists'));
    expect(log).toHaveLength(3);
    expect(log[2]).toBe(`remove ${log[0]?.slice('upload '.length)}`);
  });

  it('brak uprawnień i usunięcie logo', async () => {
    const denied = fakeClient({ data: null, error: { code: '42501' } });
    await expect(
      saveClub(denied.client, null, { name: 'X', timezone: 'UTC', logo: { kind: 'keep' } }),
    ).rejects.toEqual(new ClubSaveError('forbidden'));

    const { client, log } = fakeClient({ data: { ...CLUB, logo_path: null }, error: null });
    await saveClub(client, CLUB, { name: CLUB.name, timezone: 'UTC', logo: { kind: 'remove' } });
    expect(log).toEqual([
      'update {"name":"Planszówki","timezone":"UTC","logo_path":null}',
      'remove club/logo-old.webp',
    ]);
  });
});
