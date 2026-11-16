import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ShowMore } from './ShowMore';
import { useChunks } from './chunks';

/** Lista rysowana porcjami (NFR-2, zadanie [040]). */
function List({ items, query }: { readonly items: readonly string[]; readonly query: string }) {
  const chunks = useChunks(items, query, 2);
  return (
    <>
      <ul>
        {chunks.visible.map((item, index) => (
          <li key={item} data-chunk-start={chunks.chunkStart(index)}>
            <button type="button">{item}</button>
          </li>
        ))}
      </ul>
      <ShowMore hidden={chunks.hidden} onClick={chunks.showMore} />
    </>
  );
}

const items = ['a', 'b', 'c', 'd', 'e'];

describe('useChunks', () => {
  it('rysuje pierwszą porcję i dorysowuje kolejne, przenosząc fokus na pierwszą nową', () => {
    render(<List items={items} query="" />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Pokaż więcej (3)' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'c' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Pokaż więcej (1)' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'e' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: /Pokaż więcej/ })).toBeNull();
  });

  it('wraca do pierwszej porcji po zmianie frazy', () => {
    const { rerender } = render(<List items={items} query="" />);
    fireEvent.click(screen.getByRole('button', { name: 'Pokaż więcej (3)' }));
    rerender(<List items={items} query="x" />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
