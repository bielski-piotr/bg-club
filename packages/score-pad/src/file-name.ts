/**
 * Nazwa pliku notesu: `notes-<nazwa bez polskich znaków>.json`. Tę samą nazwę dają „Zapisz
 * pliku” w edytorze i eksport notesu z aplikacji .
 */
export function scorePadFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `notes-${slug || 'notes'}.json`;
}
