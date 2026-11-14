import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor, EditorLoadError, type EditorStatus } from './editor/editor';

/*
 * Tryb kreatora `<score-pad-editor>` (EDT-9, zadanie [016]): kroki, nawigację i zdjęcie
 * prowadzi aplikacja, a edytor zgłasza stan i zmiany. jsdom nie dekoduje obrazów, więc
 * wczytanie zdjęcia sprawdzają testy aplikacji i E2E.
 */

class NoopResizeObserver {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

function mount(onChange?: (status: EditorStatus) => void) {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  const host = document.createElement('div');
  document.body.append(host);
  const editor = new Editor(host, { wizard: true, ...(onChange ? { onChange } : {}) });
  return { host, editor };
}

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('edytor w trybie kreatora', () => {
  it('bez własnych kroków i pola zdjęcia; stan początkowy bez zmian', () => {
    const { editor } = mount();
    expect(editor.root.classList.contains('wizard')).toBe(true);
    const status = editor.status();
    expect(status).toMatchObject({ step: 1, photo: false, area: false, dirty: false, busy: false });
    expect(status.fields).not.toBeNull();
  });

  it('nie wczytuje zdjęcia ze schowka sam (robi to aplikacja)', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const { editor } = mount();
    expect(add.mock.calls.some(([type]) => type === 'paste')).toBe(false);
    editor.destroy();
  });

  it('odrzuca plik, który nie jest obrazem, zamiast pokazywać komunikat w edytorze', async () => {
    const { editor } = mount();
    const json = new File(['{}'], 'notes.json', { type: 'application/json' });
    await expect(editor.loadFile(json)).rejects.toEqual(new EditorLoadError('type'));
    const pdf = new File(['%PDF'], 'a.pdf', { type: 'application/pdf' });
    await expect(editor.loadFile(pdf)).rejects.toMatchObject({ reason: 'type' });
    await expect(
      editor.loadTemplate({
        v: 2,
        id: 'x',
        name: 'x',
        size: { w: 10, h: 14 },
        tape: '#000',
        lines: [],
      }),
    ).rejects.toMatchObject({ reason: 'image' });
    expect(editor.status().dirty).toBe(false);
  });

  it('zmiana w narzędziach oznacza notes jako zmieniony i zgłasza stan raz na klatkę', async () => {
    const onChange = vi.fn();
    const { editor } = mount(onChange);
    await frame();
    onChange.mockClear();
    editor.toolbar.dispatchEvent(new Event('input', { bubbles: true }));
    editor.panel.dispatchEvent(new Event('change', { bubbles: true }));
    await frame();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({ dirty: true });
  });

  it('nie zgłasza stanu, gdy nic się nie zmieniło (np. przerysowanie przy przeciąganiu)', async () => {
    const onChange = vi.fn();
    const { editor } = mount(onChange);
    await frame();
    expect(onChange).toHaveBeenCalledTimes(1);
    editor.render();
    await frame();
    editor.render();
    await frame();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('Esc obsłużony przez edytor nie zamyka popupu (preventDefault)', () => {
    const { editor } = mount();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    editor.root.dispatchEvent(event);
    // Nic do anulowania: Esc idzie dalej, do popupu.
    expect(event.defaultPrevented).toBe(false);
  });

  it('ustawienia kroku 2 w stanie i ich zmiana z panelu aplikacji (EDT-10)', async () => {
    const onChange = vi.fn();
    const { editor } = mount(onChange);
    expect(editor.status().settings).toEqual({
      name: 'Mój notes',
      tape: '#161a2b',
      mode: 'auto',
      points: 4,
      smoothing: false,
      strength: 4,
      size: { w: 10.5, h: 14.8 },
      binding: 'top',
      canUndo: false,
      detected: null,
    });
    editor.setArea({ name: 'Turniejowy', tape: '#3A9D6E', binding: 'left', size: { w: 100 } });
    editor.setArea({ tape: 'red', size: { h: 1 } });
    const status = editor.status();
    expect(status.settings).toMatchObject({
      name: 'Turniejowy',
      tape: '#3a9d6e',
      binding: 'left',
      size: { w: 60, h: 3 },
    });
    expect(status.dirty).toBe(true);
    // Bez zdjęcia nie ma obszaru do zmiany ani cofania.
    editor.setArea({ mode: 'full' });
    editor.undoArea();
    editor.rotatePhoto(1);
    expect(editor.status()).toMatchObject({ photo: false, area: false });
    expect(editor.status().settings.mode).toBe('auto');
    await frame();
    expect(onChange.mock.lastCall?.[0]).toMatchObject({ settings: { name: 'Turniejowy' } });
  });

  it('stan mapowania (krok 3) jest w statusie; zmiana mapowania poza krokiem 3 nic nie robi', () => {
    const { editor } = mount();
    const status = editor.status();
    expect(status.mapping).toMatchObject({ zoomed: false, canUndo: false });
    editor.editMapping({ type: 'mode', mode: 'rects' });
    editor.editMapping({ type: 'fit' });
    expect(editor.status().dirty).toBe(false);
    expect(editor.status().mapping).toEqual(status.mapping);
  });
});
