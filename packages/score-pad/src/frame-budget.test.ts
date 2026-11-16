import { describe, expect, it } from 'vitest';
import { FRAME_WINDOW, FrameBudget, WARMUP_MS } from './core/frameBudget';

/** Ograniczenia GPU: gęstość renderu notesu spada stopniami, tekstura bez zmian (NFR-2). */
function run(budget: FrameBudget, frames: number, ms: number, from = WARMUP_MS) {
  const changes: number[] = [];
  for (let i = 0; i < frames; i += 1) {
    const next = budget.sample(from + i * ms, ms);
    if (next !== null) changes.push(next);
  }
  return changes;
}

describe('FrameBudget', () => {
  it('przy płynnych klatkach zostaje pełna gęstość', () => {
    const budget = new FrameBudget(3);
    budget.sample(0, 16);
    expect(run(budget, FRAME_WINDOW * 4, 16)).toEqual([]);
    expect(budget.pixelRatio).toBe(3);
  });

  it('poniżej 30 kl./s obniża gęstość stopniami do 1 i nie schodzi niżej', () => {
    const budget = new FrameBudget(3);
    budget.sample(0, 50);
    expect(run(budget, FRAME_WINDOW * 5, 50)).toEqual([2, 1.5, 1]);
    expect(budget.pixelRatio).toBe(1);
  });

  it('pomija rozgrzewkę i przerwy w klatkach', () => {
    const budget = new FrameBudget(2);
    budget.sample(0, 50);
    expect(run(budget, WARMUP_MS / 50 - 1, 50, 0)).toEqual([]);
    expect(run(budget, FRAME_WINDOW * 2, 400)).toEqual([]);
    expect(budget.pixelRatio).toBe(2);
  });

  it('ekran o gęstości 1 nie ma czego obniżać', () => {
    const budget = new FrameBudget(1);
    budget.sample(0, 80);
    expect(run(budget, FRAME_WINDOW * 3, 80)).toEqual([]);
  });
});
