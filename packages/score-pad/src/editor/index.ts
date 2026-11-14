// Punkt wejścia pakietu edytora (score-pad-editor.js): samodzielny edytor <score-pad-editor>
// oraz wtyczka notesu (tryb debugowania, opcjonalnie edytor w nakładce). Kolejność skryptów nie ma znaczenia.

import type { ScorePadPlugin } from '../core/plugins';
import { detectLines, looksCropped } from './photo';
import { detectArea } from './shape-tools';
import { editorPlugin } from './plugin';
import { ScorePadEditorElement, mountEditor } from './element';

const w = window as unknown as {
  ScorePad?: { registerPlugin?: (p: ScorePadPlugin) => void };
  __scorePadPlugins?: ScorePadPlugin[];
  ScorePadEditor?: unknown;
};

if (w.ScorePad?.registerPlugin) w.ScorePad.registerPlugin(editorPlugin);
else (w.__scorePadPlugins ??= []).push(editorPlugin);

if (!customElements.get('score-pad-editor'))
  customElements.define('score-pad-editor', ScorePadEditorElement);

w.ScorePadEditor = {
  version: '2.4.0',
  /** Montuje edytor w dowolnym elemencie strony. */
  mount: mountEditor,
  /** Narzędzia do diagnostyki wykrywania tabeli i obszaru kartki na zdjęciu. */
  tools: { detectLines, looksCropped, detectArea },
};
