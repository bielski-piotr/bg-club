import '@testing-library/jest-dom/vitest';
import { cleanup } from '@solidjs/testing-library';
import { afterEach } from 'vitest';

// Bez globali Vitesta biblioteka nie odmontowuje renderów sama.
afterEach(cleanup);
