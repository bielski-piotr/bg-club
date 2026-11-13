/**
 * Sprawdzenie (tylko w czasie kompilacji), że publiczne typy z `index.ts` zgadzają się
 * z implementacją web componentów. Plik nie jest importowany w czasie działania.
 */
import type { ScorePadElement as PadElementImpl } from './core/index';
import type { PadConfig } from './core/settings';
import type { PadTemplate } from './core/templates';
import type { PadSaveDetail, ScorePadOptions } from './core/viewer';
import type { ScorePadEditorElement as EditorElementImpl } from './editor/element';
import type {
  ScorePadApi,
  ScorePadClubOptions,
  ScorePadEditorElement,
  ScorePadElement,
  ScorePadFile,
  ScorePadSaveDetail,
  ScorePadTemplate,
} from './index';

type Assert<T extends true> = T;
type Extends<A, B> = [A] extends [B] ? true : false;
// Typowane nakładki na addEventListener istnieją tylko w publicznym interfejsie.
type Listeners = 'addEventListener' | 'removeEventListener';

export type Contract = [
  Assert<Extends<PadTemplate, ScorePadTemplate>>,
  Assert<Extends<PadConfig, ScorePadFile>>,
  Assert<Extends<PadSaveDetail, ScorePadSaveDetail>>,
  // Szablony i plik notesu z bazy są dla aplikacji danymi; notes sprawdza je w czasie działania
  // (`validateTemplate`, `isConfig`), więc tu porównujemy tylko nazwy i pozostałe opcje.
  Assert<Extends<keyof ScorePadClubOptions, keyof ScorePadOptions>>,
  Assert<Extends<Omit<ScorePadClubOptions, 'config' | 'templates'>, ScorePadOptions>>,
  Assert<Extends<NonNullable<PadElementImpl['pad']>, ScorePadApi>>,
  Assert<Extends<PadElementImpl, Omit<ScorePadElement, 'options' | 'pad' | Listeners>>>,
  Assert<Extends<EditorElementImpl, Omit<ScorePadEditorElement, 'template' | Listeners>>>,
];
