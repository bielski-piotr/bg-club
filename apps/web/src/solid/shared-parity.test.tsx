/** @jsxImportSource @solidjs/web */
import { fireEvent } from '@solidjs/testing-library';
import type { SupabaseClient } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render as renderReact } from '@testing-library/react';
import { createElement, type ReactElement } from 'react';
import { flush } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/authContext';
import { GameCover as ReactGameCover } from '../games/GameCover';
import { gameSearchKey } from '../games/games';
import { clubKey } from '../hub/club';
import { DateRangeCalendar as ReactCalendar } from '../leaderboard/DateRangeCalendar';
import { FilterBar as ReactFilterBar } from '../leaderboard/FilterBar';
import { NO_FILTERS, type LeaderboardFilters } from '../leaderboard/filters';
import { AvatarCropper as SolidCropper } from '../profile/AvatarCropper';
import { AvatarCropper as ReactCropper } from '../react-shared/AvatarCropper';
import { GameCover } from './games/GameCover';
import { DateRangeCalendar } from './leaderboard/DateRangeCalendar';
import { FilterBar } from './leaderboard/FilterBar';
import { renderSolid as renderWithHost } from './testing';
import { normalize } from './ui/normalizeDom';

/*
 * Zgodność DOM elementów współdzielonych z etapu 3 (docs/solidjs-2-migration.md) z wersjami
 * React, które zostają w obszarach jeszcze niezmigrowanych (Ranking, Gry).
 */

const h = (type: unknown, props?: unknown, ...children: unknown[]): ReactElement =>
  createElement(type as never, props as never, ...(children as never[]));

function data() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  queryClient.setQueryData(clubKey, { name: 'Klub', logo_path: null, timezone: 'Europe/Warsaw' });
  queryClient.setQueryData(gameSearchKey(''), [
    { id: 'g1', title: 'Azul' },
    { id: 'g2', title: 'Wingspan' },
  ]);
  const auth = { client: {} as SupabaseClient } as AuthContextValue;
  return { queryClient, auth };
}

function withReact(element: ReactElement) {
  const { queryClient, auth } = data();
  return h(
    QueryClientProvider,
    { client: queryClient },
    h(AuthContext.Provider, { value: auth }, element),
  );
}

const FILTERS: LeaderboardFilters = { from: '2026-03-02', to: '2026-03-12', games: ['g2'] };

interface Case {
  readonly name: string;
  readonly react: () => ReactElement;
  readonly solid: () => ReturnType<typeof GameCover>;
  readonly act?: (container: HTMLElement) => void;
}

const clickPill = (index: number) => (container: HTMLElement) => {
  const pill = container.querySelectorAll<HTMLButtonElement>('.lb-filter__pill')[index];
  if (pill) fireEvent.click(pill);
};

const noop = () => undefined;
const cases: Case[] = [
  {
    name: 'GameCover: miniatura, duża, podgląd, niedostępna',
    react: () =>
      withReact(
        h(
          'div',
          null,
          h(ReactGameCover, { id: 'g1', title: 'Azul', coverPath: null, size: 'thumb' }),
          h(ReactGameCover, {
            id: 'g2',
            title: ' ',
            coverPath: null,
            size: 'large',
            className: 'c',
          }),
          h(ReactGameCover, {
            id: 'g3',
            title: 'Wingspan',
            coverPath: null,
            src: '/p.png',
            size: 'form',
          }),
          h(ReactGameCover, {
            id: 'g4',
            title: 'Root',
            coverPath: null,
            size: 'large',
            unavailable: true,
          }),
        ),
      ),
    solid: () => (
      <div>
        <GameCover id="g1" title="Azul" coverPath={null} size="thumb" />
        <GameCover id="g2" title=" " coverPath={null} size="large" class="c" />
        <GameCover id="g3" title="Wingspan" coverPath={null} src="/p.png" size="form" />
        <GameCover id="g4" title="Root" coverPath={null} size="large" unavailable />
      </div>
    ),
  },
  {
    name: 'FilterBar bez filtrów',
    react: () => withReact(h(ReactFilterBar, { filters: NO_FILTERS, onChange: noop })),
    solid: () => <FilterBar filters={NO_FILTERS} onChange={noop} />,
  },
  {
    name: 'FilterBar z filtrami i dodatkiem',
    react: () =>
      withReact(
        h(ReactFilterBar, {
          filters: FILTERS,
          onChange: noop,
          label: 'Filtry',
          extra: h('button', null, 'Remisy'),
        }),
      ),
    solid: () => (
      <FilterBar filters={FILTERS} onChange={noop} label="Filtry" extra={<button>Remisy</button>} />
    ),
  },
  {
    name: 'FilterBar: otwarty kalendarz',
    react: () => withReact(h(ReactFilterBar, { filters: FILTERS, onChange: noop })),
    solid: () => <FilterBar filters={FILTERS} onChange={noop} />,
    act: clickPill(0),
  },
  {
    name: 'FilterBar: otwarta lista gier',
    react: () => withReact(h(ReactFilterBar, { filters: FILTERS, onChange: noop })),
    solid: () => <FilterBar filters={FILTERS} onChange={noop} />,
    act: clickPill(1),
  },
  {
    name: 'DateRangeCalendar z zakresem',
    react: () =>
      h(ReactCalendar, {
        from: '2026-03-02',
        to: '2026-03-12',
        today: '2026-03-20',
        onChange: noop,
      }),
    solid: () => (
      <DateRangeCalendar from="2026-03-02" to="2026-03-12" today="2026-03-20" onChange={noop} />
    ),
  },
  {
    name: 'AvatarCropper: koło i okładka z tłem',
    react: () =>
      h(
        'div',
        null,
        h(ReactCropper, {
          src: '/a.png',
          image: { width: 800, height: 600 },
          crop: { zoom: 1.2, x: 10, y: -5 },
          onCropChange: noop,
        }),
        h(ReactCropper, {
          src: '/b.png',
          image: { width: 400, height: 900 },
          crop: { zoom: 1, x: 0, y: 0 },
          onCropChange: noop,
          shape: 'cover',
          fit: 'contain',
          fill: '#fff',
          margin: 0.1,
          maxSize: 320,
        }),
      ),
    solid: () => (
      <div>
        <SolidCropper
          src="/a.png"
          image={{ width: 800, height: 600 }}
          crop={{ zoom: 1.2, x: 10, y: -5 }}
          onCropChange={noop}
        />
        <SolidCropper
          src="/b.png"
          image={{ width: 400, height: 900 }}
          crop={{ zoom: 1, x: 0, y: 0 }}
          onCropChange={noop}
          shape="cover"
          fit="contain"
          fill="#fff"
          margin={0.1}
          maxSize={320}
        />
      </div>
    ),
  },
];

describe('zgodność DOM elementów współdzielonych (etap 3)', () => {
  it.each(cases)('$name', (c) => {
    const react = renderReact(c.react());
    if (c.act) act(() => c.act?.(react.container));
    const expected = normalize(react.container);
    react.unmount();

    const { queryClient, auth } = data();
    const solid = renderWithHost(() => c.solid(), { queryClient, auth });
    if (c.act) {
      c.act(solid.container);
      flush();
    }
    expect(normalize(solid.container)).toBe(expected);
  });
});
