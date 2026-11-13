import { NAME_MAX_LENGTH } from '@bg-club/accounts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/authContext';
import { ownProfileKey, type OwnProfile } from '../auth/useOwnProfile';
import { format, t } from '../i18n';
import { usePopups } from '../popups/popupContext';
import { PopupModal } from '../popups/PopupModal';
import { THEME_PREFERENCES, type ThemePreference } from '../theme/theme';
import { useTheme } from '../theme/useTheme';
import {
  Avatar,
  Banner,
  Button,
  Icon,
  SegmentedControl,
  Spinner,
  TextField,
  useToast,
} from '../ui';
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
import { avatarPerson, useAvatarUrl } from './profiles';
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
 * - **Konto**: hook tylko do odczytu, zmiana hasła (osobny popup) i wylogowanie. Usunięcie
 *   własnego konta (USR-6) dochodzi w zadaniu [011].
 */
export function SettingsPopup({ me }: { readonly me: OwnProfile }) {
  const { client, signOut } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { back, open } = usePopups();
  const formId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const theme = useTheme();

  const [firstName, setFirstName] = useState(me.first_name);
  const [lastName, setLastName] = useState(me.last_name);
  const [showErrors, setShowErrors] = useState(false);
  const [avatar, setAvatar] = useState<AvatarState>({ kind: 'keep' });
  const [cropping, setCropping] = useState<Cropping | null>(null);
  const [processing, setProcessing] = useState(false);
  const [photoError, setPhotoError] = useState<string | undefined>(undefined);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);
  const [signingOut, setSigningOut] = useState(false);
  const saved = useAvatarUrl(client, avatar.kind === 'keep' ? me.avatar_path : null);

  // Adresy podglądu i zdekodowany obraz zwalniamy przy podmianie i przy zamknięciu popupu.
  // Ref, a nie sprzątanie efektu zależnego od stanu: StrictMode od razu uruchamia sprzątanie.
  const resources = useRef<{ preview: string | null; cropping: Cropping | null }>({
    preview: null,
    cropping: null,
  });
  useEffect(
    () => () => {
      const { preview, cropping: open } = resources.current;
      if (preview) URL.revokeObjectURL(preview);
      if (open) {
        URL.revokeObjectURL(open.url);
        open.bitmap.close();
      }
    },
    [],
  );

  const releaseCropping = () => {
    const open = resources.current.cropping;
    if (open) {
      URL.revokeObjectURL(open.url);
      open.bitmap.close();
    }
    resources.current.cropping = null;
    setCropping(null);
  };

  const save = useMutation({
    mutationFn: (change: AvatarChange) =>
      saveProfile(client, me, { firstName, lastName, avatar: change }),
    onSuccess: (profile) => {
      queryClient.setQueryData(ownProfileKey(me.id), profile);
      // Imię i zdjęcie widać też w profilu, na liście i w widżecie członków.
      void queryClient.invalidateQueries({ queryKey: ['profiles'], refetchType: 'active' });
      toast.show(text.toasts.saved, 'success');
      back();
    },
    onError: (error) => {
      const reason = error instanceof ProfileSaveError ? error.reason : 'save';
      setSaveError(reason === 'upload' ? text.errors.upload : text.errors.save);
    },
  });

  const themeSave = useMutation({
    mutationFn: ({ next }: { next: ThemePreference; previous: ThemePreference }) =>
      saveTheme(client, me.id, next),
    onSuccess: (_, { next }) => {
      queryClient.setQueryData<OwnProfile | null>(ownProfileKey(me.id), (old) =>
        old ? { ...old, theme: next } : old,
      );
    },
    onError: (_, { previous }) => {
      theme.setPreference(previous);
      toast.show(text.errors.theme, 'error');
    },
  });

  const changeTheme = (next: ThemePreference) => {
    const previous = theme.preference;
    if (next === previous) return;
    // Motyw działa od razu; profil zapisujemy w tle, a błąd przywraca poprzedni wybór.
    theme.setPreference(next);
    themeSave.mutate({ next, previous });
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
      resources.current.cropping = next;
      setCropping(next);
    } catch {
      setPhotoError(text.errors.photoDecode);
    } finally {
      setProcessing(false);
    }
  };

  const applyCrop = async () => {
    if (!cropping) return;
    setProcessing(true);
    try {
      const image = await renderAvatar(cropping.bitmap, cropping.crop, CROP_VIEW);
      const preview = URL.createObjectURL(image.blob);
      if (resources.current.preview) URL.revokeObjectURL(resources.current.preview);
      resources.current.preview = preview;
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

  if (cropping) {
    return (
      <PopupModal
        title={t.crop.title}
        footer={
          <>
            <Button variant="secondary" onClick={releaseCropping}>
              {text.cancel}
            </Button>
            <Button loading={processing} onClick={() => void applyCrop()}>
              {t.crop.apply}
            </Button>
          </>
        }
      >
        <p className="settings__intro">{t.crop.intro}</p>
        <AvatarCropper
          src={cropping.url}
          image={cropping.bitmap}
          crop={cropping.crop}
          onCropChange={(crop) => {
            const next = { ...cropping, crop };
            resources.current.cropping = next;
            setCropping(next);
          }}
        />
      </PopupModal>
    );
  }

  const problems = { first: nameProblem(firstName), last: nameProblem(lastName) };
  const hasPhoto = avatar.kind === 'new' || (avatar.kind === 'keep' && me.avatar_path !== null);
  const photoSrc =
    avatar.kind === 'new' ? avatar.preview : avatar.kind === 'keep' ? saved.data : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    setSaveError(undefined);
    if (problems.first || problems.last || processing || save.isPending) return;
    save.mutate(avatar.kind === 'new' ? { kind: 'new', image: avatar.image } : avatar);
  };

  const onSignOut = () => {
    setSigningOut(true);
    signOut().catch(() => setSigningOut(false));
  };

  return (
    <PopupModal
      title={text.title}
      footer={
        <>
          <Button variant="secondary" onClick={back}>
            {text.cancel}
          </Button>
          <Button type="submit" form={formId} loading={save.isPending}>
            {text.save}
          </Button>
        </>
      }
    >
      <div className="settings">
        <form
          id={formId}
          className="settings__section"
          noValidate
          onSubmit={submit}
          aria-labelledby={`${formId}-profile`}
        >
          <h3 id={`${formId}-profile`} className="settings__heading">
            {text.profileSection}
          </h3>
          {saveError ? <Banner variant="error">{saveError}</Banner> : null}

          <fieldset className="settings__photo">
            <legend className="sr-only">{text.photoLabel}</legend>
            <div className="settings__photo-tile">
              <Avatar
                {...avatarPerson(
                  {
                    ...me,
                    first_name: firstName || me.first_name,
                    last_name: lastName || me.last_name,
                  },
                  photoSrc,
                )}
                size={88}
                decorative
              />
              <span className="settings__photo-badge" aria-hidden="true">
                {processing ? <Spinner size={16} /> : <Icon name="upload" />}
              </span>
            </div>
            <div className="settings__photo-text">
              <div className="settings__photo-actions">
                <button
                  type="button"
                  className="settings__link"
                  disabled={processing}
                  onClick={() => fileRef.current?.click()}
                >
                  {hasPhoto ? text.changePhoto : text.addPhoto}
                </button>
                {hasPhoto && !processing ? (
                  <button
                    type="button"
                    className="settings__link settings__link--muted"
                    onClick={() => {
                      setAvatar({ kind: 'remove' });
                      setPhotoError(undefined);
                    }}
                  >
                    {text.removePhoto}
                  </button>
                ) : null}
              </div>
              <p className="settings__helper" role={photoError ? 'alert' : undefined}>
                {photoError ? (
                  <span className="settings__helper--error">{photoError}</span>
                ) : processing ? (
                  text.photoProcessing
                ) : (
                  <>
                    {text.photoHelper}
                    <br />
                    {text.photoFallback}
                  </>
                )}
              </p>
              <input
                ref={fileRef}
                type="file"
                accept={AVATAR_ACCEPT}
                className="sr-only"
                tabIndex={-1}
                aria-label={text.photoLabel}
                onChange={(event) => {
                  void pickFile(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </div>
          </fieldset>

          <TextField
            label={text.firstNameLabel}
            value={firstName}
            maxLength={NAME_MAX_LENGTH}
            autoComplete="given-name"
            autoCapitalize="words"
            required
            error={
              showErrors ? nameError(problems.first, text.errors.firstNameRequired) : undefined
            }
            onChange={(event) => setFirstName(event.target.value)}
          />
          <TextField
            label={text.lastNameLabel}
            value={lastName}
            maxLength={NAME_MAX_LENGTH}
            autoComplete="family-name"
            autoCapitalize="words"
            required
            error={showErrors ? nameError(problems.last, text.errors.lastNameRequired) : undefined}
            hint={format(text.namesHint, { hook: me.hook })}
            onChange={(event) => setLastName(event.target.value)}
          />
        </form>

        <section className="settings__section" aria-labelledby={`${formId}-theme`}>
          <h3 id={`${formId}-theme`} className="settings__heading">
            {text.themeSection}
          </h3>
          <SegmentedControl
            legend={t.theme.label}
            options={THEME_PREFERENCES.map((value) => ({ value, label: t.theme[value] }))}
            value={theme.preference}
            onChange={changeTheme}
          />
          <p className="settings__helper">{text.themeHint}</p>
        </section>

        <section className="settings__section" aria-labelledby={`${formId}-account`}>
          <h3 id={`${formId}-account`} className="settings__heading">
            {text.accountSection}
          </h3>
          <TextField label={text.hookLabel} value={me.hook} readOnly mono hint={text.hookHint} />
          <div className="settings__account-actions">
            <Button
              variant="secondary"
              icon="lock"
              onClick={() => open({ kind: 'change-password' })}
            >
              {text.changePassword}
            </Button>
            <Button variant="secondary" icon="logout" loading={signingOut} onClick={onSignOut}>
              {text.signOut}
            </Button>
          </div>
        </section>
      </div>
    </PopupModal>
  );
}
