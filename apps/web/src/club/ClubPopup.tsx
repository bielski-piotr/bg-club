import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/authContext';
import {
  CLUB_NAME_MAX,
  ClubSaveError,
  clubKey,
  saveClub,
  useClub,
  useCoverUrl,
  type Club,
  type ClubSaveFailure,
  type LogoChange,
} from '../hub/club';
import { format, t } from '../i18n';
import { usePopups } from '../popups/popupContext';
import { PopupModal } from '../popups/PopupModal';
import { QueryStatus } from '../popups/QueryStatus';
import {
  Banner,
  Button,
  Icon,
  normalizeSearch,
  Select,
  Spinner,
  TextField,
  useToast,
  type SelectOption,
} from '../ui';
import { ClubLogo } from './ClubLogo';
import { IMAGE_ACCEPT, ImageScaleError, scaleImage, type ScaledImage } from './image';
import { browserTimezone, timezoneOptions } from './timezones';
import './club.css';
import { leaderboardRootKey } from '../leaderboard/leaderboard';

/**
 * Popup „Dodaj klub” / „Edytuj klub”. Otwiera go administrator z pierwszego
 * uruchomienia albo ołówkiem w nagłówku huba; dla gracza `HubPopup` pokazuje „Nie znaleziono”.
 */
export function ClubPopup() {
  const { client } = useAuth();
  const club = useClub(client);
  if (!club.isSuccess) {
    return (
      <PopupModal title={t.club.form.addTitle}>
        <QueryStatus isError={club.isError} onRetry={() => void club.refetch()} />
      </PopupModal>
    );
  }
  return <ClubForm club={club.data} />;
}

type LogoState =
  | { readonly kind: 'keep' }
  | { readonly kind: 'remove' }
  | { readonly kind: 'processing' }
  | { readonly kind: 'new'; readonly image: ScaledImage; readonly preview: string };

const LOGO_ERRORS: Readonly<Record<ImageScaleError['reason'], string>> = {
  type: t.club.form.errors.logoType,
  decode: t.club.form.errors.logoDecode,
  size: t.club.form.errors.logoSize,
};

const SAVE_ERRORS: Readonly<Record<ClubSaveFailure, string>> = {
  exists: t.club.form.errors.exists,
  forbidden: t.club.form.errors.forbidden,
  upload: t.club.form.errors.upload,
  save: t.club.form.errors.save,
};

/** Wyszukiwanie strefy po nazwie IANA (bez `_` i `/`) albo po przesunięciu, np. „utc-05”. */
function matchesTimezone(option: SelectOption<string>, query: string): boolean {
  const offset = (option.meta ?? '').replace('−', '-');
  return normalizeSearch(`${option.label} ${offset}`).includes(query);
}

function nameError(name: string): string | undefined {
  const trimmed = name.trim();
  if (trimmed === '') return t.club.form.errors.nameRequired;
  if (trimmed.length > CLUB_NAME_MAX) {
    return format(t.club.form.errors.nameTooLong, { max: CLUB_NAME_MAX });
  }
  return undefined;
}

function ClubForm({ club }: { readonly club: Club | null }) {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { back } = usePopups();
  const formId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const creating = club === null;
  const form = t.club.form;

  const [name, setName] = useState(club?.name ?? '');
  const [timezone, setTimezone] = useState(() => club?.timezone ?? browserTimezone());
  const [logo, setLogo] = useState<LogoState>({ kind: 'keep' });
  const [logoError, setLogoError] = useState<string | undefined>(undefined);
  const [showErrors, setShowErrors] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);
  // Lista stref z przesunięciami liczona raz; zawiera strefę zapisaną i strefę przeglądarki.
  const [options] = useState(() => timezoneOptions([timezone]));
  const savedLogo = useCoverUrl(client, logo.kind === 'keep' ? (club?.logo_path ?? null) : null);

  // Adres podglądu zwalniamy przy wyborze kolejnego pliku i przy zamknięciu popupu. Ref, a nie
  // sprzątanie efektu zależnego od adresu: StrictMode od razu uruchamia sprzątanie i podgląd by
  // znikał.
  const previewUrl = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );

  const save = useMutation({
    mutationFn: (logoChange: LogoChange) =>
      saveClub(client, club, { name, timezone, logo: logoChange }),
    onSuccess: (saved) => {
      queryClient.setQueryData(clubKey, saved);
      // Strefa klubu wyznacza granice roku w rankingu.
      void queryClient.invalidateQueries({ queryKey: leaderboardRootKey });
      toast.show(creating ? t.club.toasts.created : t.club.toasts.updated, 'success');
      back();
    },
    onError: (error) => {
      const reason = error instanceof ClubSaveError ? error.reason : 'save';
      if (reason === 'exists') {
        // Klub powstał w międzyczasie (np. równoległa próba): drugiego nie ma, hub
        // pokazuje ten istniejący.
        void queryClient.invalidateQueries({ queryKey: clubKey });
        toast.show(SAVE_ERRORS.exists, 'error');
        back();
        return;
      }
      setSaveError(SAVE_ERRORS[reason]);
    },
  });

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setLogoError(undefined);
    const before = logo;
    setLogo({ kind: 'processing' });
    try {
      // Logo bywa przezroczyste: bez kodera WebP zostaje PNG, a nie JPEG na białym tle.
      const image = await scaleImage(file, { keepTransparency: true });
      const preview = URL.createObjectURL(image.blob);
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = preview;
      setLogo({ kind: 'new', image, preview });
    } catch (error) {
      setLogo(before);
      setLogoError(
        error instanceof ImageScaleError ? LOGO_ERRORS[error.reason] : form.errors.logoDecode,
      );
    }
  };

  const nameMessage = showErrors ? nameError(name) : undefined;
  const hasLogo =
    logo.kind === 'new' ||
    logo.kind === 'processing' ||
    (logo.kind === 'keep' && club?.logo_path != null);
  const logoSrc =
    logo.kind === 'new' ? logo.preview : logo.kind === 'keep' ? savedLogo.data : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    setSaveError(undefined);
    if (nameError(name) || logo.kind === 'processing' || save.isPending) return;
    const change: LogoChange =
      logo.kind === 'new'
        ? { kind: 'new', image: logo.image }
        : logo.kind === 'remove'
          ? logo
          : { kind: 'keep' };
    save.mutate(change);
  };

  return (
    <PopupModal
      title={creating ? form.addTitle : form.editTitle}
      footer={
        <>
          <Button variant="secondary" onClick={back}>
            {form.cancel}
          </Button>
          <Button
            type="submit"
            form={formId}
            loading={save.isPending || logo.kind === 'processing'}
          >
            {form.save}
          </Button>
        </>
      }
    >
      <form id={formId} className="club-form" noValidate onSubmit={submit}>
        {saveError ? <Banner variant="error">{saveError}</Banner> : null}

        <fieldset className="club-form__logo">
          <legend className="sr-only">{form.logoLabel}</legend>
          <div className="club-form__tile">
            <ClubLogo name={name} src={logoSrc} size={88} />
            <span className="club-form__badge" aria-hidden="true">
              {logo.kind === 'processing' ? <Spinner size={16} /> : <Icon name="upload" />}
            </span>
          </div>
          <div className="club-form__logo-text">
            <div className="club-form__logo-actions">
              <button
                type="button"
                className="club-form__link"
                disabled={logo.kind === 'processing'}
                onClick={() => fileRef.current?.click()}
              >
                {hasLogo ? form.changeLogo : form.addLogo}
              </button>
              {hasLogo && logo.kind !== 'processing' ? (
                <button
                  type="button"
                  className="club-form__link club-form__link--muted"
                  onClick={() => {
                    setLogo({ kind: 'remove' });
                    setLogoError(undefined);
                  }}
                >
                  {form.removeLogo}
                </button>
              ) : null}
            </div>
            <p className="club-form__helper" role={logoError ? 'alert' : undefined}>
              {logoError ? (
                <span className="club-form__helper--error">{logoError}</span>
              ) : logo.kind === 'processing' ? (
                form.logoProcessing
              ) : (
                <>
                  {form.logoHelper}
                  <br />
                  {form.logoFallback}
                </>
              )}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept={IMAGE_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-label={form.logoLabel}
              onChange={(event) => {
                void pickFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </div>
        </fieldset>

        <TextField
          label={form.nameLabel}
          placeholder={form.namePlaceholder}
          value={name}
          maxLength={CLUB_NAME_MAX}
          autoComplete="off"
          required
          error={nameMessage}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => name !== '' && setShowErrors(true)}
        />

        <Select
          label={form.timezoneLabel}
          options={options}
          value={timezone}
          onChange={setTimezone}
          leadingIcon="globe"
          hint={form.timezoneHint}
          searchLabel={form.timezoneSearch}
          matches={matchesTimezone}
        />
      </form>
    </PopupModal>
  );
}
