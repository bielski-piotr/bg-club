import { useState } from 'react';

/**
 * Wartość pola z edytora, którą użytkownik może swobodnie wpisywać: lokalny stan, a wartość
 * z edytora (np. po imporcie, obrocie albo poprawce zakresu) wraca, gdy pole nie ma fokusu.
 */
export function useDraft<T>(value: T) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const [seen, setSeen] = useState(value);
  if (!editing && seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  return {
    draft,
    setDraft,
    onFocus: () => setEditing(true),
    onBlur: () => setEditing(false),
  };
}
