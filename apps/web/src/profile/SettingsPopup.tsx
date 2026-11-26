import { NAME_MAX_LENGTH } from '@bg-club/accounts';
import {
  action,
  createMemo,
  createOptimistic,
  createSignal,
  createUniqueId,
  flush,
  Match,
  onSettled,
  Show,
  Switch,
  untrack,
  useContext,
} from 'solid-js';
import { ownProfileKey, type OwnProfile } from '../auth/ownProfile';
import { format, t } from '../i18n';
import { AuthContext } from '../auth/authContext';
import { PopupsContext } from '../popups/popupContext';
import { QueryClientContext } from '../lib/queryClient';
import { ToastContext } from '../ui/toastContext';
import { PopupModal } from '../popups/PopupModal';
import { createAvatarUrl } from './profiles';
import { createTheme } from '../theme/createTheme';
import { Avatar, Banner, Button, Icon, SegmentedControl, Spinner, TextField } from '../ui';
import { THEME_PREFERENCES, type ThemePreference } from '../theme/theme';
import { getThemePreference } from '../theme/themeStore';
import { AvatarCropper, CROP_VIEW } from './AvatarCropper';
import {
  AVATAR_ACCEPT,
  AvatarImageFailure,
  checkAvatarFile,
  clampCrop,
  INITIAL_CROP,
  renderAvatar,
  type AvatarImage,
  type AvatarImageError,
  type CropState,
} from './crop';
import { avatarPerson } from './profileQueries';
import {
  nameProblem,
  ProfileSaveError,
  saveProfile,
  saveTheme,
  type AvatarChange,
  type NameProblem,
} from './settings';
import './profile.css';

const text = t.settings;

const PHOTO_ERRORS: Readonly<Record<AvatarImageError, string>> = {
  type: text.errors.photoType,
  decode: text.errors.photoDecode,
  size: text.errors.photoSize,
};

type AvatarState =
  | { readonly kind: 'keep' }
  | { readonly kind: 'remove' }
  | { readonly kind: 'new'; readonly image: AvatarImage; readonly preview: string };

/** Zdjęcie w trakcie kadrowania: zdekodowany obraz i adres podglądu pliku. */
interface Cropping {
  readonly bitmap: ImageBitmap;
  readonly url: string;
  readonly crop: CropState;
}

function nameError(problem: NameProblem | undefined, required: string): string | undefined {
  if (problem === 'required') return required;
  if (problem === 'tooLong') return format(text.errors.tooLong, { max: NAME_MAX_LENGTH });
  return undefined;
}

/**
 * Ustawienia własnego profilu (USR-3, USR-5, USR-8; DS „Profil / Ustawienia”). Adres `settings`
 * dotyczy zawsze zalogowanego użytkownika, więc nie ma jak otworzyć cudzych ustawień (USR-7).
 *
 * - **Profil**: zdjęcie (wybór pliku → kadrowanie 256×256 → podgląd; „Usuń zdjęcie” wraca do
 *   monogramu), imię i nazwisko. Zapisuje je przycisk „Zapisz”.
 * - **Wygląd**: motyw działa od razu i trafia do profilu oraz `localStorage` (USR-8).
 * - **Konto**: hook tylko do odczytu, zmiana hasła (osobny popup), wylogowanie i usunięcie
 *   własnego konta z potwierdzeniem hasłem (USR-6). Administrator nie widzi usuwania konta.
 */
export function SettingsPopup(props: { readonly me: OwnProfile }) {
  const auth = useContext(AuthContext);
  const queryClient = useContext(QueryClientContext);
  const toast = useContext(ToastContext);
  const popups = useContext(PopupsContext);
  const formId = createUniqueId();
  const theme = createTheme();
  let fileInput: HTMLInputElement | undefined;

  // Szkic formularza startuje z profilu raz, przy otwarciu: późniejsza zmiana `me` (np. zapis
  // motywu odświeża własny profil) nie może nadpisać tego, co użytkownik już wpisał.
  const [firstName, setFirstName] = createSignal(untrack(() => props.me.first_name));
  const [lastName, setLastName] = createSignal(untrack(() => props.me.last_name));
  const [showErrors, setShowErrors] = createSignal(false);
  const [avatar, setAvatar] = createSignal<AvatarState>({ kind: 'keep' });
  const [cropping, setCropping] = createSignal<Cropping | null>(null);
  const [processing, setProcessing] = createSignal(false);
  const [photoError, setPhotoError] = createSignal<string | undefined>(undefined);
  const [saveError, setSaveError] = createSignal<string | undefined>(undefined);
  const [signingOut, setSigningOut] = createSignal(false);
  const saved = createAvatarUrl(() => (avatar().kind === 'keep' ? props.me.avatar_path : null));

  // Adresy podglądu i zdekodowany obraz zwalniamy przy podmianie i przy zamknięciu popupu.
  const resources: { preview: string | null; cropping: Cropping | null } = {
    preview: null,
    cropping: null,
  };
  onSettled(() => () => {
    if (resources.preview) URL.revokeObjectURL(resources.preview);
    if (resources.cropping) {
      URL.revokeObjectURL(resources.cropping.url);
      resources.cropping.bitmap.close();
    }
  });

  const releaseCropping = () => {
    const open = resources.cropping;
    if (open) {
      URL.revokeObjectURL(open.url);
      open.bitmap.close();
    }
    resources.cropping = null;
    setCropping(null);
  };

  const [saving, setSaving] = createOptimistic(false);
  const save = action(function* (change: AvatarChange) {
    setSaving(true);
    let profile: OwnProfile;
    try {
      profile = (yield saveProfile(auth.client, props.me, {
        firstName: firstName(),
        lastName: lastName(),
        avatar: change,
      })) as OwnProfile;
    } catch (error) {
      const reason = error instanceof ProfileSaveError ? error.reason : 'save';
      setSaveError(reason === 'upload' ? text.errors.upload : text.errors.save);
      return;
    }
    queryClient.setQueryData(ownProfileKey(props.me.id), profile);
    // Imię i zdjęcie widać też w profilu, na liście i w widżecie członków.
    void queryClient.invalidateQueries({
      queryKey: ['profiles'],
      predicate: (query) => query.queryKey[1] !== 'own',
    });
    toast.show(text.toasts.saved, 'success');
    popups.back();
  });

  const themeSave = action(function* (next: ThemePreference, previous: ThemePreference) {
    try {
      yield saveTheme(auth.client, props.me.id, next);
    } catch {
      // Przywracamy tylko wtedy, gdy nikt nie wybrał w międzyczasie kolejnego motywu.
      if (getThemePreference() === next) theme.setPreference(previous);
      toast.show(text.errors.theme, 'error');
      return;
    }
    queryClient.setQueryData<OwnProfile | null>(ownProfileKey(props.me.id), (old) =>
      old ? { ...old, theme: next } : old,
    );
  });

  const changeTheme = (next: ThemePreference) => {
    const previous = getThemePreference();
    if (next === previous) return;
    // Motyw działa od razu, a `flush` utrwala wybór, zanim zapis profilu (w tle) go wstrzyma;
    // błąd zapisu przywraca poprzedni wybór.
    theme.setPreference(next);
    flush();
    void themeSave(next, previous);
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setPhotoError(undefined);
    const problem = checkAvatarFile(file);
    if (problem) {
      setPhotoError(PHOTO_ERRORS[problem]);
      return;
    }
    setProcessing(true);
    try {
      const bitmap = await createImageBitmap(file);
      const next: Cropping = {
        bitmap,
        url: URL.createObjectURL(file),
        crop: clampCrop(INITIAL_CROP, bitmap, CROP_VIEW),
      };
      releaseCropping();
      resources.cropping = next;
      setCropping(next);
    } catch {
      setPhotoError(text.errors.photoDecode);
    } finally {
      setProcessing(false);
    }
  };

  const applyCrop = async () => {
    const open = cropping();
    if (!open) return;
    setProcessing(true);
    try {
      const image = await renderAvatar(open.bitmap, open.crop, CROP_VIEW);
      const preview = URL.createObjectURL(image.blob);
      if (resources.preview) URL.revokeObjectURL(resources.preview);
      resources.preview = preview;
      setAvatar({ kind: 'new', image, preview });
      setPhotoError(undefined);
    } catch (error) {
      setPhotoError(
        error instanceof AvatarImageFailure ? PHOTO_ERRORS[error.reason] : text.errors.photoDecode,
      );
    } finally {
      setProcessing(false);
      releaseCropping();
    }
  };

  const problems = createMemo(() => ({
    first: nameProblem(firstName()),
    last: nameProblem(lastName()),
  }));
  const hasPhoto = () => {
    const state = avatar();
    return state.kind === 'new' || (state.kind === 'keep' && props.me.avatar_path !== null);
  };
  const person = createMemo(() => {
    const state = avatar();
    const src =
      state.kind === 'new' ? state.preview : state.kind === 'keep' ? saved.current() : undefined;
    return avatarPerson(
      {
        ...props.me,
        first_name: firstName() || props.me.first_name,
        last_name: lastName() || props.me.last_name,
      },
      src,
    );
  });

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    // Wpis z tego samego zadania (autouzupełnianie + Enter) musi być już w sygnałach.
    flush();
    setShowErrors(true);
    setSaveError(undefined);
    const found = problems();
    if (found.first || found.last || processing() || saving()) return;
    const state = avatar();
    void save(state.kind === 'new' ? { kind: 'new', image: state.image } : state);
  };

  const onSignOut = () => {
    setSigningOut(true);
    auth.signOut().catch(() => setSigningOut(false));
  };

  // Jedno okno także przy kadrowaniu: przejście do kadru i z powrotem nie gubi fokusu.
  return (
    <PopupModal
      title={cropping() ? t.crop.title : text.title}
      footer={
        <Show
          when={cropping()}
          fallback={
            <>
              <Button variant="secondary" onClick={() => popups.back()}>
                {text.cancel}
              </Button>
              <Button type="submit" form={formId} loading={saving() || processing()}>
                {text.save}
              </Button>
            </>
          }
        >
          <Button variant="secondary" onClick={releaseCropping}>
            {text.cancel}
          </Button>
          <Button loading={processing()} onClick={() => void applyCrop()}>
            {t.crop.apply}
          </Button>
        </Show>
      }
    >
      <Show
        when={cropping()}
        fallback={
          <div class="settings">
            <form
              id={formId}
              class="settings__section"
              novalidate
              onSubmit={submit}
              aria-labelledby={`${formId}-profile`}
            >
              <h3 id={`${formId}-profile`} class="settings__heading">
                {text.profileSection}
              </h3>
              <Show when={saveError()}>
                <Banner variant="error">{saveError()}</Banner>
              </Show>

              <fieldset class="settings__photo">
                <legend class="sr-only">{text.photoLabel}</legend>
                <div class="settings__photo-tile">
                  <Avatar
                    id={person().id}
                    name={person().name}
                    src={person().src}
                    removed={person().removed}
                    size={88}
                    decorative
                  />
                  <span class="settings__photo-badge" aria-hidden="true">
                    <Show when={processing()} fallback={<Icon name="upload" />}>
                      <Spinner size={16} />
                    </Show>
                  </span>
                </div>
                <div class="settings__photo-text">
                  <div class="settings__photo-actions">
                    <button
                      type="button"
                      class="settings__link"
                      disabled={processing()}
                      onClick={() => fileInput?.click()}
                    >
                      {hasPhoto() ? text.changePhoto : text.addPhoto}
                    </button>
                    <Show when={hasPhoto() && !processing()}>
                      <button
                        type="button"
                        class="settings__link settings__link--muted"
                        onClick={() => {
                          setAvatar({ kind: 'remove' });
                          setPhotoError(undefined);
                        }}
                      >
                        {text.removePhoto}
                      </button>
                    </Show>
                  </div>
                  <p class="settings__helper" role={photoError() ? 'alert' : undefined}>
                    <Switch
                      fallback={
                        <>
                          {text.photoHelper}
                          <br />
                          {text.photoFallback}
                        </>
                      }
                    >
                      <Match when={photoError()}>
                        <span class="settings__helper--error">{photoError()}</span>
                      </Match>
                      <Match when={processing()}>{text.photoProcessing}</Match>
                    </Switch>
                  </p>
                  <input
                    ref={(el) => (fileInput = el)}
                    type="file"
                    accept={AVATAR_ACCEPT}
                    class="sr-only"
                    tabindex={-1}
                    aria-label={text.photoLabel}
                    onChange={(event) => {
                      void pickFile(event.currentTarget.files?.[0]);
                      event.currentTarget.value = '';
                    }}
                  />
                </div>
              </fieldset>

              <TextField
                label={text.firstNameLabel}
                value={firstName()}
                maxlength={NAME_MAX_LENGTH}
                autocomplete="given-name"
                autocapitalize="words"
                required
                error={
                  showErrors()
                    ? nameError(problems().first, text.errors.firstNameRequired)
                    : undefined
                }
                onInput={(event) => setFirstName(event.currentTarget.value)}
              />
              <TextField
                label={text.lastNameLabel}
                value={lastName()}
                maxlength={NAME_MAX_LENGTH}
                autocomplete="family-name"
                autocapitalize="words"
                required
                error={
                  showErrors()
                    ? nameError(problems().last, text.errors.lastNameRequired)
                    : undefined
                }
                hint={format(text.namesHint, { hook: props.me.hook })}
                onInput={(event) => setLastName(event.currentTarget.value)}
              />
            </form>

            <section class="settings__section" aria-labelledby={`${formId}-theme`}>
              <h3 id={`${formId}-theme`} class="settings__heading">
                {text.themeSection}
              </h3>
              <SegmentedControl
                legend={t.theme.label}
                options={THEME_PREFERENCES.map((value) => ({ value, label: t.theme[value] }))}
                value={theme.preference()}
                onChange={changeTheme}
              />
              <p class="settings__helper">{text.themeHint}</p>
            </section>

            <section class="settings__section" aria-labelledby={`${formId}-account`}>
              <h3 id={`${formId}-account`} class="settings__heading">
                {text.accountSection}
              </h3>
              <TextField
                label={text.hookLabel}
                value={props.me.hook}
                readonly
                mono
                hint={text.hookHint}
              />
              <div class="settings__account-actions">
                <Button
                  variant="secondary"
                  icon="lock"
                  onClick={() => popups.open({ kind: 'change-password' })}
                >
                  {text.changePassword}
                </Button>
                <Button
                  variant="secondary"
                  icon="logout"
                  loading={signingOut()}
                  onClick={onSignOut}
                >
                  {text.signOut}
                </Button>
              </div>
              <Show when={props.me.role !== 'admin'}>
                <div class="settings__danger">
                  <Button
                    variant="secondary"
                    icon="trash"
                    class="settings__delete"
                    onClick={() => popups.open({ kind: 'delete-account' })}
                  >
                    {text.deleteAccount}
                  </Button>
                  <p class="settings__helper">{text.deleteAccountHint}</p>
                </div>
              </Show>
            </section>
          </div>
        }
      >
        {(open) => (
          <>
            <p class="settings__intro">{t.crop.intro}</p>
            <AvatarCropper
              src={open().url}
              image={open().bitmap}
              crop={open().crop}
              onCropChange={(crop) =>
                setCropping((current) => (current ? { ...current, crop } : current))
              }
            />
          </>
        )}
      </Show>
    </PopupModal>
  );
}
