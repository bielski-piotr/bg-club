/** @jsxImportSource @solidjs/web */
import { QueryClient } from '@tanstack/query-core';
import { screen, waitFor } from '@solidjs/testing-library';
import { createSignal, flush, Match, Switch } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import { createMutation, createQuery } from './query';
import { renderSolid } from './testing';

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

describe('createQuery', () => {
  it('pokazuje wczytywanie, potem dane', async () => {
    const request = deferred<string>();
    function View() {
      const query = createQuery(() => ({ queryKey: ['a'], queryFn: () => request.promise }));
      return (
        <Switch>
          <Match when={query().isPending}>
            <p>Wczytywanie</p>
          </Match>
          <Match when={query().isSuccess}>
            <p>Dane: {query().data}</p>
          </Match>
        </Switch>
      );
    }
    renderSolid(() => <View />, { queryClient: newClient() });
    expect(screen.getByText('Wczytywanie')).toBeInTheDocument();
    request.resolve('gotowe');
    expect(await screen.findByText('Dane: gotowe')).toBeInTheDocument();
  });

  it('przełącza się na nowe opcje i zachowuje poprzednie dane (keepPreviousData)', async () => {
    const [id, setId] = createSignal(1);
    const fetches = vi.fn((n: number) => Promise.resolve(`gra ${n}`));
    function View() {
      const query = createQuery(() => ({
        queryKey: ['game', id()],
        queryFn: () => fetches(id()),
        placeholderData: (previous: string | undefined) => previous,
      }));
      return (
        <p data-testid="game" data-placeholder={String(query().isPlaceholderData)}>
          {query().data ?? '—'}
        </p>
      );
    }
    renderSolid(() => <View />, { queryClient: newClient() });
    await waitFor(() => expect(screen.getByTestId('game')).toHaveTextContent('gra 1'));
    setId(2);
    flush();
    // Nowe zapytanie jeszcze trwa: na ekranie zostają poprzednie dane.
    expect(screen.getByTestId('game')).toHaveTextContent('gra 1');
    await waitFor(() => expect(screen.getByTestId('game')).toHaveTextContent('gra 2'));
    expect(screen.getByTestId('game')).toHaveAttribute('data-placeholder', 'false');
    expect(fetches.mock.calls).toEqual([[1], [2]]);
  });

  it('pokazuje błąd i ponawia przez refetch', async () => {
    let attempt = 0;
    function View() {
      const query = createQuery(() => ({
        queryKey: ['flaky'],
        queryFn: () =>
          ++attempt === 1 ? Promise.reject(new Error('sieć')) : Promise.resolve('ok'),
      }));
      return (
        <Switch fallback={<p>Wczytywanie</p>}>
          <Match when={query().isError}>
            <button type="button" onClick={() => void query().refetch()}>
              Ponów
            </button>
          </Match>
          <Match when={query().isSuccess}>
            <p>{query().data}</p>
          </Match>
        </Switch>
      );
    }
    renderSolid(() => <View />, { queryClient: newClient() });
    (await screen.findByRole('button', { name: 'Ponów' })).click();
    expect(await screen.findByText('ok')).toBeInTheDocument();
  });
});

describe('createMutation', () => {
  it('raportuje stan i unieważnia zapytania we wspólnym cache', async () => {
    const client = newClient();
    let server = 'stara nazwa';
    const save = deferred<undefined>();
    function View() {
      const query = createQuery(() => ({ queryKey: ['name'], queryFn: () => server }));
      const rename = createMutation({
        mutationFn: async (name: string) => {
          await save.promise;
          server = name;
        },
        onSuccess: () => client.invalidateQueries({ queryKey: ['name'] }),
      });
      return (
        <>
          <p data-testid="name">{query().data}</p>
          <p data-testid="status">{rename.state().status}</p>
          <button type="button" onClick={() => rename.mutate('nowa nazwa')}>
            Zmień
          </button>
        </>
      );
    }
    renderSolid(() => <View />, { queryClient: client });
    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('stara nazwa'));
    expect(screen.getByTestId('status')).toHaveTextContent('idle');
    screen.getByRole('button', { name: 'Zmień' }).click();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('pending'));
    save.resolve(undefined);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('success'));
    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('nowa nazwa'));
  });
});
