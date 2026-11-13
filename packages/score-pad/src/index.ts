/**
 * Pakiet `@bg-club/score-pad`.
 *
 * Źródła notesu (`core/`) i edytora (`editor/`) przenosimy z `digital-scorepad-poc`
 * (wersja 2.4.0, commit `e6b7dd2`) w zadaniu [013]; Three.js będzie zależnością npm.
 * Aplikacja ładuje ten pakiet leniwie przez `import()` (NFR-2).
 */

/** Nazwy elementów rejestrowanych przez pakiet. */
export const SCORE_PAD_TAG = 'score-pad';
export const SCORE_PAD_EDITOR_TAG = 'score-pad-editor';
