import { useEffect, useRef } from 'react';

/**
 * Czy komponent jest nadal zamontowany. Dialog zamknięty w trakcie żądania (Esc, tło) jest
 * odmontowany: po sukcesie nie cofamy wtedy historii drugi raz.
 */
export function useMounted() {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}
