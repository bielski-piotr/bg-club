import { MIN_PASSWORD_LENGTH } from '@bg-club/accounts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/authContext';
import { ownProfileKey, type OwnProfile } from '../auth/useOwnProfile';
import { format, t } from '../i18n';
import { usePopups } from '../popups/popupContext';
import { PopupModal } from '../popups/PopupModal';
import { Banner, Button, PasswordField, useToast } from '../ui';
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
   * `change`: zmiana hasła z ustawień. `first`: propozycja po pierwszym logowaniu
   * z przyciskiem „Pomiń”, który zapisuje, że gracz z niej zrezygnował.
   */
  readonly variant: 'change' | 'first';
}

/**
 * Zmiana hasła: obecne hasło i dwa razy nowe. Obecne hasło sprawdza Auth (`current_password`); nowe
 * musi
 * mieć co najmniej 12 znaków (jak hasła generowane) i różnić się od obecnego.
 * Hasło jest tylko w stanie formularza: nie trafia do adresu, cache'u ani `localStorage`.
 */
export function PasswordPopup({ me, variant }: PasswordPopupProps) {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { back } = usePopups();
  const formId = useId();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [currentInvalid, setCurrentInvalid] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);
  const first = variant === 'first';

  const clearSuggestion = () =>
    queryClient.setQueryData<OwnProfile | null>(ownProfileKey(me.id), (old) =>
      old ? { ...old, password_change_suggested: false } : old,
    );

  const change = useMutation({
    mutationFn: () => changePassword(client, me.id, { current, next }),
    // Hasła są w zmiennych mutacji: nie trzymamy ich w cache'u po zamknięciu formularza.
    gcTime: 0,
    onSuccess: () => {
      clearSuggestion();
      toast.show(text.toasts.changed, 'success');
      back();
    },
    onError: (error) => {
      const reason = error instanceof PasswordChangeError ? error.reason : 'unknown';
      if (reason === 'currentInvalid') setCurrentInvalid(true);
      else setSaveError(CHANGE_ERRORS[reason]);
    },
  });

  const skip = useMutation({
    mutationFn: () => dismissPasswordSuggestion(client, me.id),
    onSuccess: () => {
      clearSuggestion();
      back();
    },
    onError: () => setSaveError(text.errors.skip),
  });

  const problems = passwordProblems({ current, next, repeat });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    setSaveError(undefined);
    if (problems.current || problems.next || problems.repeat || change.isPending) return;
    change.mutate();
  };

  const currentError = currentInvalid
    ? text.errors.currentInvalid
    : showErrors
      ? problemText(problems.current)
      : undefined;
  const busy = change.isPending || skip.isPending;

  return (
    <PopupModal
      title={first ? text.firstTitle : text.title}
      footer={
        <>
          {first ? (
            <Button
              variant="secondary"
              loading={skip.isPending}
              disabled={change.isPending}
              onClick={() => skip.mutate()}
            >
              {text.skip}
            </Button>
          ) : (
            <Button variant="secondary" onClick={back}>
              {text.cancel}
            </Button>
          )}
          <Button type="submit" form={formId} loading={change.isPending} disabled={skip.isPending}>
            {text.submit}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="password-form"
        noValidate
        onSubmit={submit}
        aria-busy={busy || undefined}
      >
        <p className="password-form__intro">{first ? text.firstIntro : text.intro}</p>
        {saveError ? <Banner variant="error">{saveError}</Banner> : null}
        {/* Ukryty login pomaga menedżerom haseł zapisać nowe hasło dla właściwego konta. */}
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={me.hook}
          readOnly
          hidden
        />
        <PasswordField
          label={first ? text.firstCurrentLabel : text.currentLabel}
          value={current}
          autoComplete="current-password"
          required
          error={currentError}
          onChange={(event) => {
            setCurrent(event.target.value);
            setCurrentInvalid(false);
          }}
        />
        <PasswordField
          label={text.nextLabel}
          value={next}
          autoComplete="new-password"
          required
          hint={format(text.nextHint, { min: MIN_PASSWORD_LENGTH })}
          error={showErrors ? problemText(problems.next) : undefined}
          onChange={(event) => setNext(event.target.value)}
        />
        <PasswordField
          label={text.repeatLabel}
          value={repeat}
          autoComplete="new-password"
          required
          error={showErrors ? problemText(problems.repeat) : undefined}
          onChange={(event) => setRepeat(event.target.value)}
        />
      </form>
    </PopupModal>
  );
}
