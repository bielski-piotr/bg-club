import { MIN_PASSWORD_LENGTH, NAME_MAX_LENGTH } from '@bg-club/accounts';
import { isAuthError, isAuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js';
import { OWN_PROFILE_COLUMNS, type OwnProfile } from '../auth/ownProfile';
import type { ThemePreference } from '../theme/theme';
import type { AvatarImage } from './crop';
import { AVATARS_BUCKET } from './profileQueries';

/**
 * Zapis ustawień własnego profilu. Wszystko idzie przez sesję
 * użytkownika: RLS (`profiles_update_own`) i polityki Storage pozwalają zmienić tylko własny
 * wiersz i własny folder w `avatars`, więc nikt, także administrator, nie edytuje cudzego
 * profilu.
 */

/** Co zrobić ze zdjęciem przy zapisie. */
export type AvatarChange =
  | { readonly kind: 'keep' }
  /** Powrót do monogramu. */
  | { readonly kind: 'remove' }
  | { readonly kind: 'new'; readonly image: AvatarImage };

export interface ProfileDraft {
  readonly firstName: string;
  readonly lastName: string;
  readonly avatar: AvatarChange;
}

export type NameProblem = 'required' | 'tooLong';

/** Ta sama reguła co w bazie (`profiles_first_name_*`) i przy dodawaniu członka. */
export function nameProblem(value: string): NameProblem | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return 'required';
  if (trimmed.length > NAME_MAX_LENGTH) return 'tooLong';
  return undefined;
}

export type ProfileSaveFailure = 'upload' | 'save';

export class ProfileSaveError extends Error {
  constructor(readonly reason: ProfileSaveFailure) {
    super(`profile: ${reason}`);
    this.name = 'ProfileSaveError';
  }
}

/** Nowa nazwa przy każdym wgraniu: podpisany URL starego pliku nie pokaże nowego zdjęcia. */
export function newAvatarPath(profileId: string, extension: string): string {
  return `${profileId}/avatar-${crypto.randomUUID()}.${extension}`;
}

/**
 * Zapisuje imię, nazwisko i zdjęcie. Nowe zdjęcie trafia do Storage przed zapisem wiersza;
 * nieudany zapis wiersza usuwa wysłany plik, a udany usuwa poprzedni plik (Storage nie zbiera
 * sierot). Hook się nie zmienia, więc kolor monogramu też.
 */
export async function saveProfile(
  client: SupabaseClient,
  me: OwnProfile,
  draft: ProfileDraft,
): Promise<OwnProfile> {
  const storage = client.storage.from(AVATARS_BUCKET);
  let uploaded: string | null = null;
  if (draft.avatar.kind === 'new') {
    const { image } = draft.avatar;
    const path = newAvatarPath(me.id, image.extension);
    const { error } = await storage.upload(path, image.blob, {
      contentType: image.blob.type,
      upsert: false,
    });
    if (error) throw new ProfileSaveError('upload');
    uploaded = path;
  }

  const avatarPath =
    draft.avatar.kind === 'keep' ? me.avatar_path : draft.avatar.kind === 'new' ? uploaded : null;
  const { data, error } = await client
    .from('profiles')
    .update({
      first_name: draft.firstName.trim(),
      last_name: draft.lastName.trim(),
      avatar_path: avatarPath,
    })
    .eq('id', me.id)
    .select(OWN_PROFILE_COLUMNS)
    .single<OwnProfile>();

  if (error) {
    if (uploaded) await storage.remove([uploaded]).catch(() => undefined);
    throw new ProfileSaveError('save');
  }
  if (me.avatar_path && me.avatar_path !== data.avatar_path) {
    // Stary plik jest już nieużywany; błąd usuwania nie psuje zapisu.
    await storage.remove([me.avatar_path]).catch(() => undefined);
  }
  return data;
}

/** Motyw w profilu. Lokalnie stosuje go `setThemePreference` przed zapisem. */
export async function saveTheme(
  client: SupabaseClient,
  profileId: string,
  theme: ThemePreference,
): Promise<void> {
  const { error } = await client.from('profiles').update({ theme }).eq('id', profileId);
  if (error) throw error;
}

/** Gracz pominął propozycję zmiany hasła albo je zmienił: nie pokazujemy jej więcej. */
export async function dismissPasswordSuggestion(
  client: SupabaseClient,
  profileId: string,
): Promise<void> {
  const { error } = await client
    .from('profiles')
    .update({ password_change_suggested: false })
    .eq('id', profileId);
  if (error) throw error;
}

export interface PasswordDraft {
  readonly current: string;
  readonly next: string;
  readonly repeat: string;
}

export type PasswordProblem =
  'currentRequired' | 'nextRequired' | 'tooShort' | 'sameAsCurrent' | 'repeatRequired' | 'mismatch';

export interface PasswordProblems {
  readonly current?: PasswordProblem | undefined;
  readonly next?: PasswordProblem | undefined;
  readonly repeat?: PasswordProblem | undefined;
}

/** Walidacja formularza zmiany hasła (stare hasło + nowe ×2). Pusty obiekt = poprawne. */
export function passwordProblems(draft: PasswordDraft): PasswordProblems {
  const problems: { current?: PasswordProblem; next?: PasswordProblem; repeat?: PasswordProblem } =
    {};
  if (draft.current === '') problems.current = 'currentRequired';
  if (draft.next === '') problems.next = 'nextRequired';
  else if (draft.next.length < MIN_PASSWORD_LENGTH) problems.next = 'tooShort';
  else if (draft.next === draft.current) problems.next = 'sameAsCurrent';
  if (draft.repeat === '') problems.repeat = 'repeatRequired';
  else if (draft.next !== '' && draft.repeat !== draft.next) problems.repeat = 'mismatch';
  return problems;
}

export type PasswordChangeFailure =
  'currentInvalid' | 'weak' | 'same' | 'rateLimited' | 'network' | 'unknown';

export class PasswordChangeError extends Error {
  constructor(readonly reason: PasswordChangeFailure) {
    super(`password: ${reason}`);
    this.name = 'PasswordChangeError';
  }
}

/** Klasyfikuje błąd Auth przy zmianie hasła (kody GoTrue, sprawdzone na lokalnym Supabase). */
export function passwordErrorKind(error: unknown): PasswordChangeFailure {
  if (isAuthRetryableFetchError(error)) return 'network';
  if (!isAuthError(error)) return 'unknown';
  switch (error.code) {
    case 'current_password_invalid':
    case 'current_password_required':
      return 'currentInvalid';
    case 'weak_password':
      return 'weak';
    case 'same_password':
      return 'same';
    case 'over_request_rate_limit':
      return 'rateLimited';
  }
  return error.status === 429 ? 'rateLimited' : 'unknown';
}

/**
 * Zmienia hasło zalogowanego użytkownika. Obecne hasło sprawdza Auth (`current_password`,
 * `require_current_password` w konfiguracji Auth), więc samo przejęcie otwartej sesji nie
 * wystarczy do zmiany hasła. Po zmianie propozycja z znika.
 */
export async function changePassword(
  client: SupabaseClient,
  profileId: string,
  draft: Pick<PasswordDraft, 'current' | 'next'>,
): Promise<void> {
  const { error } = await client.auth.updateUser({
    password: draft.next,
    current_password: draft.current,
  });
  if (error) throw new PasswordChangeError(passwordErrorKind(error));
  // Hasło już jest zmienione; nieudane wyczyszczenie flagi najwyżej pokaże propozycję ponownie.
  await dismissPasswordSuggestion(client, profileId).catch(() => undefined);
}
