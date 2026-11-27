import { MIN_PASSWORD_LENGTH } from '@bg-club/accounts';
import {
  action,
  createMemo,
  createOptimistic,
  createSignal,
  flush,
  Show,
  useContext,
} from 'solid-js';
import { ownProfileKey, type OwnProfile } from '../auth/ownProfile';
import { format, t } from '../i18n';
import { AuthContext } from '../auth/authContext';
import { QueryClientContext } from '../lib/queryClient';
import { Banner, PasswordField } from '../ui';
import {
  changePassword,
  PasswordChangeError,
  passwordProblems,
  type PasswordChangeFailure,
  type PasswordProblem,
} from './settings';

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

/**
 * Password change form state (current password and the new one twice), shared by the settings
 * page and the first-login popup. The current password is checked by Auth
 * (`current_password`); the new one needs at least 12 characters and must differ from it.
 * Passwords live only in the form signals: never in the address, the query cache or
 * `localStorage`. After a change the fields are cleared and `onChanged` runs.
 */
export function createPasswordChange(me: () => OwnProfile, onChanged: () => void) {
  const auth = useContext(AuthContext);
  const queryClient = useContext(QueryClientContext);
  const [current, setCurrent] = createSignal('');
  const [next, setNext] = createSignal('');
  const [repeat, setRepeat] = createSignal('');
  const [showErrors, setShowErrors] = createSignal(false);
  const [currentInvalid, setCurrentInvalid] = createSignal(false);
  const [error, setError] = createSignal<string | undefined>(undefined);

  /** The suggestion to change the generated password is gone once the user decided. */
  const clearSuggestion = () =>
    queryClient.setQueryData<OwnProfile | null>(ownProfileKey(me().id), (old) =>
      old ? { ...old, password_change_suggested: false } : old,
    );

  const [changing, setChanging] = createOptimistic(false);
  const change = action(function* () {
    setChanging(true);
    try {
      yield changePassword(auth.client, me().id, { current: current(), next: next() });
    } catch (failure) {
      const reason = failure instanceof PasswordChangeError ? failure.reason : 'unknown';
      if (reason === 'currentInvalid') setCurrentInvalid(true);
      else setError(CHANGE_ERRORS[reason]);
      return;
    }
    clearSuggestion();
    setCurrent('');
    setNext('');
    setRepeat('');
    setShowErrors(false);
    onChanged();
  });

  const problems = createMemo(() =>
    passwordProblems({ current: current(), next: next(), repeat: repeat() }),
  );
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    // Wpis z tego samego zadania (menedżer haseł + Enter) musi być już w sygnałach.
    flush();
    setShowErrors(true);
    setError(undefined);
    const found = problems();
    if (found.current || found.next || found.repeat || changing()) return;
    void change();
  };

  const currentError = () =>
    currentInvalid()
      ? text.errors.currentInvalid
      : showErrors()
        ? problemText(problems().current)
        : undefined;

  /** The fields with the error banner; `currentLabel` names the current password. */
  function Fields(props: { readonly currentLabel: string }) {
    return (
      <>
        <Show when={error()}>
          <Banner variant="error">{error()}</Banner>
        </Show>
        {/* Ukryty login pomaga menedżerom haseł zapisać nowe hasło dla właściwego konta. */}
        <input
          type="text"
          name="username"
          autocomplete="username"
          value={me().hook}
          readonly
          hidden
        />
        <PasswordField
          label={props.currentLabel}
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
      </>
    );
  }

  return { submit, changing, setError, clearSuggestion, Fields };
}
