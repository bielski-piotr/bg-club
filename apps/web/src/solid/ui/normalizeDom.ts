/*
 * Znormalizowany zapis drzewa DOM do testów zgodności React ↔ Solid (docs/solidjs-2-migration.md):
 * bez kolejności atrybutów, klas i deklaracji stylu oraz bez konkretnych wartości identyfikatorów
 * (`useId` i `createUniqueId` dają inne), ale z zachowaniem powiązań między nimi; wartości pól
 * z właściwości DOM, nie z atrybutów.
 */

const ID_ATTRS = new Set([
  'id',
  'for',
  'aria-labelledby',
  'aria-describedby',
  'aria-controls',
  'aria-activedescendant',
  'name',
]);

export function normalize(root: Element): string {
  const ids = new Map<string, string>();
  const idOf = (value: string) =>
    value
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => {
        if (!ids.has(token)) ids.set(token, `#${ids.size}`);
        return ids.get(token);
      })
      .join(' ');
  const lines: string[] = [];
  const walk = (node: Node, depth: number) => {
    const pad = '  '.repeat(depth);
    let text = '';
    const flushText = () => {
      if (text.trim() !== '') lines.push(`${pad}"${text}"`);
      text = '';
    };
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent ?? '';
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      flushText();
      const el = child as Element;
      const attrs: string[] = [];
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name;
        if (el instanceof HTMLInputElement && (name === 'value' || name === 'checked')) continue;
        let value = attr.value;
        if (name === 'class')
          value = [...new Set(value.split(/\s+/).filter(Boolean))].sort().join(' ');
        else if (name === 'style')
          value = value
            .split(';')
            .map((d) => d.trim().replace(/\s*:\s*/, ': '))
            .filter(Boolean)
            .sort()
            .join('; ');
        else if (ID_ATTRS.has(name)) value = idOf(value);
        attrs.push(`${name}="${value}"`);
      }
      if (el instanceof HTMLInputElement) {
        if (el.type === 'checkbox' || el.type === 'radio') attrs.push(`.checked=${el.checked}`);
        else attrs.push(`.value="${el.value}"`);
      }
      attrs.sort();
      lines.push(`${pad}<${el.tagName.toLowerCase()}${attrs.length ? ' ' + attrs.join(' ') : ''}>`);
      walk(el, depth + 1);
    }
    flushText();
  };
  walk(root, 0);
  return lines.join('\n');
}
