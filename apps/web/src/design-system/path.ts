/** Adres galerii komponentów. Routing aplikacji ([007]) przejmie go bez zmian. */
export const DESIGN_SYSTEM_PATH = '/design-system';

export function isDesignSystemPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, '') === DESIGN_SYSTEM_PATH;
}
