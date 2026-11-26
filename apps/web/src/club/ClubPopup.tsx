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
  useContext,
} from 'solid-js';
import { format, t } from '../i18n';
import { leaderboardRootKey } from '../leaderboard/leaderboard';
import { createClub, createCoverUrl } from './clubData';
import { AuthContext } from '../auth/authContext';
import { PopupsContext } from '../popups/popupContext';
import { QueryClientContext } from '../lib/queryClient';
import { ToastContext } from '../ui/toastContext';
import { PopupModal } from '../popups/PopupModal';
import { QueryBoundary } from '../popups/QueryStatus';
import {
  Banner,
  Button,
  Icon,
  normalizeSearch,
  Select,
  Spinner,
  TextField,
  type SelectOption,
} from '../ui';
import {
  CLUB_NAME_MAX,
  ClubSaveError,
  clubKey,
  saveClub,
  type Club,
  type ClubSaveFailure,
  type LogoChange,
} from './club';
import { ClubLogo } from './ClubLogo';
import { IMAGE_ACCEPT, ImageScaleError, scaleImage, type ScaledImage } from './image';
import { browserTimezone, timezoneOptions } from './timezones';
import './club.css';

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

/**
 * Popup „Dodaj klub” / „Edytuj klub”. Otwiera go administrator z pierwszego
 * uruchomienia albo ołówkiem w nagłówku huba; dla gracza `HubPopup` pokazuje „Nie znaleziono”.
 * Jedno okno dla wczytywania i formularza (fokus zostaje na oknie).
 */
export function ClubPopup() {
  const auth = useContext(AuthContext);
  const queryClient = useContext(QueryClientContext);
  const toast = useContext(ToastContext);
  const popups = useContext(PopupsContext);
  const formId = createUniqueId();
  const form = t.club.form;
  let fileInput: HTMLInputElement | undefined;

  const source = createClub();
  // Formularz startuje z pierwszych wczytanych danych: odświeżenie klubu w cache (np. zapis
  // z innej karty) nie nadpisuje tego, co wpisano. Okno (tytuł, stopka) czyta cache bez czekania.
  let first: { readonly club: Club | null } | undefined;
  const ctx = createMemo(() => {
    const loaded = source.current();
    return (first ??= loaded === undefined ? undefined : { club: loaded });
  });
  /** Kontekst formularza pod `<QueryBoundary>`: czyta zapytanie, więc czeka na dane. */
  const formCtx = () => {
    source();
    return ctx();
  };
  const club = () => ctx()?.club ?? null;
  const creating = () => club() === null;

  const [name, setName] = createSignal(() => ctx()?.club?.name ?? '');
  const [timezone, setTimezone] = createSignal(() => ctx()?.club?.timezone ?? browserTimezone());
  const [logo, setLogo] = createSignal<LogoState>({ kind: 'keep' });
  const [logoError, setLogoError] = createSignal<string | undefined>(undefined);
  const [showErrors, setShowErrors] = createSignal(false);
  const [saveError, setSaveError] = createSignal<string | undefined>(undefined);
  // Lista stref z przesunięciami liczona raz po wczytaniu; zawiera strefę zapisaną i strefę
  // przeglądarki.
  const options = createMemo(() => {
    const loaded = ctx();
    return loaded ? timezoneOptions([loaded.club?.timezone ?? browserTimezone()]) : [];
  });
  const savedLogo = createCoverUrl(() =>
    logo().kind === 'keep' ? (club()?.logo_path ?? null) : null,
  );

  // Adres podglądu zwalniamy przy wyborze kolejnego pliku i przy zamknięciu popupu.
  let previewUrl: string | null = null;
  onSettled(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  });

  const [saving, setSaving] = createOptimistic(false);
  const save = action(function* (change: {
    readonly existing: Club | null;
    readonly logo: LogoChange;
  }) {
    setSaving(true);
    let saved: Club;
    try {
      saved = (yield saveClub(auth.client, change.existing, {
        name: name(),
        timezone: timezone(),
        logo: change.logo,
      })) as Club;
    } catch (error) {
      const reason = error instanceof ClubSaveError ? error.reason : 'save';
      if (reason === 'exists') {
        // Klub powstał w międzyczasie (np. równoległa próba): drugiego nie ma, hub
        // pokazuje ten istniejący.
        void queryClient.invalidateQueries({ queryKey: clubKey });
        toast.show(SAVE_ERRORS.exists, 'error');
        popups.back();
        return;
      }
      setSaveError(SAVE_ERRORS[reason]);
      return;
    }
    queryClient.setQueryData(clubKey, saved);
    // Strefa klubu wyznacza granice roku w rankingu.
    void queryClient.invalidateQueries({ queryKey: leaderboardRootKey });
    toast.show(change.existing === null ? t.club.toasts.created : t.club.toasts.updated, 'success');
    popups.back();
  });

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setLogoError(undefined);
    const before = logo();
    setLogo({ kind: 'processing' });
    try {
      // Logo bywa przezroczyste: bez kodera WebP zostaje PNG, a nie JPEG na białym tle.
      const image = await scaleImage(file, { keepTransparency: true });
      const preview = URL.createObjectURL(image.blob);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = preview;
      setLogo({ kind: 'new', image, preview });
    } catch (error) {
      setLogo(before);
      setLogoError(
        error instanceof ImageScaleError ? LOGO_ERRORS[error.reason] : form.errors.logoDecode,
      );
    }
  };

  const processing = () => logo().kind === 'processing';
  const hasLogo = () => {
    const state = logo();
    return (
      state.kind === 'new' ||
      state.kind === 'processing' ||
      (state.kind === 'keep' && club()?.logo_path != null)
    );
  };
  const logoSrc = () => {
    const state = logo();
    return state.kind === 'new'
      ? state.preview
      : state.kind === 'keep'
        ? savedLogo.current()
        : undefined;
  };

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    // Wpis z tego samego zadania (autouzupełnianie + Enter) musi być już w sygnałach.
    flush();
    setShowErrors(true);
    setSaveError(undefined);
    const state = logo();
    if (nameError(name()) || state.kind === 'processing' || saving()) return;
    const change: LogoChange =
      state.kind === 'new'
        ? { kind: 'new', image: state.image }
        : state.kind === 'remove'
          ? state
          : { kind: 'keep' };
    void save({ existing: club(), logo: change });
  };

  return (
    <PopupModal
      title={ctx() && !creating() ? form.editTitle : form.addTitle}
      footer={
        <Show when={ctx()}>
          <Button variant="secondary" onClick={() => popups.back()}>
            {form.cancel}
          </Button>
          <Button type="submit" form={formId} loading={saving() || processing()}>
            {form.save}
          </Button>
        </Show>
      }
    >
      <QueryBoundary>
        <Show when={formCtx()}>
          <form id={formId} class="club-form" novalidate onSubmit={submit}>
            <Show when={saveError()}>
              <Banner variant="error">{saveError()}</Banner>
            </Show>

            <fieldset class="club-form__logo">
              <legend class="sr-only">{form.logoLabel}</legend>
              <div class="club-form__tile">
                <ClubLogo name={name()} src={logoSrc()} size={88} />
                <span class="club-form__badge" aria-hidden="true">
                  <Show when={processing()} fallback={<Icon name="upload" />}>
                    <Spinner size={16} />
                  </Show>
                </span>
              </div>
              <div class="club-form__logo-text">
                <div class="club-form__logo-actions">
                  <button
                    type="button"
                    class="club-form__link"
                    disabled={processing()}
                    onClick={() => fileInput?.click()}
                  >
                    {hasLogo() ? form.changeLogo : form.addLogo}
                  </button>
                  <Show when={hasLogo() && !processing()}>
                    <button
                      type="button"
                      class="club-form__link club-form__link--muted"
                      onClick={() => {
                        setLogo({ kind: 'remove' });
                        setLogoError(undefined);
                      }}
                    >
                      {form.removeLogo}
                    </button>
                  </Show>
                </div>
                <p class="club-form__helper" role={logoError() ? 'alert' : undefined}>
                  <Switch
                    fallback={
                      <>
                        {form.logoHelper}
                        <br />
                        {form.logoFallback}
                      </>
                    }
                  >
                    <Match when={logoError()}>
                      <span class="club-form__helper--error">{logoError()}</span>
                    </Match>
                    <Match when={processing()}>{form.logoProcessing}</Match>
                  </Switch>
                </p>
                <input
                  ref={(el) => (fileInput = el)}
                  type="file"
                  accept={IMAGE_ACCEPT}
                  class="sr-only"
                  tabindex={-1}
                  aria-label={form.logoLabel}
                  onChange={(event) => {
                    void pickFile(event.currentTarget.files?.[0]);
                    event.currentTarget.value = '';
                  }}
                />
              </div>
            </fieldset>

            <TextField
              label={form.nameLabel}
              placeholder={form.namePlaceholder}
              value={name()}
              maxlength={CLUB_NAME_MAX}
              autocomplete="off"
              required
              error={showErrors() ? nameError(name()) : undefined}
              onInput={(event) => setName(event.currentTarget.value)}
              onBlur={(event) => {
                // Wpis z tego samego zadania jest w polu, a w sygnale dopiero po flushu.
                if (event.currentTarget.value !== '') setShowErrors(true);
              }}
            />

            <Select
              label={form.timezoneLabel}
              options={options()}
              value={timezone()}
              onChange={setTimezone}
              leadingIcon="globe"
              hint={form.timezoneHint}
              searchLabel={form.timezoneSearch}
              matches={matchesTimezone}
            />
          </form>
        </Show>
      </QueryBoundary>
    </PopupModal>
  );
}
