import { NAME_MAX_LENGTH } from '@bg-club/accounts';
import { createMemo, createSignal, createUniqueId, flush, Show, useContext } from 'solid-js';
import { format, t } from '../i18n';
import { allProfilesKey, fullName, membersKey, profileKey } from '../profile/profileQueries';
import { nameProblem } from '../profile/settings';
import { AuthContext } from '../auth/authContext';
import { PopupsContext } from '../popups/popupContext';
import { QueryClientContext } from '../lib/queryClient';
import { ToastContext } from '../ui/toastContext';
import { PopupModal } from '../popups/PopupModal';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import { createMutation } from '../lib/query';
import { Banner, Button, Icon, TextField } from '../ui';
import {
  createMember,
  CreateMemberError,
  type CreatedMember,
  type CreateMemberFailure,
  type FieldProblem,
  type NewMember,
} from './createMember';
import './members.css';

const text = t.addMember;

const SAVE_ERRORS: Readonly<Record<Exclude<CreateMemberFailure, 'invalid'>, string>> = {
  forbidden: text.errors.forbidden,
  session: text.errors.session,
  network: text.errors.network,
  failed: text.errors.failed,
  unknown: text.errors.unknown,
};

type Problems = Partial<Record<keyof NewMember, FieldProblem>>;

function problemText(problem: FieldProblem | undefined, required: string): string | undefined {
  if (problem === 'required') return required;
  if (problem === 'tooLong') return format(text.errors.tooLong, { max: NAME_MAX_LENGTH });
  return undefined;
}

/**
 * Popup „Dodaj członka” (MEM-3, DS §7 formularz 560 / arkusz na telefonie). Po zapisie pokazuje
 * hook i wygenerowane hasło jednorazowo (AUTH-4): hasło jest tylko w stanie tego popupu, nie
 * w adresie, cache'u zapytań ani `localStorage`, więc znika po zamknięciu okna.
 */
export function AddMemberPopup() {
  const [created, setCreated] = createSignal<CreatedMember | null>(null);
  return (
    <Show when={created()} fallback={<AddMemberForm onCreated={(result) => setCreated(result)} />}>
      {(result) => <Credentials created={result()} onAnother={() => setCreated(null)} />}
    </Show>
  );
}

function AddMemberForm(props: { readonly onCreated: (created: CreatedMember) => void }) {
  const auth = useContext(AuthContext);
  const queryClient = useContext(QueryClientContext);
  const popups = useContext(PopupsContext);
  const formId = createUniqueId();
  const [firstName, setFirstName] = createSignal('');
  const [lastName, setLastName] = createSignal('');
  const [showErrors, setShowErrors] = createSignal(false);
  const [serverProblems, setServerProblems] = createSignal<Problems>({});
  const [saveError, setSaveError] = createSignal<string | undefined>(undefined);

  const save = createMutation({
    mutationFn: (input: NewMember) => createMember(auth.client, input),
    // Wynik zawiera hasło: mutacja nie trzyma go w cache'u dłużej niż trwa ten formularz.
    gcTime: 0,
    onSuccess: (result) => {
      queryClient.setQueryData(profileKey(result.member.id), result.member);
      void queryClient.invalidateQueries({ queryKey: membersKey });
      void queryClient.invalidateQueries({ queryKey: allProfilesKey });
      // Potwierdzeniem jest ekran z danymi logowania (bez toastu, który zasłaniałby stopkę).
      props.onCreated(result);
    },
    onError: (error) => {
      if (error instanceof CreateMemberError && error.reason === 'invalid') {
        setServerProblems(error.problems);
        return;
      }
      const reason = error instanceof CreateMemberError ? error.reason : 'failed';
      setSaveError(SAVE_ERRORS[reason === 'invalid' ? 'failed' : reason]);
    },
  });

  // Ta sama walidacja co w Edge Function (`validateMemberInput`), żeby nie wysyłać złych danych.
  const local = createMemo(() => ({
    firstName: nameProblem(firstName()),
    lastName: nameProblem(lastName()),
  }));
  const firstNameError = () =>
    problemText(
      (showErrors() ? local().firstName : undefined) ?? serverProblems().firstName,
      text.errors.firstNameRequired,
    );
  const lastNameError = () =>
    problemText(
      (showErrors() ? local().lastName : undefined) ?? serverProblems().lastName,
      text.errors.lastNameRequired,
    );

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    // Wpis z tego samego zadania (autouzupełnianie, menedżer haseł + Enter) musi być już
    // w sygnałach, zanim walidacja je odczyta: odczyty widzą zapis dopiero po flushu.
    flush();
    setShowErrors(true);
    setSaveError(undefined);
    setServerProblems({});
    const problems = local();
    if (problems.firstName || problems.lastName || save.state().isPending) return;
    save.mutate({ firstName: firstName(), lastName: lastName() });
  };

  return (
    <PopupModal
      title={text.title}
      footer={
        <>
          <Button variant="secondary" onClick={() => popups.back()}>
            {text.cancel}
          </Button>
          <Button type="submit" form={formId} loading={save.state().isPending}>
            {text.submit}
          </Button>
        </>
      }
    >
      <form id={formId} class="member-form" novalidate onSubmit={submit}>
        <Show when={saveError()}>
          <Banner variant="error">{saveError()}</Banner>
        </Show>
        <p class="member-form__intro">{text.intro}</p>
        <TextField
          label={text.firstNameLabel}
          placeholder={text.firstNamePlaceholder}
          value={firstName()}
          maxlength={NAME_MAX_LENGTH}
          autocomplete="off"
          autocapitalize="words"
          required
          error={firstNameError()}
          onInput={(event) => {
            setFirstName(event.currentTarget.value);
            setServerProblems(({ firstName: _, ...rest }) => rest);
          }}
        />
        <TextField
          label={text.lastNameLabel}
          placeholder={text.lastNamePlaceholder}
          value={lastName()}
          maxlength={NAME_MAX_LENGTH}
          autocomplete="off"
          autocapitalize="words"
          required
          error={lastNameError()}
          onInput={(event) => {
            setLastName(event.currentTarget.value);
            setServerProblems(({ lastName: _, ...rest }) => rest);
          }}
        />
      </form>
    </PopupModal>
  );
}

function Credentials(props: { readonly created: CreatedMember; readonly onAnother: () => void }) {
  const popups = useContext(PopupsContext);
  return (
    <PopupModal
      title={text.doneTitle}
      footer={
        <>
          <Button variant="secondary" icon="user-plus" onClick={() => props.onAnother()}>
            {text.addAnother}
          </Button>
          <Button onClick={() => popups.back()}>{text.done}</Button>
        </>
      }
    >
      <div class="member-form">
        <div class="member-credentials__who">
          <ProfileAvatar profile={props.created.member} size={56} decorative />
          <div class="row__text">
            <p class="member-credentials__name">{fullName(props.created.member)}</p>
            <p class="member-credentials__helper">{text.credentialsIntro}</p>
          </div>
        </div>
        <Banner variant="warning">{text.passwordOnce}</Banner>
        <CopyField
          label={text.hookLabel}
          value={props.created.member.hook}
          copyLabel={text.copyHook}
          copiedToast={text.copiedHook}
        />
        <CopyField
          label={text.passwordLabel}
          value={props.created.password}
          copyLabel={text.copyPassword}
          copiedToast={text.copiedPassword}
        />
      </div>
    </PopupModal>
  );
}

function CopyField(props: {
  readonly label: string;
  readonly value: string;
  readonly copyLabel: string;
  readonly copiedToast: string;
}) {
  const toast = useContext(ToastContext);
  const [copied, setCopied] = createSignal(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.value);
      setCopied(true);
      toast.show(props.copiedToast, 'success');
    } catch {
      toast.show(text.copyFailed, 'error');
    }
  };
  return (
    <TextField
      label={props.label}
      value={props.value}
      readonly
      mono
      // Wartość do przepisania z ekranu: bez autouzupełniania i podpowiedzi przeglądarki.
      autocomplete="off"
      spellcheck="false"
      onFocus={(event) => event.currentTarget.select()}
      trailing={
        <button
          type="button"
          class="member-copy"
          aria-label={props.copyLabel}
          onClick={() => void copy()}
        >
          <Icon name={copied() ? 'check' : 'copy'} />
          <span class="member-copy__label" aria-hidden="true">
            {copied() ? text.copied : text.copy}
          </span>
        </button>
      }
    />
  );
}
