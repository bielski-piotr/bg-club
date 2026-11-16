import { useState } from 'react';
import { format, t } from '../i18n';
import { Select } from '../ui';
import './manualTies.css';

const text = t.scorepads.manual;

/** Each select ranks a player only within the original unresolved group. */
export function ManualTieControls({
  groups,
  nameOf,
  onChange,
  disabled = false,
}: {
  readonly groups: readonly (readonly number[])[];
  readonly nameOf: (seat: number) => string;
  readonly onChange: (decisions: number[][][]) => void;
  readonly disabled?: boolean;
}) {
  const [positions, setPositions] = useState<Record<number, string>>({});
  if (!groups.length) return null;
  return (
    <section className="manual-ties" aria-label={text.title}>
      <h3 className="manual-ties__title">{text.title}</h3>
      <p className="manual-ties__hint">{text.hint}</p>
      {groups.map((group, index) => (
        <fieldset className="manual-ties__group" key={group.join(',')}>
          <legend>{format(text.group, { n: index + 1 })}</legend>
          {group.map((seat) => (
            <Select
              key={seat}
              label={format(text.position, { name: nameOf(seat) })}
              value={positions[seat] ?? '1'}
              disabled={disabled}
              options={group.map((_, i) => ({
                value: String(i + 1),
                label: format(text.order, { n: i + 1 }),
              }))}
              onChange={(value) => {
                const next = { ...positions, [seat]: value };
                setPositions(next);
                onChange(
                  groups.map((seats) => {
                    const orders = [...new Set(seats.map((s) => Number(next[s] ?? 1)))].sort(
                      (a, b) => a - b,
                    );
                    return orders.map((order) =>
                      seats.filter((s) => Number(next[s] ?? 1) === order),
                    );
                  }),
                );
              }}
            />
          ))}
        </fieldset>
      ))}
    </section>
  );
}
