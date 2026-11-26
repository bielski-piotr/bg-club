import { fireEvent, render, screen } from '@solidjs/testing-library';
import { act } from '../test/render';
import { describe, expect, it, vi } from 'vitest';
import { AppStatus } from './AppStatus';
import { PwaStore, registerServiceWorker } from './updates';

class FakeWorker extends EventTarget {
  state: ServiceWorkerState = 'installing';
  readonly postMessage = vi.fn();
  install() {
    this.state = 'installed';
    this.dispatchEvent(new Event('statechange'));
  }
}

class FakeRegistration extends EventTarget {
  waiting: FakeWorker | null = null;
  installing: FakeWorker | null = null;
  readonly update = vi.fn(() => Promise.resolve());
  found(worker: FakeWorker) {
    this.installing = worker;
    this.dispatchEvent(new Event('updatefound'));
  }
}

class FakeContainer extends EventTarget {
  constructor(
    public controller: object | null,
    readonly registration = new FakeRegistration(),
  ) {
    super();
  }
  readonly register = vi.fn(() => Promise.resolve(this.registration));
  takeOver() {
    this.controller = {};
    this.dispatchEvent(new Event('controllerchange'));
  }
}

async function setup(controller: object | null) {
  const reload = vi.fn();
  const store = new PwaStore({ reload });
  const container = new FakeContainer(controller);
  await registerServiceWorker(store, {
    container: container as unknown as ServiceWorkerContainer,
    checkMs: 60_000,
  });
  return { store, reload, container, registration: container.registration };
}

describe('aktualizacje aplikacji (NFR-3)', () => {
  it('pierwsza instalacja nie jest aktualizacją: bez komunikatu i przeładowania', async () => {
    const { store, reload, container, registration } = await setup(null);
    expect(container.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    const worker = new FakeWorker();
    registration.found(worker);
    worker.install();
    container.takeOver();
    expect(store.getSnapshot().update).toBe('none');
    expect(reload).not.toHaveBeenCalled();
  });

  it('nowa wersja czeka na „Odśwież”, potem aktywacja i przeładowanie', async () => {
    const { store, reload, container, registration } = await setup({});
    const worker = new FakeWorker();
    registration.found(worker);
    expect(store.getSnapshot().update).toBe('none');
    worker.install();
    expect(store.getSnapshot().update).toBe('available');
    expect(worker.postMessage).not.toHaveBeenCalled();

    expect(store.apply()).toBe(true);
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(store.getSnapshot().update).toBe('applying');
    expect(reload).not.toHaveBeenCalled();
    container.takeOver();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('czekająca wersja z poprzedniej wizyty jest od razu dostępna', async () => {
    const reload = vi.fn();
    const store = new PwaStore({ reload });
    const container = new FakeContainer({});
    const waiting = new FakeWorker();
    waiting.state = 'installed';
    container.registration.waiting = waiting;
    await registerServiceWorker(store, {
      container: container as unknown as ServiceWorkerContainer,
    });
    expect(store.getSnapshot().update).toBe('available');
  });

  it('niezapisany szkic wstrzymuje odświeżenie do zapisu w bazie (PAD-4)', async () => {
    const { store, registration } = await setup({});
    const worker = new FakeWorker();
    registration.found(worker);
    worker.install();
    store.setDraft('p1', true);
    store.setDraft('p2', true);
    expect(store.apply()).toBe(false);
    expect(worker.postMessage).not.toHaveBeenCalled();
    store.setDraft('p1', false);
    expect(store.getSnapshot().draftBusy).toBe(true);
    store.setDraft('p2', false);
    expect(store.getSnapshot().draftBusy).toBe(false);
    expect(store.apply()).toBe(true);
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
  });

  it('nowsza wersja po „Odśwież” dostaje zgodę; wersja, która przepadła, znika', async () => {
    const { store, registration } = await setup({});
    const first = new FakeWorker();
    registration.found(first);
    first.install();
    store.apply();
    const second = new FakeWorker();
    registration.found(second);
    second.install();
    expect(second.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(store.getSnapshot().update).toBe('applying');
    second.state = 'redundant';
    second.dispatchEvent(new Event('statechange'));
    expect(store.getSnapshot().update).toBe('none');
  });

  it('przełączenie w innej karcie: ta karta proponuje odświeżenie', async () => {
    const { store, reload, container } = await setup({});
    container.takeOver();
    expect(store.getSnapshot().update).toBe('activated');
    expect(reload).not.toHaveBeenCalled();
    store.apply();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('sprawdza nowe wersje okresowo i po powrocie do karty', async () => {
    vi.useFakeTimers();
    try {
      const { registration } = await setup({});
      vi.advanceTimersByTime(60_000);
      expect(registration.update).toHaveBeenCalledTimes(1);
      document.dispatchEvent(new Event('visibilitychange'));
      expect(registration.update).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('AppStatus', () => {
  it('bez sieci mówi wprost, że aplikacja potrzebuje internetu', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(() => <AppStatus store={new PwaStore()} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Brak połączenia z internetem. BG Club potrzebuje sieci; wpisy w notesie czekają na tym urządzeniu.',
    );
    online.mockReturnValue(true);
    await act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('nowa wersja: „Odśwież” nieaktywne, póki szkic nie jest w bazie', async () => {
    const reload = vi.fn();
    const store = new PwaStore({ reload });
    const worker = new FakeWorker();
    render(() => <AppStatus store={store} />);
    expect(screen.queryByRole('status')).toBeNull();
    await act(() => {
      store.setWaiting(worker as unknown as ServiceWorker);
      store.setDraft('p1', true);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Dostępna nowa wersja aplikacji.');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Odświeżysz, gdy szkic partii zapisze się w bazie.',
    );
    const button = screen.getByRole('button', { name: 'Odśwież' });
    expect(button).toBeDisabled();
    await act(() => store.setDraft('p1', false));
    expect(button).toBeEnabled();
    await act(() => fireEvent.click(button));
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(button).toBeDisabled();
  });
});
