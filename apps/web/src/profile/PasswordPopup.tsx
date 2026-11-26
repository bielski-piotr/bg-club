import { MIN_PASSWORD_LENGTH } from '@bg-club/accounts';
import { createMemo, createSignal, createUniqueId, flush, Show, useContext } from 'solid-js';
import { ownProfileKey, type OwnProfile } from '../auth/ownProfile';
import { format, t } from '../i18n';
import { AuthContext } from '../auth/authContext';
import { PopupsContext } from '../popups/popupContext';
import { QueryClientContext } from '../lib/queryClient';
import { ToastContext } from '../ui/toastContext';
import { PopupModal } from '../popups/PopupModal';
import { createMutation } from '../lib/query';
import { ariaTrue } from '../ui/dom';
import { Banner, Button, PasswordField } from '../ui';
import {
  changePassword,
  dismissPasswordSuggestion,
  PasswordChangeError,
  passwordProblems,
  type PasswordChangeFailure,
  type PasswordProblem,
} from './settings';
import './profile.css';

const text = t.password;

function problemText(problem: PasswordProblem | undefined): string | undefined {
  if (!problem) return undefined;
  if (problem === 'tooShort') return format(text.errors.tooShort, { min: MIN_PASSWORD_LENGTH });
  return text.errors[problem];
}

const CHANGE_ERRORS: Readonly<Record<Exclude<PasswordChangeFailure, 'currentInvalid'>, string>> = {
  weak: text.errors.weak,
  same: text.errors.same,
  rateLimited: text.errors.rateLimited,
  network: text.errors.network,
  unknown: text.errors.unknown,
};

interface PasswordPopupProps {
  readonly me: OwnProfile;
  /**
   * `change`: zmiana hasła z ustawień (USR-5). `first`: propozycja po pierwszym logowaniu
   * (AUTH-6) z przyciskiem „Pomiń”, który zapisuje, że gracz z niej zrezygnował.
   */
  readonly variant: 'change' | 'first';
}

/**
 * Zmiana hasła (USR-5, DS „Profil / Zmiana hasła”, „Pierwsze logowanie – własne hasło”):
 * obecne hasło i dwa razy nowe. Obecne hasło sprawdza Auth (`current_password`); nowe musi
 * mieć co najmniej 12 znaków (jak hasła generowane, AUTH-4) i różnić się od obecnego.
 * Hasło jest tylko w stanie formularza: nie trafia do adresu, cache'u ani `localStorage`.
 */
export function PasswordPopup(props: PasswordPopupProps) {
  const auth = useContext(AuthContext);
  const queryClient = useContext(QueryClientContext);
  const toast = useContext(ToastContext);
  const popups = useContext(PopupsContext);
  const formId = createUniqueId();
  const [current, setCurrent] = createSignal('');
  const [next, setNext] = createSignal('');
  const [repeat, setRepeat] = createSignal('');
  const [showErrors, setShowErrors] = createSignal(false);
  const [currentInvalid, setCurrentInvalid] = createSignal(false);
  const [saveError, setSaveError] = createSignal<string | undefined>(undefined);
  const first = () => props.variant === 'first';

  const clearSuggestion = () =>
    queryClient.setQueryData<OwnProfile | null>(ownProfileKey(props.me.id), (old) =>
      old ? { ...old, password_change_suggested: false } : old,
    );

  const change = createMutation({
    mutationFn: () =>
      changePassword(auth.client, props.me.id, { current: current(), next: next() }),
    // Hasła są w zmiennych mutacji: nie trzymamy ich w cache'u po zamknięciu formularza.
    gcTime: 0,
    onSuccess: () => {
      clearSuggestion();
      toast.show(text.toasts.changed, 'success');
      popups.back();
    },
    onError: (error) => {
      const reason = error instanceof PasswordChangeError ? error.reason : 'unknown';
      if (reason === 'currentInvalid') setCurrentInvalid(true);
      else setSaveError(CHANGE_ERRORS[reason]);
    },
  });

  const skip = createMutation({
    mutationFn: () => dismissPasswordSuggestion(auth.client, props.me.id),
    onSuccess: () => {
      clearSuggestion();
      popups.back();
    },
    onError: () => setSaveError(text.errors.skip),
  });

  const problems = createMemo(() =>
    passwordProblems({ current: current(), next: next(), repeat: repeat() }),
  );
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    // Wpis z tego samego zadania (menedżer haseł + Enter) musi być już w sygnałach.
    flush();
    setShowErrors(true);
    setSaveError(undefined);
    const found = problems();
    if (found.current || found.next || found.repeat || change.state().isPending) return;
    change.mutate();
  };

  const currentError = () =>
    currentInvalid()
      ? text.errors.currentInvalid
      : showErrors()
        ? problemText(problems().current)
        : undefined;
  const busy = () => change.state().isPending || skip.state().isPending;

  return (
    <PopupModal
      title={first() ? text.firstTitle : text.title}
      footer={
        <>
          <Show
            when={first()}
            fallback={
              <Button variant="secondary" onClick={() => popups.back()}>
                {text.cancel}
              </Button>
            }
          >
            <Button
              variant="secondary"
              loading={skip.state().isPending}
              disabled={change.state().isPending}
              onClick={() => skip.mutate()}
            >
              {text.skip}
            </Button>
          </Show>
          <Button
            type="submit"
            form={formId}
            loading={change.state().isPending}
            disabled={skip.state().isPending}
          >
            {text.submit}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        class="password-form"
        novalidate
        onSubmit={submit}
        aria-busy={ariaTrue(busy())}
      >
        <p class="password-form__intro">{first() ? text.firstIntro : text.intro}</p>
        <Show when={saveError()}>
          <Banner variant="error">{saveError()}</Banner>
        </Show>
        {/* Ukryty login pomaga menedżerom haseł zapisać nowe hasło dla właściwego konta. */}
        <input
          type="text"
          name="username"
          autocomplete="username"
          value={props.me.hook}
          readonly
          hidden
        />
        <PasswordField
          label={first() ? text.firstCurrentLabel : text.currentLabel}
          value={current()}
          autocomplete="current-password"
          required
          error={currentError()}
          onInput={(event) => {
            setCurrent(event.currentTarget.value);
            setCurrentInvalid(false);
          }}
        />
        <PasswordField
          label={text.nextLabel}
          value={next()}
          autocomplete="new-password"
          required
          hint={format(text.nextHint, { min: MIN_PASSWORD_LENGTH })}
          error={showErrors() ? problemText(problems().next) : undefined}
          onInput={(event) => setNext(event.currentTarget.value)}
        />
        <PasswordField
          label={text.repeatLabel}
          value={repeat()}
          autocomplete="new-password"
          required
          error={showErrors() ? problemText(problems().repeat) : undefined}
          onInput={(event) => setRepeat(event.currentTarget.value)}
        />
      </form>
    </PopupModal>
  );
}
