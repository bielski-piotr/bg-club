import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  // Popupy zapisują stos w adresie; każdy test zaczyna od czystego adresu.
  window.history.replaceState(null, '', '/');
});
