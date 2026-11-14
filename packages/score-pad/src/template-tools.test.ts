import { describe, expect, it } from 'vitest';
import type { PadTemplate } from './core/templates';
import { readScorePadFile, readTemplate } from './template-tools';

/** Notes w tabeli: kolumna etykiet i 5 kolumn graczy, imiona, dwie punktacje i suma. */
function template(): PadTemplate {
  return {
    v: 2,
    id: 'turniej',
    name: 'Turniejowy',
    size: { w: 10, h: 14 },
    tape: '#2c3a46',
    image: 'data:image/jpeg;base64,AAAA',
    grid: {
      x: [0, 0.2, 0.36, 0.52, 0.68, 0.84, 1],
      y: [0, 0.25, 0.5, 0.75, 1],
      players: 'cols',
      labels: 1,
    },
    lines: [
      { id: 'names', label: 'Gracze', kind: 'names' },
      { id: 'a', label: 'Ptaki', kind: 'input', free: true },
      { id: 'b', label: 'Jajka', kind: 'input', min: 0, max: 30, step: 1 },
      { id: 'sum', label: 'Suma', kind: 'total' },
    ],
    ranking: { line: 'sum', dir: 'desc', tiebreak: [{ type: 'line', line: 'b', dir: 'desc' }] },
  };
}

const json = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

describe('readTemplate (import i zapis notesu, zadanie [015])', () => {
  it('przyjmuje poprawny notes, liczy miejsca dla graczy i zachowuje zdjęcie', () => {
    const result = readTemplate(json(template()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.playerSlots).toBe(5);
    expect(result.template.image).toBe('data:image/jpeg;base64,AAAA');
    expect(result.template.ranking).toEqual(template().ranking);
  });

  it('bez limitu graczy (EDT-8): pola dowolne dla 12 miejsc', () => {
    const t = template();
    const free = {
      ...t,
      grid: undefined,
      fields: Array.from({ length: 12 }, (_, p) => ({
        id: `f${p}`,
        line: 'a',
        p,
        x: 0.1,
        y: p / 13,
        w: 0.2,
        h: 0.05,
      })),
    };
    const result = readTemplate(json(free));
    expect(result.ok && result.playerSlots).toBe(12);
  });

  it('odrzuca format inny niż v2 i notes bez pól', () => {
    expect(readTemplate(json({ ...template(), v: 1 }))).toEqual({ ok: false, reason: 'format' });
    expect(readTemplate(json({ ...template(), grid: undefined }))).toEqual({
      ok: false,
      reason: 'shape',
    });
  });

  it('odrzuca błędną regułę miejsc zamiast po cichu ją pomijać (EDT-7)', () => {
    const result = readTemplate(
      json({ ...template(), ranking: { line: 'nie-ma', dir: 'desc', tiebreak: [] } }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('scoring');
    expect(result.issues).toContainEqual({ code: 'unknown-line', path: 'ranking.line' });
  });

  it('odrzuca notes bez kategorii imion i z sumą na cyklu', () => {
    const t = template();
    const lines = [
      { id: 'a', label: 'A', kind: 'input', free: true },
      { id: 's', label: 'S', kind: 'total', of: ['t'] },
      { id: 't', label: 'T', kind: 'total', of: ['s'] },
      { id: 'b', label: 'B', kind: 'input', free: true },
    ];
    const result = readTemplate(json({ ...t, lines, ranking: undefined }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues?.map((i) => i.code)).toEqual(
      expect.arrayContaining(['names-count', 'cycle']),
    );
  });

  it('martwą regułę po „wspólnym miejscu” usuwa z zapisu', () => {
    const t = template();
    const result = readTemplate(
      json({
        ...t,
        ranking: {
          line: 'sum',
          dir: 'desc',
          tiebreak: [{ type: 'shared' }, { type: 'line', line: 'a', dir: 'desc' }],
        },
      }),
    );
    expect(result.ok && result.template.ranking).toEqual({
      line: 'sum',
      dir: 'desc',
      tiebreak: [{ type: 'shared' }],
    });
  });
});

describe('readScorePadFile', () => {
  const file = (extra: object) => json({ format: 'score-pad', version: 2, ...extra });

  it('czyta `template` albo aktywny notes z `templates`', () => {
    expect(readScorePadFile(file({ template: template() })).ok).toBe(true);
    const other = { ...template(), id: 'inny', name: 'Inny' };
    const result = readScorePadFile(file({ templates: [other, template()], active: 'turniej' }));
    expect(result.ok && result.template.name).toBe('Turniejowy');
    expect(readScorePadFile(file({ templates: [template()] })).ok).toBe(true);
  });

  it('odrzuca plik innego formatu, wersji albo z kilkoma notesami bez wskazania', () => {
    expect(readScorePadFile({ template: template() })).toEqual({ ok: false, reason: 'format' });
    expect(
      readScorePadFile(json({ format: 'score-pad', version: 1, template: template() })),
    ).toEqual({ ok: false, reason: 'format' });
    expect(readScorePadFile(file({ settings: {} }))).toEqual({ ok: false, reason: 'format' });
    const other = { ...template(), id: 'inny' };
    expect(readScorePadFile(file({ templates: [other, template()] }))).toEqual({
      ok: false,
      reason: 'many',
    });
  });
});
