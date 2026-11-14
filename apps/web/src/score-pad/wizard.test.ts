import type { ScorePadEditorStatus } from '@bg-club/score-pad';
import { describe, expect, it } from 'vitest';
import {
  canOpenStep,
  editorStepFor,
  imageFromClipboard,
  isJsonFile,
  isNotImage,
  isStepValid,
  nextStep,
  previousStep,
  stepState,
} from './wizard';

/** Kroki kreatora edytora notesu (PRD §5.5.2, EDT-9, DS §18). */

const EMPTY: ScorePadEditorStatus = {
  step: 1,
  busy: false,
  photo: false,
  photoUrl: '',
  area: false,
  fields: 'Dodaj kategorię z punktami.',
  sheetUrl: '',
  seats: 0,
  lines: [],
  settings: {
    name: 'Mój notes',
    tape: '#161a2b',
    mode: 'auto',
    points: 4,
    smoothing: false,
    strength: 4,
    size: { w: 10.5, h: 14.8 },
    binding: 'top',
    canUndo: false,
    detected: 'sheet',
  },
  mapping: {
    mode: 'rects',
    players: 'cols',
    seats: 1,
    categories: 0,
    labels: 1,
    activeSeat: 0,
    activeCategory: 0,
    selected: 0,
    canDuplicate: false,
    canUndo: false,
    hasContent: false,
    detected: null,
    problem: 'Narysuj na kartce pole pierwszej kategorii.',
    zoomed: false,
  },
  dirty: false,
  openFailed: false,
};
const PHOTO = { ...EMPTY, photo: true, photoUrl: 'data:image/jpeg;base64,x', area: true };
const READY: ScorePadEditorStatus = {
  ...PHOTO,
  step: 3,
  fields: null,
  mapping: { ...EMPTY.mapping, mode: 'table', seats: 4, categories: 2, problem: null },
  seats: 4,
  lines: [
    { label: 'Gracze', kind: 'names' },
    { label: 'Ptaki', kind: 'input' },
  ],
};

describe('poprawność kroków', () => {
  it('krok 1 wymaga zdjęcia, krok 2 obszaru kartki', () => {
    expect(isStepValid(1, EMPTY)).toBe(false);
    expect(isStepValid(1, PHOTO)).toBe(true);
    expect(isStepValid(2, { ...PHOTO, area: false })).toBe(false);
    expect(isStepValid(2, PHOTO)).toBe(true);
  });

  it('krok 2 wymaga też nazwy notesu (EDT-10)', () => {
    expect(isStepValid(2, { ...PHOTO, settings: { ...PHOTO.settings, name: ' ' } })).toBe(false);
    expect(isStepValid(3, { ...READY, settings: { ...READY.settings, name: '' } })).toBe(true);
    expect(canOpenStep(3, 2, 2, { ...READY, settings: { ...READY.settings, name: '' } })).toBe(
      false,
    );
  });

  it('kroki 3 i 4 wymagają pól i poprawnych kategorii (EDT-13)', () => {
    expect(isStepValid(3, { ...PHOTO, seats: 0, lines: READY.lines })).toBe(false);
    expect(isStepValid(3, { ...PHOTO, seats: 4, lines: READY.lines, mapping: READY.mapping })).toBe(
      true,
    );
    // EDT-11: miejsce albo kategoria bez pól blokuje przejście dalej.
    expect(
      isStepValid(3, {
        ...READY,
        mapping: { ...READY.mapping, problem: 'Miejsce 2 nie ma jeszcze pól.' },
      }),
    ).toBe(false);
    expect(isStepValid(4, { ...READY, fields: 'Tylko jedna kategoria może być „Imiona”.' })).toBe(
      false,
    );
    expect(isStepValid(4, READY)).toBe(true);
    expect(isStepValid(5, READY)).toBe(true);
  });

  it('bez stanu edytora albo w trakcie wczytywania żaden krok nie jest poprawny', () => {
    expect(isStepValid(1, null)).toBe(false);
    expect(isStepValid(1, { ...READY, busy: true })).toBe(false);
  });
});

describe('przechodzenie między krokami', () => {
  it('do przodu tylko o jeden krok za najdalszym odwiedzonym i przez poprawne kroki', () => {
    expect(canOpenStep(2, 1, 1, EMPTY)).toBe(false);
    expect(canOpenStep(2, 1, 1, PHOTO)).toBe(true);
    expect(canOpenStep(3, 1, 1, READY)).toBe(false);
    expect(canOpenStep(3, 2, 2, READY)).toBe(true);
  });

  it('wstecz zawsze, bez utraty danych', () => {
    expect(canOpenStep(1, 3, 3, { ...READY, area: false })).toBe(true);
    expect(canOpenStep(2, 4, 4, READY)).toBe(true);
  });

  it('edycja notesu: z kroku 1 każdy krok jest dostępny', () => {
    for (const step of [2, 3, 4, 5] as const) expect(canOpenStep(step, 1, 5, READY)).toBe(true);
    // Niepoprawny krok po drodze blokuje dalsze.
    expect(canOpenStep(5, 1, 5, { ...READY, fields: 'Dodaj kategorię z punktami.' })).toBe(false);
    expect(canOpenStep(3, 1, 5, { ...READY, fields: 'Dodaj kategorię z punktami.' })).toBe(true);
  });

  it('pigułki: bieżący, wykonane (odwiedzone i poprawne) i kolejne', () => {
    expect([1, 2, 3, 4, 5].map((s) => stepState(s as 1, 3, 3, READY))).toEqual([
      'done',
      'done',
      'current',
      'upcoming',
      'upcoming',
    ]);
    // Edycja: wszystkie kroki wykonane, ostatni kończy zapis.
    expect([1, 2, 3, 4, 5].map((s) => stepState(s as 1, 1, 5, READY))).toEqual([
      'current',
      'done',
      'done',
      'done',
      'upcoming',
    ]);
    expect(stepState(2, 1, 5, { ...READY, area: false })).toBe('upcoming');
  });

  it('kroki edytora: 4 i 5 korzystają z kartki kroku 3', () => {
    expect([1, 2, 3, 4, 5].map((s) => editorStepFor(s as 1))).toEqual([1, 2, 3, 3, 3]);
    expect(nextStep(5)).toBe(5);
    expect(previousStep(1)).toBe(1);
    expect(nextStep(2)).toBe(3);
  });
});

describe('pliki w kroku 1', () => {
  it('rozpoznaje plik notesu .json i pliki, które nie są obrazem', () => {
    expect(isJsonFile(new File(['{}'], 'notes.JSON'))).toBe(true);
    expect(isJsonFile(new Blob(['{}'], { type: 'application/json' }))).toBe(true);
    expect(isJsonFile(new File([''], 'kartka.jpg', { type: 'image/jpeg' }))).toBe(false);
    expect(isNotImage(new File([''], 'a.pdf', { type: 'application/pdf' }))).toBe(true);
    expect(isNotImage(new File([''], 'a.heic'))).toBe(false);
    expect(isNotImage(new File([''], 'a.png', { type: 'image/png' }))).toBe(false);
  });

  it('bierze pierwszy obraz ze schowka', () => {
    const image = new File(['x'], 'image.png', { type: 'image/png' });
    const items = [
      { kind: 'string', type: 'text/plain', getAsFile: () => null },
      { kind: 'file', type: 'image/png', getAsFile: () => image },
    ];
    expect(imageFromClipboard({ items } as unknown as DataTransfer)).toBe(image);
    expect(imageFromClipboard({ items: items.slice(0, 1) } as unknown as DataTransfer)).toBeNull();
    expect(imageFromClipboard(null)).toBeNull();
  });
});
