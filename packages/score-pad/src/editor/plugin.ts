// Wtyczka pakietu edytora: przy atrybucie `debug` — panel trybu debugowania, a przy atrybucie `editor` —
// edytor notesu w nakładce (domyślnie edytor działa osobno jako <score-pad-editor>).

import type { PadHost, ScorePadPlugin } from '../core/plugins';
import { DebugPanel } from './debug-panel';
import { Editor } from './editor';
import { DEBUG_CSS, EDITOR_CSS } from './styles';

const ICON_DEBUG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>`;
const PANEL_W = 360;

export const editorPlugin: ScorePadPlugin = {
  name: 'editor',
  attach(host: PadHost): void {
    const style = document.createElement('style');
    style.textContent = DEBUG_CSS + EDITOR_CSS;
    host.shadow.appendChild(style);

    // ── edytor notesu w nakładce — tylko gdy osadzenie o to prosi (atrybut `editor`);
    // domyślnie edytor to osobne narzędzie <score-pad-editor>
    let editor: Editor | null = null;
    const openEditor = (id?: unknown): void => {
      if (editor) return;
      const existing =
        typeof id === 'string'
          ? host.templates().find((t) => t.id === id && !t.print && t.image)
          : undefined;
      // edytor zasłania notes — scena 3D w tym czasie nie musi się rysować
      host.suspend(true);
      editor = new Editor(host.shadow, {
        existing,
        onUse: async (t) => {
          host.suspend(false);
          await host.saveTemplate(t, !existing);
          editor = null;
        },
        onClose: () => {
          host.suspend(false);
          editor = null;
        },
      });
      editor.root.querySelector<HTMLElement>('[data-close]')?.focus();
    };
    host.provide('editor', openEditor);
    host.addMenu(() => {
      const cur = host.current();
      const items = [{ label: 'Nowy notes ze zdjęcia…', run: () => openEditor() }];
      if (cur && !cur.print && cur.image)
        items.push({ label: 'Edytuj ten notes…', run: () => openEditor(cur.id) });
      return items;
    });

    // ── panel trybu debugowania
    if (!host.debug) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = ICON_DEBUG;
    btn.title = 'Tryb debugowania';
    btn.setAttribute('aria-label', 'Tryb debugowania');
    btn.setAttribute('aria-pressed', 'false');
    host.addTool(btn);
    const panel = new DebugPanel(host.frame, host.settings, () => host.baseSettings(), {
      change: (key, v) => host.setSetting(key, v),
      reset: (key) => host.resetSetting(key),
      close: () => toggle(false),
      action: (a) => void runAction(a),
    });
    const toggle = (on?: unknown): void => {
      const want = typeof on === 'boolean' ? on : !panel.open;
      panel.show(want);
      btn.setAttribute('aria-pressed', String(want));
      host.setInset(want ? PANEL_W : 0);
      host.prefs.set('debugOpen', want);
    };
    const runAction = async (a: string): Promise<void> => {
      const say = (m: string, k: '' | 'ok' | 'err' = 'ok'): void => {
        if (m) panel.say(m, k);
      };
      if (a === 'save') say(await host.saveFile(panel.sheetOpt));
      else if (a === 'copy') say(await host.copyConfig(panel.sheetOpt));
      else if (a === 'load') host.pickFile();
      else if (a === 'tear') host.tear();
      else if (a === 'blank') {
        host.blankSheet();
        say('Kartka wyczyszczona.');
      } else if (a === 'grid') {
        const cur = host.current();
        if (!cur || cur.print || !cur.image)
          say(
            'Wbudowanego notesu nie edytuje się ze zdjęcia — zapisz go do pliku i zmień JSON.',
            'err',
          );
        else openEditor(cur.id);
      } else if (a === 'history') {
        host.clearHistory();
        say('Historia partii wyczyszczona.');
      } else if (a === 'defaults') {
        host.resetSettings();
        say('Przywrócono ustawienia bazowe.');
      }
    };
    host.provide('debug', toggle);
    btn.addEventListener('click', () => toggle());
    host.on('frame', () => {
      if (panel.open) panel.setStats(host.stats());
    });
    host.on('settings', () => panel.refresh());
    host.on('status', (msg, kind) => panel.say(String(msg), (kind as '' | 'ok' | 'err') ?? ''));
    if (host.debug === 'open' || host.prefs.get('debugOpen')) toggle(true);
  },
};
