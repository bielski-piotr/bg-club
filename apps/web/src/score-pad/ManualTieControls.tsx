/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from 'solid-js';
import { format, t } from '../i18n';
import { Select } from '../solid/ui';
import './manualTies.css';

const text = t.scorepads.manual;

/**
 * Ręczne rozstrzygnięcie remisów: każdy wybór ustawia gracza tylko w obrębie jego pierwotnej
 * grupy. Wersja React dla podsumowania partii (etap 6): `react-shared/ManualTieControls.tsx`.
 */
export function ManualTieControls(props: {
  readonly groups: readonly (readonly number[])[];
  readonly nameOf: (seat: number) => string;
  readonly onChange: (decisions: number[][][]) => void;
  readonly disabled?: boolean;
}) {
  const [positions, setPositions] = createSignal<Record<number, string>>({});
  let current: Record<number, string> = {};
  const choose = (seat: number, value: string) => {
    current = { ...current, [seat]: value };
    setPositions(current);
    props.onChange(
      props.groups.map((seats) => {
        const orders = [...new Set(seats.map((s) => Number(current[s] ?? 1)))].sort(
          (a, b) => a - b,
        );
        return orders.map((order) => seats.filter((s) => Number(current[s] ?? 1) === order));
      }),
    );
  };
  return (
    <Show when={props.groups.length > 0}>
      <section class="manual-ties" aria-label={text.title}>
        <h3 class="manual-ties__title">{text.title}</h3>
        <p class="manual-ties__hint">{text.hint}</p>
        <For each={props.groups} keyed={(group) => group.join(',')}>
          {(group, index) => (
            <fieldset class="manual-ties__group">
              <legend>{format(text.group, { n: index() + 1 })}</legend>
              <For each={group()}>
                {(seat) => (
                  <Select
                    label={format(text.position, { name: props.nameOf(seat) })}
                    value={positions()[seat] ?? '1'}
                    disabled={props.disabled ?? false}
                    options={group().map((_, i) => ({
                      value: String(i + 1),
                      label: format(text.order, { n: i + 1 }),
                    }))}
                    onChange={(value) => choose(seat, value)}
                  />
                )}
              </For>
            </fieldset>
          )}
        </For>
      </section>
    </Show>
  );
}
