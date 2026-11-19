import { describe, expect, it } from 'vitest';
import { isValidHook, MIN_PASSWORD_LENGTH, type RandomSource } from './index.ts';
import {
  createMember,
  CreateMemberError,
  HOOK_ATTEMPTS,
  validateMemberInput,
  type CreateAccountResult,
  type MemberAccounts,
} from './member.ts';

/** Bajty z listy, potem prawdziwy generator (sufiksy hooka są pierwszymi dwoma bajtami). */
function scripted(prefix: readonly number[]): RandomSource {
  let i = 0;
  return (bytes) => {
    for (let j = 0; j < bytes.length; j += 1) {
      const next = prefix[i];
      bytes[j] = next ?? globalThis.crypto.getRandomValues(new Uint8Array(1))[0] ?? 0;
      i += 1;
    }
    return bytes;
  };
}

interface FakeOptions {
  readonly taken?: readonly string[];
  /** Hooki zajęte „w międzyczasie”: `hookTaken` mówi nie, ale Auth odrzuca e-mail. */
  readonly raced?: readonly string[];
  /** Hooki zajęte przez profil usuniętego konta: Auth nie zna e-maila, wyzwalacz łamie `profiles_hook_key`. */
  readonly profileOnly?: readonly string[];
  readonly fail?: string;
}

function fakeAccounts(options: FakeOptions = {}) {
  const profiles = new Set(options.taken ?? []);
  const created: { email: string; password: string; firstName: string; lastName: string }[] = [];
  const checked: string[] = [];
  const raced = new Set(options.raced ?? []);
  const profileOnly = new Set(options.profileOnly ?? []);
  let racedCheck = false;
  const accounts: MemberAccounts = {
    hookTaken: async (hook) => {
      checked.push(hook);
      if (profileOnly.has(hook)) {
        // Pierwsze sprawdzenie „nie widzi” profilu (wyścig), drugie już tak.
        racedCheck = !racedCheck;
        return !racedCheck;
      }
      return profiles.has(hook);
    },
    createAccount: async (account): Promise<CreateAccountResult> => {
      const hook = account.email.split('@')[0] ?? '';
      if (options.fail) return { ok: false, emailTaken: false, message: options.fail };
      if (raced.has(hook)) {
        return { ok: false, emailTaken: true, message: 'email_exists' };
      }
      if (profileOnly.has(hook)) {
        return { ok: false, emailTaken: false, message: 'Database error creating new user' };
      }
      created.push(account);
      profiles.add(hook);
      return { ok: true, userId: `user-${created.length}` };
    },
  };
  return { accounts, created, checked };
}

describe('tworzenie członka', () => {
  it('tworzy hook z polskimi znakami i hasło z generatora kryptograficznego', async () => {
    const { accounts, created } = fakeAccounts();
    const member = await createMember(
      accounts,
      { firstName: '  Łukasz ', lastName: 'Żółw-Ćmielowska ' },
      scripted([0x7c, 0x1e]),
    );
    expect(member.hook).toBe('lukasz-zolw-cmielowska-7c1e');
    expect(isValidHook(member.hook)).toBe(true);
    expect(member).toMatchObject({ firstName: 'Łukasz', lastName: 'Żółw-Ćmielowska' });
    expect(member.password.length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
    expect(created).toEqual([
      {
        email: 'lukasz-zolw-cmielowska-7c1e@users.bgclub.invalid',
        password: member.password,
        firstName: 'Łukasz',
        lastName: 'Żółw-Ćmielowska',
      },
    ]);
  });

  it('każdy członek dostaje inne hasło', async () => {
    const { accounts } = fakeAccounts();
    const a = await createMember(accounts, { firstName: 'Anna', lastName: 'Nowak' });
    const b = await createMember(accounts, { firstName: 'Anna', lastName: 'Nowak' });
    expect(a.password).not.toBe(b.password);
    expect(a.hook).not.toBe(b.hook);
  });

  it('przy kolizji hooka (także usuniętego członka) losuje nowy sufiks', async () => {
    const { accounts, created, checked } = fakeAccounts({ taken: ['jan-kowalski-0001'] });
    const member = await createMember(
      accounts,
      { firstName: 'Jan', lastName: 'Kowalski' },
      scripted([0x00, 0x01, 0x00, 0x02]),
    );
    expect(checked.slice(0, 2)).toEqual(['jan-kowalski-0001', 'jan-kowalski-0002']);
    expect(member.hook).toBe('jan-kowalski-0002');
    expect(created).toHaveLength(1);
  });

  it('ponawia, gdy hook zajęło równoległe żądanie (Auth: email_exists)', async () => {
    const { accounts, created } = fakeAccounts({ raced: ['jan-kowalski-0001'] });
    const member = await createMember(
      accounts,
      { firstName: 'Jan', lastName: 'Kowalski' },
      scripted([0x00, 0x01, ...new Array<number>(32).fill(7), 0x00, 0x03]),
    );
    expect(member.hook).toBe('jan-kowalski-0003');
    expect(created.map((c) => c.email)).toEqual(['jan-kowalski-0003@users.bgclub.invalid']);
  });

  it('ponawia, gdy bazę zablokował profil z tym hookiem (profiles_hook_key)', async () => {
    const { accounts } = fakeAccounts({ profileOnly: ['jan-kowalski-0001'] });
    const member = await createMember(
      accounts,
      { firstName: 'Jan', lastName: 'Kowalski' },
      scripted([0x00, 0x01, ...new Array<number>(32).fill(7), 0x00, 0x04]),
    );
    expect(member.hook).toBe('jan-kowalski-0004');
  });

  it(`po ${HOOK_ATTEMPTS} zajętych hookach kończy się błędem i nic nie tworzy`, async () => {
    const { accounts, created } = fakeAccounts({ taken: ['jan-kowalski-0001'] });
    const always: RandomSource = (bytes) => {
      bytes.set([0x00, 0x01].slice(0, bytes.length));
      return bytes;
    };
    const error = await createMember(
      accounts,
      { firstName: 'Jan', lastName: 'Kowalski' },
      always,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CreateMemberError);
    expect((error as CreateMemberError).reason).toBe('hookExhausted');
    expect(created).toHaveLength(0);
  });

  it('inny błąd Auth nie jest ponawiany i nie ujawnia hasła', async () => {
    const { accounts } = fakeAccounts({ fail: 'Database error creating new user' });
    const error = (await createMember(accounts, { firstName: 'Ewa', lastName: 'Lis' }).catch(
      (e: unknown) => e,
    )) as CreateMemberError;
    expect(error.reason).toBe('failed');
    expect(error.message).toContain('Database error creating new user');
    expect(error.message).not.toMatch(/[A-Za-z0-9]{16}/);
  });

  it('odrzuca puste i za długie imię lub nazwisko, zanim cokolwiek utworzy', async () => {
    expect(validateMemberInput({ firstName: '   ', lastName: 'x'.repeat(51) })).toEqual({
      firstName: 'required',
      lastName: 'tooLong',
    });
    expect(validateMemberInput({ firstName: 'Ola', lastName: 'x'.repeat(50) })).toEqual({});
    const { accounts, checked } = fakeAccounts();
    const error = (await createMember(accounts, { firstName: '', lastName: 'Nowak' }).catch(
      (e: unknown) => e,
    )) as CreateMemberError;
    expect(error.reason).toBe('invalid');
    expect(error.problems).toEqual({ firstName: 'required' });
    expect(checked).toEqual([]);
  });

  it('imię bez liter łacińskich daje hook „gracz-…”', async () => {
    const { accounts } = fakeAccounts();
    const member = await createMember(
      accounts,
      { firstName: 'Мария', lastName: 'Іваненко' },
      scripted([0xab, 0xcd]),
    );
    expect(member.hook).toBe('gracz-abcd');
  });
});
