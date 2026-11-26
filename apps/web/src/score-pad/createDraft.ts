import { createMemo, createSignal, untrack, type Accessor } from 'solid-js';

/**
 * Wartość pola z edytora, którą użytkownik może swobodnie wpisywać:
 * lokalny szkic, a wartość z edytora (np. po imporcie, obrocie albo poprawce zakresu) wraca,
 * gdy pole nie ma fokusu. Po opuszczeniu pola szkic wraca do wartości z edytora tylko wtedy,
 * gdy ta się w międzyczasie zmieniła.
 */
export function createDraft<T>(value: Accessor<T>) {
  const [editing, setEditing] = createSignal(false);
  // Ostatnia wartość z edytora widziana bez fokusu w polu (zmienna poza sygnałem: memo ją tylko
  // przesuwa, nie zapisuje stanu).
  let seen = untrack(value);
  const synced = createMemo(() => {
    const next = value();
    if (!editing()) seen = next;
    return seen;
  });
  const [draft, setDraft] = createSignal<T>(() => synced());
  return {
    draft,
    setDraft,
    onFocus: () => setEditing(true),
    onBlur: () => setEditing(false),
  };
}
