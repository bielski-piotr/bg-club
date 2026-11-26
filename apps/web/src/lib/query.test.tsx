import { captureArtifact, expectNoDiagnostics } from '@solidjs/diagnostics';
import { fireEvent, screen, waitFor } from '@solidjs/testing-library';
import { QueryClient } from '@tanstack/query-core';
import {
  action,
  createOptimistic,
  createSignal,
  Errored,
  flush,
  isPending,
  Loading,
  Show,
  useContext,
} from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/render';
import { createQuery } from './query';
import { QueryClientContext } from './queryClient';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  flush();
};

describe('createQuery (async)', () => {
  it('pierwsze wczytanie pod <Loading>, potem dane', async () => {
    const request = deferred<string>();
    function View() {
      const name = createQuery(() => ({ queryKey: ['a'], queryFn: () => request.promise }));
      return (
        <Loading fallback={<p>Wczytywanie</p>}>
          <p>Dane: {name()}</p>
        </Loading>
      );
    }
    renderWithProviders(() => <View />, { queryClient: newClient() });
    flush();
    expect(screen.getByText('Wczytywanie')).toBeInTheDocument();
    request.resolve('gotowe');
    expect(await screen.findByText('Dane: gotowe')).toBeInTheDocument();
  });

  it('dane z cache są od razu, bez zastępnika', () => {
    const client = newClient();
    client.setQueryData(['a'], 'z cache');
    function View() {
      const name = createQuery(() => ({
        queryKey: ['a'],
        queryFn: () => 'z sieci',
        staleTime: Infinity,
      }));
      return (
        <Loading fallback={<p>Wczytywanie</p>}>
          <p>{name()}</p>
        </Loading>
      );
    }
    renderWithProviders(() => <View />, { queryClient: client });
    flush();
    expect(screen.getByText('z cache')).toBeInTheDocument();
  });

  it('zmiana klucza: poprzednie dane zostają, isPending w trakcie', async () => {
    const [id, setId] = createSignal(1);
    const requests = new Map<number, ReturnType<typeof deferred<string>>>();
    const request = (n: number) => {
      const next = deferred<string>();
      requests.set(n, next);
      return next.promise;
    };
    function View() {
      const game = createQuery(() => ({
        queryKey: ['game', id()],
        queryFn: () => request(id()),
      }));
      return (
        <Loading fallback={<p>Wczytywanie</p>}>
          <p data-testid="game" data-pending={String(isPending(() => game()))}>
            {game()}
          </p>
        </Loading>
      );
    }
    renderWithProviders(() => <View />, { queryClient: newClient() });
    flush();
    requests.get(1)?.resolve('gra 1');
    await waitFor(() => expect(screen.getByTestId('game')).toHaveTextContent('gra 1'));
    setId(2);
    flush();
    await settle();
    expect(screen.queryByText('Wczytywanie')).toBeNull();
    expect(screen.getByTestId('game')).toHaveTextContent('gra 1');
    expect(screen.getByTestId('game')).toHaveAttribute('data-pending', 'true');
    requests.get(2)?.resolve('gra 2');
    await waitFor(() => expect(screen.getByTestId('game')).toHaveTextContent('gra 2'));
    expect(screen.getByTestId('game')).toHaveAttribute('data-pending', 'false');
  });

  it('inwalidacja i setQueryData odświeżają dane bez zastępnika', async () => {
    const client = newClient();
    let server = 'v1';
    function View() {
      const value = createQuery(() => ({ queryKey: ['v'], queryFn: () => server }));
      return (
        <Loading fallback={<p>Wczytywanie</p>}>
          <p data-testid="v">{value()}</p>
        </Loading>
      );
    }
    renderWithProviders(() => <View />, { queryClient: client });
    await waitFor(() => expect(screen.getByTestId('v')).toHaveTextContent('v1'));
    server = 'v2';
    await client.invalidateQueries({ queryKey: ['v'] });
    await waitFor(() => expect(screen.getByTestId('v')).toHaveTextContent('v2'));
    client.setQueryData(['v'], 'v3');
    await waitFor(() => expect(screen.getByTestId('v')).toHaveTextContent('v3'));
    expect(screen.queryByText('Wczytywanie')).toBeNull();
  });

  it('błąd trafia do <Errored>; ponowienie wraca do danych', async () => {
    let attempt = 0;
    function View() {
      const value = createQuery(() => ({
        queryKey: ['flaky'],
        queryFn: () =>
          ++attempt === 1 ? Promise.reject(new Error('sieć')) : Promise.resolve('ok'),
      }));
      return (
        <Errored
          fallback={(_error, reset) => (
            <button
              type="button"
              onClick={() => {
                void value.refetch();
                reset();
              }}
            >
              Ponów
            </button>
          )}
        >
          <Loading fallback={<p>Wczytywanie</p>}>
            <p>{value()}</p>
          </Loading>
        </Errored>
      );
    }
    renderWithProviders(() => <View />, { queryClient: newClient() });
    fireEvent.click(await screen.findByRole('button', { name: 'Ponów' }));
    expect(await screen.findByText('ok')).toBeInTheDocument();
  });

  it('opcje null: brak zapytania, akcesor zwraca undefined', () => {
    const queryFn = vi.fn(() => 'x');
    function View() {
      const value = createQuery(() => null as null | { queryKey: string[]; queryFn: () => string });
      return <p data-testid="none">{value() ?? 'brak'}</p>;
    }
    renderWithProviders(() => <View />, { queryClient: newClient() });
    flush();
    expect(screen.getByTestId('none')).toHaveTextContent('brak');
    expect(queryFn).not.toHaveBeenCalled();
  });

  it('opcje null odpinają obserwatora od poprzedniego zapytania', async () => {
    const client = newClient();
    const [on, setOn] = createSignal(true);
    function View() {
      const value = createQuery(() =>
        on() ? { queryKey: ['big'], queryFn: () => 'zdjęcie' } : null,
      );
      return <p data-testid="big">{value.current() ?? 'brak'}</p>;
    }
    renderWithProviders(() => <View />, { queryClient: client });
    await waitFor(() => expect(screen.getByTestId('big')).toHaveTextContent('zdjęcie'));
    const query = client.getQueryCache().find({ queryKey: ['big'] });
    expect(query?.getObserversCount()).toBe(1);
    setOn(false);
    flush();
    expect(screen.getByTestId('big')).toHaveTextContent('brak');
    expect(query?.getObserversCount()).toBe(0);
  });

  it('action: flaga zapisu w trakcie, po inwalidacji nowe dane', async () => {
    const client = newClient();
    let server = 'stara';
    const save = deferred<undefined>();
    function View() {
      const queryClient = useContext(QueryClientContext);
      const name = createQuery(() => ({ queryKey: ['name'], queryFn: () => server }));
      const [saving, setSaving] = createOptimistic(false);
      const rename = action(function* (next: string) {
        setSaving(true);
        yield save.promise;
        server = next;
        yield queryClient.invalidateQueries({ queryKey: ['name'] });
      });
      return (
        <Loading fallback={<p>Wczytywanie</p>}>
          <p data-testid="name">{name()}</p>
          <button type="button" disabled={saving()} onClick={() => void rename('nowa')}>
            Zmień
          </button>
        </Loading>
      );
    }
    renderWithProviders(() => <View />, { queryClient: client });
    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('stara'));
    fireEvent.click(screen.getByRole('button', { name: 'Zmień' }));
    flush();
    expect(screen.getByRole('button', { name: 'Zmień' })).toBeDisabled();
    save.resolve(undefined);
    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('nowa'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Zmień' })).toBeEnabled());
  });

  it('bez kodów diagnostyki Solid', async () => {
    const { artifact } = await captureArtifact(
      async () => {
        const client = newClient();
        let server = 'a';
        client.setQueryData(['k1'], 'ak1');
        const [key, setKey] = createSignal('k1');
        function View() {
          const value = createQuery(() => ({
            queryKey: [key()],
            queryFn: () => server + key(),
          }));
          return (
            <Loading fallback={<p>Wczytywanie</p>}>
              <Show when={!isPending(() => value())} fallback={<p>Odświeżanie</p>}>
                <p>{value()}</p>
              </Show>
            </Loading>
          );
        }
        const view = renderWithProviders(() => <View />, { queryClient: client });
        await settle();
        server = 'b';
        setKey('k2');
        await settle();
        await client.invalidateQueries();
        await settle();
        view.unmount();
      },
      { scenario: 'async-query' },
    );
    expectNoDiagnostics(artifact);
  });
});
