import { fireEvent, render, screen } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_SCORE_PAD } from '../design-system/scorePadSample';
import { t } from '../i18n';
import { setThemePreference } from '../theme/themeStore';
import type * as LoadModule from './load';
import { ScorePadEditorView } from './ScorePadEditorView';
import { ScorePadView, type ScorePadHandle } from './ScorePadView';

/*
 * Notes i edytor (motyw, ładowanie, zdarzenia, uchwyt). Zmiany z efektów (motyw,
 * stan ładowania) widać po mikrozadaniu, więc asercje czekają (`vi.waitFor`).
 */

// Moduły pakietu ładują się naprawdę (jsdom nie ma WebGL, więc notes zatrzymuje się na
// ekranie ładowania); flaga pozwala zasymulować nieudane pobranie chunka.
const network = vi.hoisted(() => ({ fail: false }));
vi.mock('./load', async (importOriginal) => {
  const real = await importOriginal<typeof LoadModule>();
  return {
    ...real,
    loadScorePadPart: (part: Parameters<typeof real.loadScorePadPart>[0]) =>
      network.fail ? Promise.reject(new Error('offline')) : real.loadScorePadPart(part),
  };
});

const padElement = () => document.querySelector('score-pad');

afterEach(() => {
  vi.unstubAllGlobals();
  network.fail = false;
  setThemePreference('system');
});

describe('ScorePadView', () => {
  it('leniwie tworzy <score-pad> w trybie klubowym z motywem aplikacji', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    render(() => <ScorePadView config={SAMPLE_SCORE_PAD} />);
    expect(screen.getByRole('status')).toHaveTextContent(t.scorePad.loadingPad);

    await vi.waitFor(() => expect(padElement()).not.toBeNull());
    const element = padElement();
    expect(element?.options).toMatchObject({ club: true, config: SAMPLE_SCORE_PAD });
    expect(element?.getAttribute('theme')).toBe('light');
    await vi.waitFor(() =>
      expect(screen.getByRole('region', { name: t.scorePad.padLabel })).toHaveAttribute(
        'aria-busy',
        'false',
      ),
    );
    // Tryb klubowy nie czyta stanu ani historii notesu z POC.
    expect(getItem).not.toHaveBeenCalledWith('score-pad:state:v2');

    setThemePreference('dark');
    await vi.waitFor(() => expect(element?.getAttribute('theme')).toBe('dark'));
    expect(element?.shadowRoot?.querySelector<HTMLElement>('.sp')?.dataset.theme).toBe('dark');
  });

  it('przekazuje wynik z oderwanej kartki i niszczy notes przy odmontowaniu', async () => {
    const onSave = vi.fn();
    const { unmount } = render(() => <ScorePadView config={SAMPLE_SCORE_PAD} onSave={onSave} />);
    await vi.waitFor(() => expect(padElement()).not.toBeNull());
    const element = padElement();

    const detail = { tpl: 'ds-sample', players: [], winners: [] };
    element?.dispatchEvent(new CustomEvent('scorepad:save', { detail }));
    expect(onSave).toHaveBeenCalledWith(detail);

    expect(element?.pad).not.toBeNull();
    unmount();
    expect(element?.isConnected).toBe(false);
    expect(element?.pad).toBeNull();
  });

  it('tryb testowy kreatora i uchwyt: wpisy kartki, oderwanie, widok z góry (EDT-14)', async () => {
    let handle: ScorePadHandle | undefined;
    const onLoadState = vi.fn();
    render(() => (
      <ScorePadView
        ref={(value) => (handle = value)}
        config={SAMPLE_SCORE_PAD}
        controls={false}
        help={false}
        test
        onLoadState={onLoadState}
      />
    ));
    await vi.waitFor(() => expect(padElement()).not.toBeNull());
    const element = padElement();
    expect(element?.options).toMatchObject({
      club: true,
      test: true,
      help: false,
      controls: false,
    });
    await vi.waitFor(() => expect(onLoadState).toHaveBeenLastCalledWith('ready'));

    // jsdom nie ma WebGL, więc metody notesu podmieniamy, żeby sprawdzić tylko przekazanie.
    const api = {
      setSheet: vi.fn(),
      tear: vi.fn(),
      resetView: vi.fn(),
      restoreSheet: vi.fn(() => true),
      destroy: vi.fn(),
    };
    Object.defineProperty(element, 'pad', { value: api, configurable: true });
    const sheet = { game: 1, names: ['Gracz 1'], cells: {} };
    handle?.setSheet(sheet);
    handle?.tear();
    handle?.resetView();
    expect(handle?.restoreSheet(sheet)).toBe(true);
    expect(api.setSheet).toHaveBeenCalledWith(sheet);
    expect(api.restoreSheet).toHaveBeenCalledWith(sheet);
    expect(api.tear).toHaveBeenCalled();
    expect(api.resetView).toHaveBeenCalled();
  });

  it('po błędzie pobrania pokazuje komunikat i ponawia', async () => {
    network.fail = true;
    render(() => <ScorePadView config={SAMPLE_SCORE_PAD} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(t.scorePad.loadError);

    network.fail = false;
    fireEvent.click(screen.getByRole('button', { name: t.scorePad.retry }));
    await vi.waitFor(() => expect(padElement()).not.toBeNull());
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});

describe('ScorePadEditorView', () => {
  it('tworzy <score-pad-editor> z motywem i przekazuje eksport', async () => {
    // jsdom nie ma ResizeObservera, którego edytor używa do dopasowania podglądu.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    const onExport = vi.fn();
    setThemePreference('dark');
    render(() => <ScorePadEditorView onExport={onExport} />);
    await vi.waitFor(() => expect(document.querySelector('score-pad-editor')).not.toBeNull());
    const editor = document.querySelector('score-pad-editor');
    expect(editor?.getAttribute('theme')).toBe('dark');

    editor?.dispatchEvent(
      new CustomEvent('scorepad-editor:export', {
        detail: { config: SAMPLE_SCORE_PAD, via: 'file' },
      }),
    );
    expect(onExport).toHaveBeenCalledWith(SAMPLE_SCORE_PAD, 'file');
  });
});
