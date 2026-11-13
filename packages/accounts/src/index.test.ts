import { describe, expect, it } from 'vitest';
import { validateBootstrapInput } from './bootstrap.ts';
import {
  createHook,
  emailToHook,
  generatePassword,
  HOOK_MAX_LENGTH,
  hookToEmail,
  isValidHook,
  MIN_PASSWORD_LENGTH,
  normalizeHook,
  PASSWORD_ALPHABET,
  randomHookSuffix,
  slugifyName,
  type RandomSource,
} from './index.ts';

/** Deterministyczne „losowe” bajty: kolejne wartości z listy, w kółko. */
function sequence(values: readonly number[]): RandomSource {
  let i = 0;
  return (bytes) => {
    for (let j = 0; j < bytes.length; j += 1) {
      bytes[j] = values[i % values.length] ?? 0;
      i += 1;
    }
    return bytes;
  };
}

describe('hook i techniczny e-mail (AUTH-1)', () => {
  it('mapuje hook na e-mail w domenie .invalid i z powrotem', () => {
    expect(hookToEmail('jan-kowalski-3f9a')).toBe('jan-kowalski-3f9a@users.bgclub.invalid');
    expect(emailToHook('jan-kowalski-3f9a@users.bgclub.invalid')).toBe('jan-kowalski-3f9a');
  });

  it('nie zbuduje e-maila z niepoprawnego hooka', () => {
    expect(() => hookToEmail('jan@example.com')).toThrow();
    expect(() => hookToEmail('')).toThrow();
  });

  it('nie odczyta hooka z adresu spoza aplikacji', () => {
    expect(emailToHook('jan-kowalski-3f9a@example.com')).toBeNull();
    expect(emailToHook('zly_hook@users.bgclub.invalid')).toBeNull();
  });

  it('normalizuje wpisany hook: spacje i wielkie litery', () => {
    expect(normalizeHook('  Jan-Kowalski-3F9A \n')).toBe('jan-kowalski-3f9a');
  });

  it('sprawdza format i długość hooka jak baza', () => {
    expect(isValidHook('jan-kowalski-3f9a')).toBe(true);
    expect(isValidHook('jan-3f9a')).toBe(true);
    expect(isValidHook('3f9a')).toBe(false);
    expect(isValidHook('jan-kowalski')).toBe(false);
    expect(isValidHook('jan-kowalski-3F9A')).toBe(false);
    expect(isValidHook('jan--kowalski-3f9a')).toBe(false);
    expect(isValidHook('jan kowalski-3f9a')).toBe(false);
    expect(isValidHook(`${'a'.repeat(HOOK_MAX_LENGTH - 5)}-3f9a`)).toBe(true);
    expect(isValidHook(`${'a'.repeat(HOOK_MAX_LENGTH - 4)}-3f9a`)).toBe(false);
  });
});

describe('tworzenie hooka (USR-1)', () => {
  it('transliteruje polskie znaki', () => {
    expect(slugifyName('Łukasz', 'Żółw')).toBe('lukasz-zolw');
    expect(slugifyName('Zażółć', 'Gęślą Jaźń')).toBe('zazolc-gesla-jazn');
    expect(slugifyName('ŚĆŃĄĘ', 'Ź')).toBe('scnae-z');
  });

  it('łączy człony nazwiska myślnikami i usuwa inne znaki', () => {
    expect(slugifyName('Anna Maria', 'Nowak-Kowalska')).toBe('anna-maria-nowak-kowalska');
    expect(slugifyName("  O'Brien ", ' Jr. ')).toBe('o-brien-jr');
  });

  it('daje słowo zastępcze, gdy nie zostaje żadna litera łacińska', () => {
    expect(slugifyName('李', '雷')).toBe('gracz');
  });

  it('tworzy hook z przykładu w PRD', () => {
    expect(createHook('Łukasz', 'Żółw', '7c1e')).toBe('lukasz-zolw-7c1e');
    expect(isValidHook(createHook('Łukasz', 'Żółw', '7c1e'))).toBe(true);
  });

  it('skraca długie nazwy do limitu bazy', () => {
    const hook = createHook('Bartłomiej'.repeat(5), 'Wiśniewski-Kowalczyk'.repeat(3), 'abcd');
    expect(hook.length).toBeLessThanOrEqual(HOOK_MAX_LENGTH);
    expect(isValidHook(hook)).toBe(true);
    // Skrócenie na myślniku nie zostawia pustego członu.
    const cut = createHook(`${'a'.repeat(58)} b`, 'c', '0000');
    expect(cut).toBe(`${'a'.repeat(58)}-0000`);
  });

  it('odrzuca sufiks w złym formacie', () => {
    expect(() => createHook('Jan', 'Kowalski', '3F9A')).toThrow();
    expect(() => createHook('Jan', 'Kowalski', '3f9')).toThrow();
  });

  it('losuje sufiks z 4 znaków szesnastkowych', () => {
    expect(randomHookSuffix(sequence([0x0a, 0xf3]))).toBe('0af3');
    expect(randomHookSuffix()).toMatch(/^[0-9a-f]{4}$/);
  });
});

describe('generowane hasło (AUTH-4)', () => {
  it('ma domyślnie 16 znaków z alfabetu bez znaków łatwych do pomylenia', () => {
    const password = generatePassword();
    expect(password).toHaveLength(16);
    expect([...password].every((char) => PASSWORD_ALPHABET.includes(char))).toBe(true);
    expect(PASSWORD_ALPHABET).not.toMatch(/[0O1lI]/);
  });

  it(`nie pozwala na hasło krótsze niż ${MIN_PASSWORD_LENGTH} znaków`, () => {
    expect(() => generatePassword(MIN_PASSWORD_LENGTH - 1)).toThrow();
    expect(generatePassword(MIN_PASSWORD_LENGTH)).toHaveLength(MIN_PASSWORD_LENGTH);
  });

  it('pomija bajty, które dałyby nierówny rozkład znaków', () => {
    // 255 jest poza największą wielokrotnością długości alfabetu, więc jest odrzucane.
    const password = generatePassword(12, sequence([255, 0, 255, 1]));
    expect(password).toBe(`${PASSWORD_ALPHABET[0]}${PASSWORD_ALPHABET[1]}`.repeat(6));
  });

  it('kolejne hasła są różne', () => {
    const passwords = new Set(Array.from({ length: 50 }, () => generatePassword()));
    expect(passwords.size).toBe(50);
  });
});

describe('dane bootstrapu administratora', () => {
  it('przyjmuje imię, nazwisko i opcjonalne hasło', () => {
    expect(validateBootstrapInput({ firstName: 'Ada', lastName: 'Adminowska' })).toEqual([]);
    expect(
      validateBootstrapInput({
        firstName: 'Ada',
        lastName: 'Adminowska',
        password: 'x'.repeat(12),
      }),
    ).toEqual([]);
  });

  it('wymaga imienia i nazwiska oraz mocnego hasła', () => {
    expect(
      validateBootstrapInput({ firstName: ' ', lastName: 'x'.repeat(51), password: 'krotkie' }),
    ).toEqual([
      'Imię administratora jest wymagane.',
      'Nazwisko administratora może mieć najwyżej 50 znaków.',
      'Hasło administratora musi mieć co najmniej 12 znaków.',
    ]);
  });
});
