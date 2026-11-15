/**
 * Sprawdzenie (tylko w czasie kompilacji), że publiczne typy z `index.ts` zgadzają się
 * z implementacją web componentów. Plik nie jest importowany w czasie działania.
 */
import type { ScorePadElement as PadElementImpl } from './core/index';
import type { PadConfig } from './core/settings';
import type { LineDef, PadTemplate } from './core/templates';
import type { PadChangeDetail, PadSaveDetail, ScorePadOptions } from './core/viewer';
import type {
  EditorAreaPatch,
  EditorCategoriesAction,
  EditorMappingAction,
  EditorStatus,
} from './editor/editor';
import type { ScorePadEditorElement as EditorElementImpl } from './editor/element';
import type * as TemplateDecl from './template';
import type * as TemplateImpl from './template-tools';
import type {
  ScorePadApi,
  ScorePadChangeDetail,
  ScorePadClubOptions,
  ScorePadEditorAreaPatch,
  ScorePadEditorCategoriesAction,
  ScorePadEditorElement,
  ScorePadEditorMappingAction,
  ScorePadEditorStatus,
  ScorePadElement,
  ScorePadFile,
  ScorePadLine,
  ScorePadSaveDetail,
  ScorePadTemplate,
} from './index';

type Assert<T extends true> = T;
type Extends<A, B> = [A] extends [B] ? true : false;
// Typowane nakładki na addEventListener istnieją tylko w publicznym interfejsie.
type Listeners = 'addEventListener' | 'removeEventListener';

export type Contract = [
  Assert<Extends<PadTemplate, ScorePadTemplate>>,
  Assert<Extends<LineDef, ScorePadLine>>,
  Assert<Extends<PadConfig, ScorePadFile>>,
  Assert<Extends<PadSaveDetail, ScorePadSaveDetail>>,
  Assert<Extends<PadChangeDetail, ScorePadChangeDetail>>,
  // Szablony i plik notesu z bazy są dla aplikacji danymi; notes sprawdza je w czasie działania
  // (`validateTemplate`, `isConfig`), więc tu porównujemy tylko nazwy i pozostałe opcje.
  Assert<Extends<keyof ScorePadClubOptions, keyof ScorePadOptions>>,
  Assert<Extends<Omit<ScorePadClubOptions, 'config' | 'templates'>, ScorePadOptions>>,
  Assert<Extends<NonNullable<PadElementImpl['pad']>, ScorePadApi>>,
  Assert<Extends<PadElementImpl, Omit<ScorePadElement, 'options' | 'pad' | Listeners>>>,
  Assert<Extends<EditorElementImpl, Omit<ScorePadEditorElement, 'template' | Listeners>>>,
  Assert<Extends<EditorStatus, ScorePadEditorStatus>>,
  Assert<Extends<ScorePadEditorAreaPatch, EditorAreaPatch>>,
  Assert<Extends<ScorePadEditorMappingAction, EditorMappingAction>>,
  Assert<Extends<EditorMappingAction, ScorePadEditorMappingAction>>,
  Assert<Extends<ScorePadEditorCategoriesAction, EditorCategoriesAction>>,
  Assert<Extends<EditorCategoriesAction, ScorePadEditorCategoriesAction>>,
  Assert<Extends<typeof TemplateImpl.readTemplate, typeof TemplateDecl.readTemplate>>,
  Assert<Extends<typeof TemplateImpl.readScorePadFile, typeof TemplateDecl.readScorePadFile>>,
  Assert<Extends<typeof TemplateImpl.testSheet, typeof TemplateDecl.testSheet>>,
  Assert<Extends<typeof TemplateImpl.sheetResults, typeof TemplateDecl.sheetResults>>,
  Assert<Extends<typeof TemplateImpl.rankingLine, typeof TemplateDecl.rankingLine>>,
];
