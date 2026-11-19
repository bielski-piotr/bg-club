import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Component tests import the real lazy popup modules, including scorepad code.
// A cold module transform on Windows can exceed Testing Library's default 1 s.
// Product timing is asserted separately by the throttled Playwright performance test.
configure({ asyncUtilTimeout: 5_000 });

afterEach(() => {
  cleanup();
  // Popupy zapisują stos w adresie; każdy test zaczyna od czystego adresu.
  window.history.replaceState(null, '', '/');
});
