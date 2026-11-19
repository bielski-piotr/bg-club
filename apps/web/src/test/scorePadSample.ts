import type { ScorePadFile, ScorePadTemplate } from '@bg-club/score-pad';

/** Liczba miejsc w przykładowym notesie: ponad dawny limit POC (`MAX_PLAYERS = 8`). */
export const SAMPLE_SEATS = 10;

const round = (v: number) => Math.round(v * 10000) / 10000;
const left = 0.05;
const right = 0.95;
const labelWidth = 0.17;
const seatWidth = (right - left - labelWidth) / SAMPLE_SEATS;

/**
 * Przykładowy plik notesu v2 dla testów: tabela z kolumną opisu i dziesięcioma kolumnami
 * graczy. Bez zdjęcia kartkę rysuje nadruk notesu (`print`, jak w notesach wbudowanych POC).
 * Nie trafia do bazy.
 */
const template = {
  v: 2,
  id: 'ds-sample',
  name: 'Notes testowy',
  size: { w: 21, h: 14 },
  tape: '#1f2f8f',
  accent: '#2a4bdb',
  print: {
    title: 'Notes testowy',
    subtitle: 'notes przykładowy',
    footer: 'Dziesięć miejsc dla graczy: ponad dawny limit ośmiu.',
    color: '#2a4bdb',
    tint: 'rgba(42, 75, 219, 0.08)',
    ornaments: ['star', 'coin', 'flag'],
    corner: `do ${SAMPLE_SEATS} graczy`,
  },
  grid: {
    x: [
      left,
      left + labelWidth,
      ...Array.from({ length: SAMPLE_SEATS }, (_, i) => left + labelWidth + (i + 1) * seatWidth),
    ].map(round),
    y: [0.3, 0.42, 0.54, 0.66, 0.78, 0.9],
    players: 'cols',
    labels: 1,
  },
  lines: [
    { id: 'names', label: 'Gracze', kind: 'names' },
    { id: 'birds', label: 'Ptaki', kind: 'input', min: 0, max: 99, step: 1 },
    { id: 'eggs', label: 'Jajka', kind: 'input', min: 0, max: 40, step: 1 },
    { id: 'bonus', label: 'Bonusy', kind: 'input', free: true },
    { id: 'total', label: 'Suma', kind: 'total' },
  ],
} satisfies ScorePadTemplate & Record<string, unknown>;

export const SAMPLE_SCORE_PAD: ScorePadFile = {
  format: 'score-pad',
  version: 2,
  template,
  active: template.id,
};
