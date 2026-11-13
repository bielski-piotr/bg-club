import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/authContext';
import { format, t } from '../i18n';
import { InvalidPopup } from '../popups/InvalidPopup';
import { usePopups } from '../popups/popupContext';
import { PopupDialog } from '../popups/PopupDialog';
import { QueryStatus } from '../popups/QueryStatus';
import { Banner, Button, TextField, useToast } from '../ui';
import { scorepadErrorMessage } from './messages';
import {
  deleteScorepad,
  renameScorepad,
  ScorepadError,
  SCOREPAD_NAME_MAX,
  scorepadName,
  scorepadsKey,
  useScorepad,
  type Scorepad,
} from './scorepads';

/** Dialog zamknięty w trakcie żądania (Esc, tło) jest odmontowany: wtedy nie cofamy drugi raz. */
function useMounted() {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}

/** „Zmień nazwę” notesu (GAME-7): bez nowej wersji, partie zachowują swój szablon. */
export function RenameScorepadDialog({ id }: { readonly id: string }) {
  const { client } = useAuth();
  const query = useScorepad(client, id);
  if (query.isSuccess && !query.data) return <InvalidPopup />;
  return query.data ? (
    <RenameForm pad={query.data} />
  ) : (
    <PopupDialog
      title={t.scorepads.rename.title}
      icon="pad"
      description={<QueryStatus isError={query.isError} onRetry={() => void query.refetch()} />}
      footer={<RenameCancel />}
    />
  );
}

function RenameCancel() {
  const { back } = usePopups();
  return (
    <Button variant="secondary" onClick={back}>
      {t.scorepads.rename.cancel}
    </Button>
  );
}

function RenameForm({ pad }: { readonly pad: Scorepad }) {
  const text = t.scorepads.rename;
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { back } = usePopups();
  const mounted = useMounted();
  const formId = useId();
  const [name, setName] = useState(pad.name);
  const [touched, setTouched] = useState(false);
  const trimmed = name.trim();
  const problem =
    trimmed === ''
      ? text.required
      : trimmed.length > SCOREPAD_NAME_MAX
        ? format(text.tooLong, { max: SCOREPAD_NAME_MAX })
        : undefined;

  const rename = useMutation({
    mutationFn: () => renameScorepad(client, pad.id, trimmed),
    onSuccess: () => {
      toast.show(format(t.scorepads.toasts.renamed, { name: scorepadName(trimmed) }), 'success');
      void queryClient.invalidateQueries({ queryKey: scorepadsKey });
      if (mounted.current) back();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (problem || rename.isPending) return;
    if (trimmed === pad.name) {
      back();
      return;
    }
    rename.mutate();
  };

  return (
    <PopupDialog
      title={text.title}
      icon="pad"
      description={<p>{text.helper}</p>}
      footer={
        <>
          <Button variant="secondary" disabled={rename.isPending} onClick={back}>
            {text.cancel}
          </Button>
          <Button type="submit" form={formId} loading={rename.isPending}>
            {text.submit}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={submit} className="scorepads">
        {rename.isError ? (
          <Banner variant="error">{scorepadErrorMessage(rename.error)}</Banner>
        ) : null}
        <TextField
          label={text.label}
          value={name}
          autoComplete="off"
          required
          maxLength={SCOREPAD_NAME_MAX}
          error={touched ? problem : undefined}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => setTouched(true)}
        />
      </form>
    </PopupDialog>
  );
}

/**
 * Potwierdzenie „Usuń notes” (GAME-7). Usunięcie jest miękkie: notes znika z listy i z wyboru
 * przy nowej partii, a wersje, obrazy kartek i rozegrane partie zostają w historii (GAME-9).
 * Jest idempotentne, więc po błędzie można je bezpiecznie ponowić.
 */
export function DeleteScorepadDialog({ id }: { readonly id: string }) {
  const text = t.scorepads.remove;
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { back } = usePopups();
  const mounted = useMounted();
  const query = useScorepad(client, id);
  const pad = query.data;

  const remove = useMutation({
    mutationFn: () => deleteScorepad(client, id),
    onSuccess: () => {
      if (pad) toast.show(format(t.scorepads.toasts.deleted, { name: pad.name }), 'success');
      if (mounted.current) back();
      void queryClient.invalidateQueries({ queryKey: scorepadsKey });
    },
  });

  if (!remove.isSuccess && query.isSuccess && !pad) return <InvalidPopup />;

  return (
    <PopupDialog
      title={text.title}
      icon="trash"
      tone="danger"
      description={
        pad ? (
          <p>{format(text.description, { name: pad.name })}</p>
        ) : (
          <QueryStatus isError={query.isError} onRetry={() => void query.refetch()} />
        )
      }
      footer={
        <>
          <Button variant="secondary" disabled={remove.isPending} onClick={back}>
            {text.cancel}
          </Button>
          <Button
            variant="destructive"
            loading={remove.isPending}
            disabled={!pad || remove.isSuccess}
            onClick={() => remove.mutate()}
          >
            {text.submit}
          </Button>
        </>
      }
    >
      {remove.isError ? (
        <Banner variant="error">
          {remove.error instanceof ScorepadError && remove.error.reason === 'forbidden'
            ? t.scorepads.errors.forbidden
            : t.scorepads.errors.remove}
        </Banner>
      ) : null}
    </PopupDialog>
  );
}
