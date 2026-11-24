import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/authContext';
import { format, t } from '../i18n';
import { InvalidPopup } from '../popups/InvalidPopup';
import { usePopups } from '../popups/popupContext';
import { useMounted } from '../popups/useMounted';
import { PopupDialog } from '../popups/PopupDialog';
import { QueryStatus } from '../popups/QueryStatus';
import { useAllExpansions, useGameSearch } from '../games/games';
import { Banner, Button, Select, TextField, useToast, type SelectOption } from '../ui';
import { scorepadErrorMessage } from './messages';
import {
  deleteScorepad,
  moveScorepad,
  renameScorepad,
  ScorepadError,
  SCOREPAD_NAME_MAX,
  scorepadName,
  scorepadsKey,
  useScorepad,
  type Scorepad,
} from './scorepads';

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
 * „Przenieś do…”: notes trafia do innej gry albo dodatku (np. notes dodatku dodany najpierw
 * przy grze podstawowej). Historia się nie zmienia: rozegrane partie zachowują swoją grę
 * i wersję notesu.
 */
export function MoveScorepadPopup({ id }: { readonly id: string }) {
  const text = t.scorepads.move;
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { back } = usePopups();
  const mounted = useMounted();
  const query = useScorepad(client, id);
  const games = useGameSearch(client, '');
  const expansions = useAllExpansions(client);
  const [target, setTarget] = useState<string | null>(null);
  const pad = query.data;

  const options: SelectOption<string>[] = [];
  if (games.data && expansions.data) {
    const titles = new Map(games.data.map((game) => [game.id, game.title]));
    for (const game of games.data) {
      options.push({ value: game.id, label: game.title, disabled: game.id === pad?.game_id });
      for (const expansion of expansions.data) {
        if (expansion.base_game_id !== game.id) continue;
        options.push({
          value: expansion.id,
          label: format(text.expansionOption, {
            game: titles.get(game.id) ?? '',
            title: expansion.title,
          }),
          disabled: expansion.id === pad?.game_id,
        });
      }
    }
  }
  const targetLabel = options.find((option) => option.value === target)?.label ?? '';

  const move = useMutation({
    mutationFn: () => {
      if (!target) throw new ScorepadError('save');
      return moveScorepad(client, id, target);
    },
    onSuccess: () => {
      if (pad) {
        toast.show(
          format(t.scorepads.toasts.moved, { name: pad.name, title: targetLabel }),
          'success',
        );
      }
      void queryClient.invalidateQueries({ queryKey: scorepadsKey });
      if (mounted.current) back();
    },
  });

  if (!move.isSuccess && query.isSuccess && !pad) return <InvalidPopup />;
  const loading = !pad || !games.data || !expansions.data;
  const failed = query.isError || games.isError || expansions.isError;

  return (
    <PopupDialog
      title={text.title}
      icon="pad"
      description={
        loading ? (
          <QueryStatus
            isError={failed}
            onRetry={() => {
              void query.refetch();
              void games.refetch();
              void expansions.refetch();
            }}
          />
        ) : (
          <p>{format(text.description, { name: pad.name })}</p>
        )
      }
      footer={
        <>
          <Button variant="secondary" disabled={move.isPending} onClick={back}>
            {text.cancel}
          </Button>
          <Button
            loading={move.isPending}
            disabled={loading || target === null || move.isSuccess}
            onClick={() => move.mutate()}
          >
            {text.submit}
          </Button>
        </>
      }
    >
      {move.isError ? <Banner variant="error">{scorepadErrorMessage(move.error)}</Banner> : null}
      {loading ? null : (
        <Select
          label={text.label}
          options={options}
          value={target}
          onChange={setTarget}
          searchLabel={text.search}
          hint={text.hint}
        />
      )}
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
