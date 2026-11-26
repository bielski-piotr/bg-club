/** @jsxImportSource @solidjs/web */
import type { SupabaseClient } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render as renderReact } from '@testing-library/react';
import { createElement, type ReactElement } from 'react';
import { flush } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/authContext';
import { GameCover as ReactGameCover } from '../react-shared/GameCover';
import { gameSearchKey } from '../games/games';
import { clubKey } from '../hub/club';
import { GameCover } from '../games/GameCover';
import {
  PlayTimes as ReactPlayTimes,
  RecordBadge as ReactRecordBadge,
} from '../meetings/MeetingParts';
import { SheetThumbnail as ReactSheetThumbnail } from '../meetings/MeetingPlays';
import { t } from '../i18n';
import { PlayTimes, RecordBadge, SheetThumbnail } from './meetings/MeetingParts';
import { renderSolid as renderWithHost } from './testing';
import { normalize } from './ui/normalizeDom';

/*
 * Zgodność DOM elementów współdzielonych (docs/solidjs-2-migration.md) z wersjami React, które
 * zostają w obszarach jeszcze niezmigrowanych: okładka gry (spotkania, notesy) i elementy spotkań
 * używane przez kolekcję i karteczkę (etap 5a). Pasek filtrów i kalendarz rankingu są od etapu 4
 * tylko w Solid (`leaderboard/`), kadr zdjęcia od etapu 5a (`profile/AvatarCropper`).
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

interface Case {
  readonly name: string;
  readonly react: () => ReactElement;
  readonly solid: () => ReturnType<typeof GameCover>;
  readonly act?: (container: HTMLElement) => void;
}

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
    name: 'SheetThumbnail: kartka zastępcza, mała, z obrazem',
    react: () =>
      withReact(
        h(
          'div',
          null,
          h(ReactSheetThumbnail, { gameId: 'g1', imageUrl: null }),
          h(ReactSheetThumbnail, { gameId: 'g2', imageUrl: null, small: true, className: 'c' }),
          h(ReactSheetThumbnail, { gameId: 'g3', imageUrl: '/s.png' }),
        ),
      ),
    solid: () => (
      <div>
        <SheetThumbnail gameId="g1" imageUrl={null} />
        <SheetThumbnail gameId="g2" imageUrl={null} small class="c" />
        <SheetThumbnail gameId="g3" imageUrl="/s.png" />
      </div>
    ),
  },
  {
    name: 'PlayTimes i RecordBadge',
    react: () =>
      h(
        'div',
        null,
        h(ReactPlayTimes, {
          startedAt: '2026-11-06T18:00:00Z',
          endedAt: '2026-11-06T19:25:00Z',
          timeZone: 'Europe/Warsaw',
          labels: t.sheets,
        }),
        h(ReactRecordBadge, { kind: 'club' }),
        h(ReactRecordBadge, { kind: 'personal' }),
      ),
    solid: () => (
      <div>
        <PlayTimes
          startedAt="2026-11-06T18:00:00Z"
          endedAt="2026-11-06T19:25:00Z"
          timeZone="Europe/Warsaw"
          labels={t.sheets}
        />
        <RecordBadge kind="club" />
        <RecordBadge kind="personal" />
      </div>
    ),
  },
];

describe('zgodność DOM elementów współdzielonych', () => {
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
