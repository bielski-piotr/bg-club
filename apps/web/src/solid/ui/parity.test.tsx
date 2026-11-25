/** @jsxImportSource @solidjs/web */
import { fireEvent, render as renderSolid } from '@solidjs/testing-library';
import { act, render as renderReact } from '@testing-library/react';
import type { JSX } from '@solidjs/web';
import { createElement, type ReactElement } from 'react';
import { flush } from 'solid-js';
import { describe, expect, it } from 'vitest';
import * as R from '../../ui';
import * as S from './index';
import { normalize } from './normalizeDom';

/*
 * Zgodność DOM komponentów Solid z wersją React (etap 1, docs/solidjs-2-migration.md): ten sam
 * CSS i testy e2e działają tylko przy identycznym drzewie. Porównanie pomija kolejność
 * atrybutów, klas i deklaracji stylu oraz konkretne wartości identyfikatorów (`useId` i
 * `createUniqueId` dają inne), ale zachowuje powiązania między nimi.
 */

/**
 * `createElement` bez sprawdzania propsów: przypadki podają `children` trzecim argumentem,
 * a typy Reacta wymagają ich w propsach. Propsy sprawdza wersja Solid tego samego przypadku.
 */
const h = (type: unknown, props?: unknown, ...children: unknown[]): ReactElement =>
  createElement(type as never, props as never, ...(children as never[]));

interface Case {
  readonly name: string;
  readonly react: () => ReactElement;
  readonly solid: () => JSX.Element;
  /** Interakcja przed porównaniem (np. otwarcie listy), w obu drzewach. */
  readonly act?: (container: HTMLElement) => void;
}

const noop = () => undefined;
const people = ['Ania A', 'Bartek B', 'Ewa E', 'Julia J', 'Ola O'].map((name, i) => ({
  name,
  id: `p${i}`,
}));
const options = [
  { value: 'all', label: 'Wszystkie lata' },
  { value: '2026', label: '2026', meta: 'teraz' },
  { value: '2025', label: '2025', disabled: true },
] as const;
const choices = [
  { value: 'a', label: 'Ptaki' },
  { value: 'b', label: 'Jajka', disabled: true },
  { value: 'c', label: 'Żywność' },
] as const;
const menuItems = [
  { id: 'edit', label: 'Edytuj', icon: 'pencil' as const, onSelect: noop },
  { id: 'delete', label: 'Usuń', icon: 'trash' as const, destructive: true, onSelect: noop },
];
const clickFirstButton = (container: HTMLElement) => {
  const button = container.querySelector('button');
  if (button) fireEvent.click(button);
};

const cases: Case[] = [
  {
    name: 'Button: wariant, ikona, pełna szerokość',
    react: () =>
      h(
        R.Button,
        { variant: 'secondary', size: 'sm', icon: 'plus', fullWidth: true, className: 'x' },
        'Dodaj',
      ),
    solid: () => (
      <S.Button variant="secondary" size="sm" icon="plus" fullWidth class="x">
        Dodaj
      </S.Button>
    ),
  },
  {
    name: 'Button: ładowanie, submit',
    react: () => h(R.Button, { loading: true, type: 'submit' }, 'Zapisz'),
    solid: () => (
      <S.Button loading type="submit">
        Zapisz
      </S.Button>
    ),
  },
  {
    name: 'IconButton',
    react: () => h(R.IconButton, { icon: 'more', label: 'Więcej', size: 32 }),
    solid: () => <S.IconButton icon="more" label="Więcej" size={32} />,
  },
  {
    name: 'TextLink: link i przycisk',
    react: () =>
      h(
        'div',
        null,
        h(R.TextLink, { href: '/x' }, 'Zobacz'),
        h(R.TextLink, { chevron: false }, 'Więcej'),
      ),
    solid: () => (
      <div>
        <S.TextLink href="/x">Zobacz</S.TextLink>
        <S.TextLink chevron={false}>Więcej</S.TextLink>
      </div>
    ),
  },
  {
    name: 'Badge, StatusChip, MetaChip',
    react: () =>
      h(
        'div',
        null,
        h(R.Badge, { tone: 'accent', onAccent: true }, 'Ty'),
        h(R.Badge, null, 'Admin'),
        h(R.StatusChip, { tone: 'success' }, 'Trwa'),
        h(R.MetaChip, { icon: 'user' }, '1–5 graczy'),
        h(R.MetaChip, null, 'bez ikony'),
      ),
    solid: () => (
      <div>
        <S.Badge tone="accent" onAccent>
          Ty
        </S.Badge>
        <S.Badge>Admin</S.Badge>
        <S.StatusChip tone="success">Trwa</S.StatusChip>
        <S.MetaChip icon="user">1–5 graczy</S.MetaChip>
        <S.MetaChip>bez ikony</S.MetaChip>
      </div>
    ),
  },
  {
    name: 'Spinner z etykietą i bez',
    react: () =>
      h(
        'div',
        null,
        h(R.Spinner, { size: 24, label: 'Wczytywanie' }),
        h(R.Spinner, { className: 'y' }),
      ),
    solid: () => (
      <div>
        <S.Spinner size={24} label="Wczytywanie" />
        <S.Spinner class="y" />
      </div>
    ),
  },
  {
    name: 'Banner, EmptyState, Skeleton',
    react: () =>
      h(
        'div',
        null,
        h(R.Banner, { variant: 'error', action: h(R.Button, { size: 'sm' }, 'Ponów') }, 'Błąd'),
        h(R.Banner, { variant: 'info' }, 'Info'),
        h(R.EmptyState, {
          icon: 'dice',
          title: 'Pusto',
          helper: 'Dodaj grę',
          action: h(R.Button, { fullWidth: true }, 'Dodaj'),
        }),
        h(R.EmptyState, { lead: h('span', null, '🎲'), title: 'Inny' }),
        h(R.Skeleton, { width: 240, height: 64, radius: 18 }),
        h(R.Skeleton, null),
      ),
    solid: () => (
      <div>
        <S.Banner variant="error" action={<S.Button size="sm">Ponów</S.Button>}>
          Błąd
        </S.Banner>
        <S.Banner variant="info">Info</S.Banner>
        <S.EmptyState
          icon="dice"
          title="Pusto"
          helper="Dodaj grę"
          action={<S.Button fullWidth>Dodaj</S.Button>}
        />
        <S.EmptyState lead={<span>🎲</span>} title="Inny" />
        <S.Skeleton width={240} height={64} radius={18} />
        <S.Skeleton />
      </div>
    ),
  },
  {
    name: 'Card z licznikiem i akcją, h3',
    react: () =>
      h(
        'div',
        null,
        h(
          R.Card,
          { title: 'Członkowie', count: '12 osób', action: h('a', { href: '/' }, 'Więcej') },
          h('p', null, 'treść'),
        ),
        h(R.Card, { title: 'Ranking', headingLevel: 3 }, 'x'),
      ),
    solid: () => (
      <div>
        <S.Card title="Członkowie" count="12 osób" action={<a href="/">Więcej</a>}>
          <p>treść</p>
        </S.Card>
        <S.Card title="Ranking" headingLevel={3}>
          x
        </S.Card>
      </div>
    ),
  },
  {
    name: 'Tray i ListRow',
    react: () =>
      h(
        R.Tray,
        { label: 'Lista' },
        h(R.ListRow, {
          leading: '1',
          title: 'Ania',
          meta: '12 pkt',
          trailing: h(R.Badge, null, 'Ty'),
          highlighted: true,
          height: 64,
        }),
        h(R.ListRow, { title: 'Bartek', muted: true, onClick: noop }),
      ),
    solid: () => (
      <S.Tray label="Lista">
        <S.ListRow
          leading="1"
          title="Ania"
          meta="12 pkt"
          trailing={<S.Badge>Ty</S.Badge>}
          highlighted
          height={64}
        />
        <S.ListRow title="Bartek" muted onClick={noop} />
      </S.Tray>
    ),
  },
  {
    name: 'ShowMore',
    react: () =>
      h(
        'div',
        null,
        h(R.ShowMore, { hidden: 3, onClick: noop }),
        h(R.ShowMore, { hidden: 0, onClick: noop }),
      ),
    solid: () => (
      <div>
        <S.ShowMore hidden={3} onClick={noop} />
        <S.ShowMore hidden={0} onClick={noop} />
      </div>
    ),
  },
  {
    name: 'Avatar: warianty',
    react: () =>
      h(
        'div',
        null,
        h(R.Avatar, { name: 'Łukasz Żak' }),
        h(R.Avatar, { name: 'Jan Kowalski', removed: true, size: 56 }),
        h(R.Avatar, {
          id: 'u1',
          name: 'Ola',
          src: '/a.png',
          ring: 'white',
          decorative: true,
          size: 24,
          className: 'z',
        }),
      ),
    solid: () => (
      <div>
        <S.Avatar name="Łukasz Żak" />
        <S.Avatar name="Jan Kowalski" removed size={56} />
        <S.Avatar id="u1" name="Ola" src="/a.png" ring="white" decorative size={24} class="z" />
      </div>
    ),
  },
  {
    name: 'AvatarStack z +N i bez',
    react: () =>
      h(
        'div',
        null,
        h(R.AvatarStack, { people, size: 64, max: 2, showOverflow: true }),
        h(R.AvatarStack, { people, size: 28 }),
      ),
    solid: () => (
      <div>
        <S.AvatarStack people={people} size={64} max={2} showOverflow />
        <S.AvatarStack people={people} size={28} />
      </div>
    ),
  },
  {
    name: 'Checkbox, RadioGroup, SegmentedControl, ChipGroup, ColorSwatches',
    react: () =>
      h(
        'div',
        null,
        h(R.Checkbox, { label: 'Zgoda', checked: true, onCheckedChange: noop }),
        h(R.Checkbox, {
          label: 'Wyłączona',
          checked: false,
          disabled: true,
          onCheckedChange: noop,
        }),
        h(R.RadioGroup, {
          legend: 'Rodzaj',
          options: choices,
          value: 'c',
          onChange: noop,
          name: 'kind',
        }),
        h(R.SegmentedControl, {
          legend: 'Kierunek',
          options: choices,
          value: 'a',
          onChange: noop,
          name: 'dir',
        }),
        h(R.ChipGroup, { legend: 'Kategorie', options: choices, values: ['c'], onChange: noop }),
        h(R.ColorSwatches, {
          legend: 'Kolor',
          hideLegend: true,
          options: [
            { value: 'r', label: 'Czerwony', color: 'red' },
            { value: 'g', label: 'Zielony', color: 'green' },
          ],
          value: 'g',
          onChange: noop,
        }),
      ),
    solid: () => (
      <div>
        <S.Checkbox label="Zgoda" checked onCheckedChange={noop} />
        <S.Checkbox label="Wyłączona" checked={false} disabled onCheckedChange={noop} />
        <S.RadioGroup legend="Rodzaj" options={choices} value="c" onChange={noop} name="kind" />
        <S.SegmentedControl
          legend="Kierunek"
          options={choices}
          value="a"
          onChange={noop}
          name="dir"
        />
        <S.ChipGroup legend="Kategorie" options={choices} values={['c']} onChange={noop} />
        <S.ColorSwatches
          legend="Kolor"
          hideLegend
          options={[
            { value: 'r', label: 'Czerwony', color: 'red' },
            { value: 'g', label: 'Zielony', color: 'green' },
          ]}
          value="g"
          onChange={noop}
        />
      </div>
    ),
  },
  {
    name: 'Switch i Slider',
    react: () =>
      h(
        'div',
        null,
        h(R.Switch, {
          label: 'Wygładź',
          description: 'Opis',
          checked: true,
          onCheckedChange: noop,
        }),
        h(R.Switch, { label: 'Wyłączony', checked: false, disabled: true, onCheckedChange: noop }),
        h(R.Slider, {
          label: 'Siła',
          min: 0,
          max: 10,
          value: 4,
          onValueChange: noop,
          formatValue: (v: number) => `${v * 10}%`,
        }),
      ),
    solid: () => (
      <div>
        <S.Switch label="Wygładź" description="Opis" checked onCheckedChange={noop} />
        <S.Switch label="Wyłączony" checked={false} disabled onCheckedChange={noop} />
        <S.Slider
          label="Siła"
          min={0}
          max={10}
          value={4}
          onValueChange={noop}
          formatValue={(v) => `${v * 10}%`}
        />
      </div>
    ),
  },
  {
    name: 'Tabs z panelem',
    react: () =>
      h(
        R.Tabs,
        {
          label: 'Zakres',
          items: [
            { id: 'a', label: 'Punkty' },
            { id: 'b', label: 'Wygrane' },
          ],
          value: 'b',
          onChange: noop,
        },
        (v: string) => h('p', null, `Panel ${v}`),
      ),
    solid: () => (
      <S.Tabs
        label="Zakres"
        items={[
          { id: 'a', label: 'Punkty' },
          { id: 'b', label: 'Wygrane' },
        ]}
        value="b"
        onChange={noop}
      >
        {(v) => <p>{`Panel ${v}`}</p>}
      </S.Tabs>
    ),
  },
  {
    name: 'TextField, PasswordField, SearchField, Stepper',
    react: () =>
      h(
        'div',
        null,
        h(R.TextField, {
          label: 'Imię',
          hint: 'Widzą je wszyscy.',
          optional: true,
          defaultValue: '',
        }),
        h(R.TextField, {
          label: 'Waga',
          error: 'Za dużo.',
          leadingIcon: 'clock',
          trailing: 'kg',
          numeric: true,
          mono: true,
          readOnly: true,
          disabled: true,
        }),
        h(R.PasswordField, { label: 'Hasło' }),
        h(R.SearchField, {
          label: 'Szukaj',
          value: 'azul',
          onValueChange: noop,
          placeholder: 'Szukaj gry',
        }),
        h(R.SearchField, { label: 'Pusto', value: '', onValueChange: noop }),
        h(R.Stepper, {
          label: 'Gracze',
          value: 2,
          min: 1,
          max: 4,
          onChange: noop,
          hint: 'Od 1 do 4',
        }),
        h(R.Stepper, { label: 'Punkty', value: 0, onChange: noop, error: 'Błąd', disabled: true }),
      ),
    solid: () => (
      <div>
        <S.TextField label="Imię" hint="Widzą je wszyscy." optional />
        <S.TextField
          label="Waga"
          error="Za dużo."
          leadingIcon="clock"
          trailing="kg"
          numeric
          mono
          readonly
          disabled
        />
        <S.PasswordField label="Hasło" />
        <S.SearchField label="Szukaj" value="azul" onValueChange={noop} placeholder="Szukaj gry" />
        <S.SearchField label="Pusto" value="" onValueChange={noop} />
        <S.Stepper label="Gracze" value={2} min={1} max={4} onChange={noop} hint="Od 1 do 4" />
        <S.Stepper label="Punkty" value={0} onChange={noop} error="Błąd" disabled />
      </div>
    ),
  },
  {
    name: 'Select zamknięty (pole i pigułka)',
    react: () =>
      h(
        'div',
        null,
        h(R.Select, {
          label: 'Rok',
          options,
          value: '2026',
          onChange: noop,
          hint: 'Rok rozgrywek',
          leadingIcon: 'calendar',
        }),
        h(R.Select, {
          label: 'Filtr',
          hideLabel: true,
          appearance: 'pill',
          options,
          value: null,
          onChange: noop,
          error: 'Wybierz',
        }),
      ),
    solid: () => (
      <div>
        <S.Select
          label="Rok"
          options={options}
          value="2026"
          onChange={noop}
          hint="Rok rozgrywek"
          leadingIcon="calendar"
        />
        <S.Select
          label="Filtr"
          hideLabel
          appearance="pill"
          options={options}
          value={null}
          onChange={noop}
          error="Wybierz"
        />
      </div>
    ),
  },
  {
    name: 'Select otwarty',
    react: () => h(R.Select, { label: 'Rok', options, value: '2026', onChange: noop }),
    solid: () => <S.Select label="Rok" options={options} value="2026" onChange={noop} />,
    act: clickFirstButton,
  },
  {
    name: 'Select otwarty z wyszukiwarką',
    react: () =>
      h(R.Select, {
        label: 'Strefa',
        options,
        value: 'all',
        onChange: noop,
        searchLabel: 'Szukaj strefy',
      }),
    solid: () => (
      <S.Select
        label="Strefa"
        options={options}
        value="all"
        onChange={noop}
        searchLabel="Szukaj strefy"
      />
    ),
    act: clickFirstButton,
  },
  {
    name: 'Menu zamknięte i otwarte',
    react: () =>
      h(R.Menu, {
        label: 'Akcje',
        align: 'end',
        items: menuItems,
        trigger: (props: R.MenuTriggerProps) =>
          h('button', { type: 'button', ...props, className: 'icon-btn' }, 'more'),
      }),
    solid: () => (
      <S.Menu
        label="Akcje"
        align="end"
        items={menuItems}
        trigger={(props) => (
          <button type="button" {...props} class="icon-btn">
            more
          </button>
        )}
      />
    ),
    act: clickFirstButton,
  },
  {
    name: 'Modal z ←, licznikiem, akcjami i stopką',
    react: () =>
      h(
        R.Modal,
        {
          title: 'Członkowie',
          count: '12 osób',
          actions: h(R.Button, { size: 'sm' }, 'Dodaj'),
          onClose: noop,
          onBack: noop,
          onScrimClick: noop,
          width: 880,
          level: 1,
          footer: h(R.Button, null, 'Zapisz'),
          className: 'm',
        },
        h('p', null, 'treść'),
      ),
    solid: () => (
      <S.Modal
        title="Członkowie"
        count="12 osób"
        actions={<S.Button size="sm">Dodaj</S.Button>}
        onClose={noop}
        onBack={noop}
        onScrimClick={noop}
        width={880}
        level={1}
        footer={<S.Button>Zapisz</S.Button>}
        class="m"
      >
        <p>treść</p>
      </S.Modal>
    ),
  },
  {
    name: 'Modal przykryty i zablokowany',
    react: () =>
      h(
        'div',
        null,
        h(R.Modal, { title: 'A', onClose: noop, covered: true }, 'a'),
        h(R.Modal, { title: 'B', onClose: noop, blocked: true }, 'b'),
      ),
    solid: () => (
      <div>
        <S.Modal title="A" onClose={noop} covered>
          a
        </S.Modal>
        <S.Modal title="B" onClose={noop} blocked>
          b
        </S.Modal>
      </div>
    ),
  },
  {
    name: 'Dialog: ikona, opis, treść; media',
    react: () =>
      h(
        'div',
        null,
        h(
          R.Dialog,
          {
            title: 'Usunąć?',
            description: 'Nie da się cofnąć.',
            icon: 'trash',
            tone: 'danger',
            level: 2,
            footer: h(R.Button, null, 'Usuń'),
          },
          h('p', null, 'pole'),
        ),
        h(R.Dialog, {
          title: 'Okładka',
          media: h('img', { alt: '' }),
          covered: true,
          footer: 'ok',
        }),
      ),
    solid: () => (
      <div>
        <S.Dialog
          title="Usunąć?"
          description="Nie da się cofnąć."
          icon="trash"
          tone="danger"
          level={2}
          footer={<S.Button>Usuń</S.Button>}
        >
          <p>pole</p>
        </S.Dialog>
        <S.Dialog title="Okładka" media={<img alt="" />} covered footer="ok" />
      </div>
    ),
  },
];

describe('zgodność DOM komponentów Solid z React', () => {
  it.each(cases)('$name', (c) => {
    const react = renderReact(c.react());
    if (c.act) act(() => c.act?.(react.container));
    const expected = normalize(react.container);
    react.unmount();

    const solid = renderSolid(() => c.solid());
    if (c.act) {
      c.act(solid.container);
      flush();
    }
    expect(normalize(solid.container)).toBe(expected);
  });

  it('normalizacja rozróżnia inne drzewa (kontrola testu)', () => {
    const a = renderReact(h(R.Badge, { tone: 'accent' }, 'Ty'));
    const accent = normalize(a.container);
    a.unmount();
    const b = renderSolid(() => <S.Badge tone="neutral">Ty</S.Badge>);
    expect(normalize(b.container)).not.toBe(accent);
  });

  it('każda ikona ma te same węzły', () => {
    expect([...S.iconNames].sort()).toEqual([...R.iconNames].sort());
    for (const name of R.iconNames) {
      const react = renderReact(h(R.Icon, { name, size: 20, className: 'i' }));
      const expected = normalize(react.container);
      react.unmount();
      const solid = renderSolid(() => <S.Icon name={name} size={20} class="i" />);
      expect(normalize(solid.container), name).toBe(expected);
      solid.unmount();
    }
  });
});
