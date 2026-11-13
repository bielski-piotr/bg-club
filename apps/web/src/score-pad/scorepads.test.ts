import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { fewerSeatsMessage } from './messages';
import {
  dataUrlToBlob,
  exportFileName,
  readImportFile,
  saveScorepad,
  scorepadFile,
  scorepadName,
  ScorepadError,
} from './scorepads';

/*
 * Zapis, import i eksport notesu (PRD GAME-7, GAME-9, EDT-1, EDT-6…EDT-8, NFR-7, zadanie
 * [015]). Supabase jest atrapą: sprawdzamy kolejność (upload, potem RPC), szablon bez zdjęcia
 * w bazie i sprzątanie pliku po nieudanym zapisie. Dane są fikcyjne.
 */

const GAME = '00000000-0000-4000-b000-000000000001';
const PAD = '00000000-0000-4000-d000-000000000001';
// 1×1 px JPEG wystarczy: atrapa Storage nie dekoduje obrazu.
const IMAGE = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';

/** Notes w tabeli z 3 miejscami dla graczy: imiona, punktacja i suma. */
function sampleTemplate(extra: Record<string, unknown> = {}) {
  return {
    v: 2,
    id: 'n-plik',
    name: 'Turniejowy',
    size: { w: 10, h: 14 },
    tape: '#2c3a46',
    image: IMAGE,
    grid: {
      x: [0, 0.25, 0.5, 0.75, 1],
      y: [0, 0.33, 0.66, 1],
      players: 'cols',
      labels: 1,
    },
    lines: [
      { id: 'names', label: 'Gracze', kind: 'names' },
      { id: 'a', label: 'Ptaki', kind: 'input', free: true },
      { id: 'sum', label: 'Suma', kind: 'total' },
    ],
    ranking: { line: 'sum', dir: 'desc', tiebreak: [{ type: 'line', line: 'a', dir: 'desc' }] },
    ...extra,
  };
}

interface FakeOptions {
  readonly uploadError?: boolean;
  readonly rpcError?: { code: string; message: string };
}

function fakeClient(options: FakeOptions = {}) {
  const calls: string[] = [];
  const upload = vi.fn(async (...[path]: [path: string, blob: Blob, options: object]) => {
    calls.push(`upload ${path}`);
    return options.uploadError
      ? { data: null, error: { message: 'network' } }
      : { data: { path }, error: null };
  });
  const remove = vi.fn(async (paths: string[]) => {
    calls.push(`remove ${paths.join(',')}`);
    return { data: [], error: null };
  });
  const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
    calls.push(`rpc ${name}`);
    return {
      single: async () =>
        options.rpcError
          ? { data: null, error: options.rpcError }
          : { data: { version: 3, ...args }, error: null },
    };
  });
  const client = {
    rpc,
    storage: { from: () => ({ upload, remove }) },
  } as unknown as SupabaseClient;
  return { client, calls, upload, remove, rpc };
}

const file = (content: unknown) =>
  new Blob([typeof content === 'string' ? content : JSON.stringify(content)], {
    type: 'application/json',
  });

describe('saveScorepad (GAME-9, EDT-1)', () => {
  it('wysyła zdjęcie do Storage, a do bazy szablon bez zdjęcia', async () => {
    const fake = fakeClient();
    const saved = await saveScorepad(fake.client, {
      gameId: GAME,
      scorepadId: PAD,
      template: sampleTemplate({ name: '  Turniejowy  ' }),
    });
    expect(saved).toEqual({ name: 'Turniejowy', version: 3, playerSlots: 3 });
    expect(fake.calls.map((c) => c.split(' ')[0])).toEqual(['upload', 'rpc']);
    const path = fake.upload.mock.calls[0]?.[0] ?? '';
    expect(path).toMatch(new RegExp(`^${GAME}/${PAD}-[0-9a-f-]{36}\\.jpg$`));
    const blob = fake.upload.mock.calls[0]?.[1];
    expect(blob?.type).toBe('image/jpeg');

    const args = fake.rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    const template = args.template as Record<string, unknown>;
    expect(args).toMatchObject({
      game_id: GAME,
      scorepad_id: PAD,
      name: 'Turniejowy',
      image_path: path,
      player_slots: 3,
    });
    expect(template).not.toHaveProperty('image');
    expect(template).toMatchObject({ v: 2, id: PAD, name: 'Turniejowy' });
    expect(template.ranking).toEqual(sampleTemplate().ranking);
  });

  it('nieudany zapis wersji usuwa wysłany plik (bez sierot w Storage)', async () => {
    const fake = fakeClient({ rpcError: { code: '23514', message: 'scorepad x is deleted' } });
    const failure = saveScorepad(fake.client, {
      gameId: GAME,
      scorepadId: PAD,
      template: sampleTemplate(),
    });
    await expect(failure).rejects.toEqual(new ScorepadError('gone'));
    const path = fake.upload.mock.calls[0]?.[0] ?? '';
    expect(fake.calls).toEqual([`upload ${path}`, 'rpc save_scorepad', `remove ${path}`]);
  });

  it('błąd uploadu nie publikuje wersji', async () => {
    const fake = fakeClient({ uploadError: true });
    await expect(
      saveScorepad(fake.client, { gameId: GAME, scorepadId: PAD, template: sampleTemplate() }),
    ).rejects.toEqual(new ScorepadError('upload'));
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it('gracz dostaje „forbidden”, inne błędy bazy „save”', async () => {
    const forbidden = fakeClient({ rpcError: { code: '42501', message: 'only the admin' } });
    await expect(
      saveScorepad(forbidden.client, { gameId: GAME, scorepadId: PAD, template: sampleTemplate() }),
    ).rejects.toEqual(new ScorepadError('forbidden'));
    const other = fakeClient({ rpcError: { code: '23503', message: 'image is not in storage' } });
    await expect(
      saveScorepad(other.client, { gameId: GAME, scorepadId: PAD, template: sampleTemplate() }),
    ).rejects.toEqual(new ScorepadError('save'));
  });

  it('odrzuca błędny notes przed wysłaniem czegokolwiek', async () => {
    const fake = fakeClient();
    const broken = sampleTemplate({ ranking: { line: 'nie-ma', dir: 'desc', tiebreak: [] } });
    await expect(
      saveScorepad(fake.client, { gameId: GAME, scorepadId: PAD, template: broken }),
    ).rejects.toEqual(new ScorepadError('scoring'));
    expect(fake.calls).toEqual([]);
  });

  it('zdjęcie musi być obrazem w data URL (nie adresem ani GIF-em)', async () => {
    const fake = fakeClient();
    for (const image of ['https://example.test/kartka.jpg', 'data:image/gif;base64,R0lGOD==']) {
      await expect(
        saveScorepad(fake.client, {
          gameId: GAME,
          scorepadId: PAD,
          template: sampleTemplate({ image }),
        }),
      ).rejects.toEqual(new ScorepadError('image'));
    }
    expect(fake.calls).toEqual([]);
  });

  it('notes bez zdjęcia (nadruk) zapisuje się bez pliku', async () => {
    const fake = fakeClient();
    await saveScorepad(fake.client, {
      gameId: GAME,
      scorepadId: PAD,
      template: sampleTemplate({ image: undefined }),
    });
    expect(fake.upload).not.toHaveBeenCalled();
    expect(fake.rpc.mock.calls[0]?.[1]).toMatchObject({ image_path: null });
  });
});

describe('import i eksport pliku .json (EDT-1, EDT-7)', () => {
  it('czyta plik notesu v2 z eksportu edytora i z eksportu aplikacji', async () => {
    const fromEditor = { format: 'score-pad', version: 2, template: sampleTemplate() };
    expect(await readImportFile(file(fromEditor))).toMatchObject({ name: 'Turniejowy' });
    const exported = scorepadFile(sampleTemplate() as never);
    expect(exported).toMatchObject({ format: 'score-pad', version: 2, active: 'n-plik' });
    expect(await readImportFile(file(exported))).toMatchObject({ image: IMAGE });
  });

  it('odrzuca zły JSON, inny format, notes bez miejsc i błędną regułę', async () => {
    await expect(readImportFile(file('{nie json'))).rejects.toEqual(new ScorepadError('json'));
    await expect(readImportFile(file({ template: sampleTemplate() }))).rejects.toEqual(
      new ScorepadError('format'),
    );
    await expect(
      readImportFile(file({ format: 'score-pad', version: 2, template: sampleTemplate({ v: 1 }) })),
    ).rejects.toEqual(new ScorepadError('format'));
    await expect(
      readImportFile(
        file({ format: 'score-pad', version: 2, template: sampleTemplate({ grid: undefined }) }),
      ),
    ).rejects.toEqual(new ScorepadError('shape'));
    await expect(
      readImportFile(
        file({
          format: 'score-pad',
          version: 2,
          template: sampleTemplate({ ranking: { line: 'names', dir: 'desc', tiebreak: [] } }),
        }),
      ),
    ).rejects.toEqual(new ScorepadError('scoring'));
  });

  it('nazwa pliku eksportu bez polskich znaków', () => {
    expect(exportFileName('Żółwie – Łąka 2')).toBe('notes-zolwie-laka-2.json');
    expect(exportFileName('???')).toBe('notes-notes.json');
  });
});

describe('pomocnicze', () => {
  it('dataUrlToBlob: obrazy WebP, JPEG i PNG', async () => {
    const blob = dataUrlToBlob('data:image/png;base64,iVBORw0K');
    expect(blob?.type).toBe('image/png');
    expect(blob?.size).toBe(6);
    expect(dataUrlToBlob('data:text/plain,abc')).toBeNull();
    expect(dataUrlToBlob('blob:https://app.test/1')).toBeNull();
    expect(dataUrlToBlob('data:image/jpeg;base64,***')).toBeNull();
  });

  it('nazwa notesu: przycięta, najwyżej 40 znaków, pusta = „Notes”', () => {
    expect(scorepadName('  Turniejowy ')).toBe('Turniejowy');
    expect(scorepadName('x'.repeat(50))).toHaveLength(40);
    expect(scorepadName('   ')).toBe('Notes');
  });

  it('ostrzeżenie EDT-6 tylko, gdy miejsc jest mniej niż max. graczy', () => {
    expect(fewerSeatsMessage(4, 4)).toBeUndefined();
    expect(fewerSeatsMessage(5, 4)).toBeUndefined();
    expect(fewerSeatsMessage(3, 5)).toBe(
      'Notes ma 3 miejsca dla graczy, a gra pozwala na 5 graczy. Tego notesu można używać tylko w partiach do 3 graczy.',
    );
  });
});
