import { AuthApiError, AuthRetryableFetchError, AuthUnknownError } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { ACCOUNT_INACTIVE_MESSAGE, loginErrorKind } from './errors';

describe('loginErrorKind', () => {
  it('rozpoznaje złe dane logowania', () => {
    expect(
      loginErrorKind(new AuthApiError('Invalid login credentials', 400, 'invalid_credentials')),
    ).toBe('invalidCredentials');
  });

  it('rozpoznaje odmowę hooka Auth dla konta usuniętego i blokadę konta', () => {
    expect(loginErrorKind(new AuthApiError(ACCOUNT_INACTIVE_MESSAGE, 403, 'unknown'))).toBe(
      'accountInactive',
    );
    expect(loginErrorKind(new AuthApiError('User is banned', 400, 'user_banned'))).toBe(
      'accountInactive',
    );
  });

  it('rozpoznaje limit prób', () => {
    expect(loginErrorKind(new AuthApiError('Too many', 429, 'over_request_rate_limit'))).toBe(
      'rateLimited',
    );
    expect(loginErrorKind(new AuthApiError('Too many', 429, undefined))).toBe('rateLimited');
  });

  it('rozpoznaje brak połączenia', () => {
    expect(loginErrorKind(new AuthRetryableFetchError('Failed to fetch', 0))).toBe('network');
  });

  it('pozostałe błędy są nieznane', () => {
    expect(loginErrorKind(new AuthApiError('Database error', 500, 'unexpected_failure'))).toBe(
      'unknown',
    );
    expect(loginErrorKind(new AuthUnknownError('?', null))).toBe('unknown');
    expect(loginErrorKind(new Error('?'))).toBe('unknown');
  });

  it('każdy rodzaj błędu ma polski komunikat', () => {
    for (const kind of [
      'invalidCredentials',
      'accountInactive',
      'rateLimited',
      'network',
      'unknown',
    ] as const) {
      expect(t.auth.errors[kind]).toMatch(/\.$/);
    }
  });
});
