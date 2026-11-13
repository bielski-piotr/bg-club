import { NAME_MAX_LENGTH } from '@bg-club/accounts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/authContext';
import { format, t } from '../i18n';
import { usePopups } from '../popups/popupContext';
import { PopupModal } from '../popups/PopupModal';
import { avatarPerson, fullName, membersKey, profileKey } from '../profile/profiles';
import { Avatar, Banner, Button, Icon, TextField, useToast } from '../ui';
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

/** Ta sama walidacja co w Edge Function (`validateMemberInput`), żeby nie wysyłać złych danych. */
function fieldError(value: string): FieldProblem | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return 'required';
  if (trimmed.length > NAME_MAX_LENGTH) return 'tooLong';
  return undefined;
}

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
  const [created, setCreated] = useState<CreatedMember | null>(null);
  return created ? (
    <Credentials created={created} onAnother={() => setCreated(null)} />
  ) : (
    <AddMemberForm onCreated={setCreated} />
  );
}

function AddMemberForm({ onCreated }: { readonly onCreated: (created: CreatedMember) => void }) {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const { back } = usePopups();
  const formId = useId();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [serverProblems, setServerProblems] = useState<
    Partial<Record<keyof NewMember, FieldProblem>>
  >({});
  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  const save = useMutation({
    mutationFn: (input: NewMember) => createMember(client, input),
    // Wynik zawiera hasło: mutacja nie trzyma go w cache'u dłużej niż trwa ten formularz.
    gcTime: 0,
    onSuccess: (result) => {
      queryClient.setQueryData(profileKey(result.member.id), result.member);
      void queryClient.invalidateQueries({ queryKey: membersKey });
      // Potwierdzeniem jest ekran z danymi logowania (bez toastu, który zasłaniałby stopkę).
      onCreated(result);
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

  const local = {
    firstName: fieldError(firstName),
    lastName: fieldError(lastName),
  };
  const firstNameError = problemText(
    (showErrors ? local.firstName : undefined) ?? serverProblems.firstName,
    text.errors.firstNameRequired,
  );
  const lastNameError = problemText(
    (showErrors ? local.lastName : undefined) ?? serverProblems.lastName,
    text.errors.lastNameRequired,
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    setSaveError(undefined);
    setServerProblems({});
    if (local.firstName || local.lastName || save.isPending) return;
    save.mutate({ firstName, lastName });
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
            {text.submit}
          </Button>
        </>
      }
    >
      <form id={formId} className="member-form" noValidate onSubmit={submit}>
        {saveError ? <Banner variant="error">{saveError}</Banner> : null}
        <p className="member-form__intro">{text.intro}</p>
        <TextField
          label={text.firstNameLabel}
          placeholder={text.firstNamePlaceholder}
          value={firstName}
          maxLength={NAME_MAX_LENGTH}
          autoComplete="off"
          autoCapitalize="words"
          required
          error={firstNameError}
          onChange={(event) => {
            setFirstName(event.target.value);
            setServerProblems(({ firstName: _, ...rest }) => rest);
          }}
        />
        <TextField
          label={text.lastNameLabel}
          placeholder={text.lastNamePlaceholder}
          value={lastName}
          maxLength={NAME_MAX_LENGTH}
          autoComplete="off"
          autoCapitalize="words"
          required
          error={lastNameError}
          onChange={(event) => {
            setLastName(event.target.value);
            setServerProblems(({ lastName: _, ...rest }) => rest);
          }}
        />
      </form>
    </PopupModal>
  );
}

function Credentials({
  created,
  onAnother,
}: {
  readonly created: CreatedMember;
  readonly onAnother: () => void;
}) {
  const { back } = usePopups();
  const { member, password } = created;
  return (
    <PopupModal
      title={text.doneTitle}
      footer={
        <>
          <Button variant="secondary" icon="user-plus" onClick={onAnother}>
            {text.addAnother}
          </Button>
          <Button onClick={back}>{text.done}</Button>
        </>
      }
    >
      <div className="member-form">
        <div className="member-credentials__who">
          <Avatar {...avatarPerson(member)} size={56} decorative />
          <div className="row__text">
            <p className="member-credentials__name">{fullName(member)}</p>
            <p className="member-credentials__helper">{text.credentialsIntro}</p>
          </div>
        </div>
        <Banner variant="warning">{text.passwordOnce}</Banner>
        <CopyField
          label={text.hookLabel}
          value={member.hook}
          copyLabel={text.copyHook}
          copiedToast={text.copiedHook}
        />
        <CopyField
          label={text.passwordLabel}
          value={password}
          copyLabel={text.copyPassword}
          copiedToast={text.copiedPassword}
        />
      </div>
    </PopupModal>
  );
}

function CopyField({
  label,
  value,
  copyLabel,
  copiedToast,
}: {
  readonly label: string;
  readonly value: string;
  readonly copyLabel: string;
  readonly copiedToast: string;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.show(copiedToast, 'success');
    } catch {
      toast.show(text.copyFailed, 'error');
    }
  };
  return (
    <TextField
      label={label}
      value={value}
      readOnly
      mono
      // Wartość do przepisania z ekranu: bez autouzupełniania i podpowiedzi przeglądarki.
      autoComplete="off"
      spellCheck={false}
      onFocus={(event) => event.target.select()}
      trailing={
        <button
          type="button"
          className="member-copy"
          aria-label={copyLabel}
          onClick={() => void copy()}
        >
          <Icon name={copied ? 'check' : 'copy'} />
          <span className="member-copy__label" aria-hidden="true">
            {copied ? text.copied : text.copy}
          </span>
        </button>
      }
    />
  );
}
