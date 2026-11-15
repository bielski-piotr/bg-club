import type { ScorePadFile, ScorePadSheet, ScorePadTemplate } from '@bg-club/score-pad';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/authContext';
import type { OwnProfile } from '../auth/useOwnProfile';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { useClub } from '../hub/club';
import { format, t } from '../i18n';
import { usePopups } from '../popups/popupContext';
import { PopupModal } from '../popups/PopupModal';
import { QueryStatus } from '../popups/QueryStatus';
import { fullName, useAllProfiles, type Profile } from '../profile/profiles';
import { ScorePadView, type ScorePadHandle } from '../score-pad/ScorePadView';
import { loadVersionTemplate, versionTemplateKey } from '../score-pad/scorepads';
import { Banner, Button } from '../ui';
import { cx } from '../ui/cx';
import { localDateTime } from './datetime';
import { useMeeting, type Meeting } from './meetings';
import {
  DraftSaver,
  draftStorage,
  isSheet,
  readLocalDraft,
  removeLocalDrafts,
  resolveDraftStart,
  saveDraft,
  sheetWithPlayers,
  type DraftStatus,
  type ServerDraft,
} from './playDraft';
import { isMeetingRunner, playKey, usePlay, type PlayDetail } from './plays';

const text = t.meetings.play;

/**
 * Partia w toku (PAD-4, PAD-8, PAD-9, RUN-3): notes 3D z szablonem wersji, z którą partia się
 * zaczęła, i graczami na ich miejscach. Wpisy zapisują się jako szkic w bazie (po 1,5 s)
 * i w `localStorage`, więc odświeżenie, awaria i utrata sieci ich nie gubią, a admin albo
 * prowadzący może dokończyć partię na innym urządzeniu. Nowszy szkic z innego urządzenia daje
 * konflikt do rozstrzygnięcia zamiast cichego nadpisania.
 *
 * Notes widzi tylko admin i prowadzący trwającego spotkania; pozostali dostają „Trwa partia”.
 */
export function PlayPopup({ id, me }: { readonly id: string; readonly me: OwnProfile }) {
  const { client } = useAuth();
  const play = usePlay(client, id);
  const meeting = useMeeting(client, play.data?.meeting_id ?? '');
  const profiles = useAllProfiles(client);
  const club = useClub(client);

  // Partii nie ma (porzucona, zły link): kopie szkicu na tym urządzeniu nic już nie znaczą.
  const gone = play.isSuccess && play.data === null;
  useEffect(() => {
    if (gone) removeLocalDrafts(draftStorage(), id);
  }, [gone, id]);

  const title = play.data?.game.title ?? text.loading;
  if (gone || (play.data && meeting.isSuccess && !meeting.data)) {
    return (
      <PopupModal title={t.meetings.view.plays}>
        <p className="meeting-form__state">{text.gone}</p>
      </PopupModal>
    );
  }
  if (!play.data || !meeting.data || !profiles.data) {
    return (
      <PopupModal title={title}>
        <QueryStatus
          isError={play.isError || meeting.isError || profiles.isError}
          onRetry={() => {
            if (play.isError) void play.refetch();
            if (meeting.isError) void meeting.refetch();
            if (profiles.isError) void profiles.refetch();
          }}
        />
      </PopupModal>
    );
  }

  const current = play.data;
  const runner = isMeetingRunner(meeting.data, me);
  const reason =
    current.status === 'saved'
      ? text.saved
      : !runner
        ? text.notRunner
        : meeting.data.status !== 'in_progress'
          ? text.notInProgress
          : null;
  if (reason) {
    return (
      <PopupModal title={format(text.liveTitle, { title: current.game.title })}>
        <LiveInfo play={current} profiles={profiles.data} reason={reason} />
      </PopupModal>
    );
  }
  return (
    <PlayPad
      key={current.id}
      play={current}
      meeting={meeting.data}
      me={me}
      profiles={profiles.data}
      timeZone={club.data?.timezone ?? FALLBACK_TIMEZONE}
    />
  );
}

/** PAD-9: zamiast notesu „Trwa partia: {gra}” z graczami i powodem. */
function LiveInfo({
  play,
  profiles,
  reason,
}: {
  readonly play: PlayDetail;
  readonly profiles: ReadonlyMap<string, Profile>;
  readonly reason: string;
}) {
  const names = play.seats.flatMap((seat) => {
    const person = profiles.get(seat.profile_id);
    return person ? [fullName(person)] : [];
  });
  return (
    <div className="play-pad__info">
      {names.length > 0 ? (
        <p className="play-pad__players">{format(text.players, { names: names.join(', ') })}</p>
      ) : null}
      <Banner variant="info">{reason}</Banner>
    </div>
  );
}

/** Imiona graczy na miejscach notesu (indeks = miejsce − 1); wolne miejsca to `null`. */
function seatNames(play: PlayDetail, profiles: ReadonlyMap<string, Profile>): (string | null)[] {
  const names: (string | null)[] = Array.from({ length: play.scorepad.slots }, () => null);
  for (const seat of play.seats) {
    const person = profiles.get(seat.profile_id);
    names[seat.seat - 1] = person ? fullName(person) : t.meetings.plays.unknownPlayer;
  }
  return names;
}

function serverDraft(play: PlayDetail): ServerDraft {
  return {
    version: play.draft_version,
    sheet: isSheet(play.sheet) ? play.sheet : null,
    savedAt: play.draft_saved_at,
    savedBy: play.draft_saved_by,
  };
}

interface DraftRow {
  readonly sheet: unknown;
  readonly draft_version: number;
  readonly draft_saved_at: string | null;
  readonly draft_saved_by: string | null;
}

function fromDraftRow(row: DraftRow): ServerDraft {
  return {
    version: row.draft_version,
    sheet: isSheet(row.sheet) ? row.sheet : null,
    savedAt: row.draft_saved_at,
    savedBy: row.draft_saved_by,
  };
}

function PlayPad({
  play,
  meeting,
  me,
  profiles,
  timeZone,
}: {
  readonly play: PlayDetail;
  readonly meeting: Meeting;
  readonly me: OwnProfile;
  readonly profiles: ReadonlyMap<string, Profile>;
  readonly timeZone: string;
}) {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const { open } = usePopups();
  const names = useMemo(() => seatNames(play, profiles), [play, profiles]);
  const namesRef = useRef(names);
  const padRef = useRef<ScorePadHandle>(null);

  // Start notesu liczony raz, przy otwarciu: wpisy z bazy, niezapisana kopia z tego
  // urządzenia albo konflikt między nimi (wznowienie, PAD-4).
  const [start] = useState(() =>
    resolveDraftStart(readLocalDraft(draftStorage(), me.id, play.id), serverDraft(play)),
  );
  const [initial, setInitial] = useState<{
    sheet: ScorePadSheet;
    version: number;
    dirty: boolean;
  } | null>(() =>
    start.kind === 'conflict'
      ? null
      : {
          sheet: sheetWithPlayers(start.sheet, names),
          version: start.version,
          // Kopia z tego urządzenia albo kartka bez imion graczy w bazie: do zapisania.
          dirty: start.kind === 'local' || !start.sheet,
        },
  );
  // Konflikt przy otwarciu (kopia z tego urządzenia i nowszy szkic w bazie).
  const [startConflict, setStartConflict] = useState<ServerDraft | null>(() =>
    start.kind === 'conflict' ? start.server : null,
  );
  const [status, setStatus] = useState<DraftStatus>({
    state: 'saved',
    version: play.draft_version,
  });
  const saverRef = useRef<DraftSaver | null>(null);
  /** Ostatnie wpisy notesu (do zachowania przy konflikcie w trakcie wpisywania). */
  const lastSheet = useRef<ScorePadSheet | null>(initial?.sheet ?? null);

  useEffect(() => {
    namesRef.current = names;
  });

  // Zapis szkicu: jeden na otwarty notes; przy zamknięciu niezapisane wpisy idą od razu.
  useEffect(() => {
    if (!initial) return;
    const saver = new DraftSaver({
      profileId: me.id,
      playId: play.id,
      version: initial.version,
      sheet: initial.sheet,
      dirty: initial.dirty,
      save: (sheet, base) => saveDraft(client, play.id, sheet, base),
      storage: draftStorage(),
      onStatus: setStatus,
    });
    saverRef.current = saver;
    return () => {
      saver.dispose(true);
      saverRef.current = null;
      // Lista partii i kolejne otwarcie mają czytać szkic z bazy.
      void queryClient.invalidateQueries({ queryKey: playKey(play.id) });
    };
  }, [initial, client, me.id, play.id, queryClient]);

  // Konflikt w trakcie wpisywania: nowszy szkic z bazy (kto i kiedy go zapisał).
  const liveConflict = status.state === 'conflict';
  const latest = useQuery({
    queryKey: [...playKey(play.id), 'conflict', status.version],
    enabled: liveConflict,
    gcTime: 0,
    retry: false,
    queryFn: async (): Promise<ServerDraft | null> => {
      const { data, error } = await client
        .from('plays')
        .select('sheet, draft_version, draft_saved_at, draft_saved_by')
        .eq('id', play.id)
        .maybeSingle<DraftRow>();
      if (error) throw error;
      return data ? fromDraftRow(data) : null;
    },
  });
  const conflictServer = startConflict ?? (liveConflict ? (latest.data ?? null) : null);
  const showConflict = startConflict !== null || liveConflict;
  const conflictError = liveConflict && (latest.isError || latest.data === null);

  const template = useQuery({
    queryKey: versionTemplateKey(play.scorepad_version_id),
    staleTime: Infinity,
    // Zdjęcie ma kilka MB: po zamknięciu notesu nie trzymamy go w pamięci.
    gcTime: 0,
    queryFn: () =>
      loadVersionTemplate(client, play.scorepad_version_id, play.scorepad.name || play.game.title),
  });

  const config = useMemo<ScorePadFile | null>(
    // Notes powstaje raz z wpisami startowymi; dalsze wpisy żyją w nim samym.
    () => (template.data && initial ? padFile(template.data, initial.sheet) : null),
    [template.data, initial],
  );

  const resolve = (keep: 'server' | 'local') => {
    const server = conflictServer;
    if (!server) return;
    const local =
      startConflict && start.kind === 'conflict' ? start.local.sheet : lastSheet.current;
    const chosen = sheetWithPlayers(keep === 'server' ? server.sheet : local, names);
    lastSheet.current = chosen;
    if (startConflict) {
      // Konflikt przy otwarciu: notes powstaje dopiero teraz, z wybranymi wpisami.
      setStartConflict(null);
      setInitial({ sheet: chosen, version: server.version, dirty: keep === 'local' });
      return;
    }
    saverRef.current?.reset(server.version, chosen, keep === 'local');
    if (keep === 'server') padRef.current?.setSheet(chosen);
  };

  const savedBy = conflictServer?.savedBy ? profiles.get(conflictServer.savedBy) : undefined;
  const savedAt = conflictServer?.savedAt
    ? localDateTime(conflictServer.savedAt, timeZone).time
    : null;

  return (
    <PopupModal
      title={play.game.title}
      width={1120}
      className="play-pad"
      actions={
        <Button
          variant="secondary"
          size="sm"
          icon="trash"
          aria-label={format(text.discardLabel, { title: play.game.title })}
          onClick={() => {
            saverRef.current?.flush();
            open({ kind: 'discard-play', id: play.id });
          }}
        >
          {text.discard}
        </Button>
      }
    >
      <div className="play-pad__body">
        {showConflict ? (
          <section
            className="play-pad__conflict"
            role="alert"
            aria-labelledby={`${play.id}-conflict`}
          >
            <h3 id={`${play.id}-conflict`} className="play-pad__conflict-title">
              {text.conflict.title}
            </h3>
            <p>{text.conflict.text}</p>
            {savedAt ? (
              <p>
                {savedBy
                  ? format(text.conflict.by, { name: fullName(savedBy), time: savedAt })
                  : format(text.conflict.byUnknown, { time: savedAt })}
              </p>
            ) : null}
            {conflictError ? <Banner variant="error">{text.conflict.loadError}</Banner> : null}
            <p className="play-pad__note">{text.conflict.keepLocalNote}</p>
            <div className="play-pad__conflict-actions">
              {conflictError ? (
                <Button variant="secondary" onClick={() => void latest.refetch()}>
                  {text.conflict.retry}
                </Button>
              ) : null}
              <Button
                variant="secondary"
                disabled={!conflictServer}
                onClick={() => resolve('local')}
              >
                {text.conflict.keepLocal}
              </Button>
              <Button disabled={!conflictServer} onClick={() => resolve('server')}>
                {text.conflict.useServer}
              </Button>
            </div>
          </section>
        ) : null}
        {initial ? (
          <>
            <DraftStatusLine status={status} />
            {config ? (
              <ScorePadView
                ref={padRef}
                config={config}
                controls={false}
                tear={false}
                className="play-pad__pad"
                onChange={({ sheet }) => {
                  // Imiona graczy wynikają z miejsc partii (PAD-2), nie z klawiatury.
                  const next = sheetWithPlayers(sheet, namesRef.current);
                  lastSheet.current = next;
                  saverRef.current?.change(next);
                }}
              />
            ) : (
              <QueryStatus isError={template.isError} onRetry={() => void template.refetch()} />
            )}
            <p className="play-pad__note">{text.noTear}</p>
          </>
        ) : null}
        {meeting.status !== 'in_progress' ? (
          <Banner variant="warning">{text.notInProgress}</Banner>
        ) : null}
      </div>
    </PopupModal>
  );
}

/** Plik notesu v2 z szablonem wersji partii i wpisami kartki. */
function padFile(template: ScorePadTemplate, sheet: ScorePadSheet): ScorePadFile {
  return { format: 'score-pad', version: 2, template, active: template.id, sheet };
}

/** Stan zapisu szkicu nad notesem (ogłaszany czytnikom ekranu bez przerywania). */
function DraftStatusLine({ status }: { readonly status: DraftStatus }) {
  const labels = text.status;
  const message =
    status.state === 'saved'
      ? labels.saved
      : status.state === 'pending'
        ? labels.pending
        : status.state === 'saving'
          ? labels.saving
          : status.state === 'offline'
            ? status.reason === 'server'
              ? labels.server
              : labels.offline
            : status.state === 'conflict'
              ? labels.conflict
              : text.errors[status.reason ?? 'server'];
  const tone =
    status.state === 'failed'
      ? 'error'
      : status.state === 'offline' || status.state === 'conflict'
        ? 'warning'
        : 'ok';
  return (
    <div className="play-pad__status-row">
      <p className={cx('play-pad__status', `play-pad__status--${tone}`)} role="status">
        <span className="play-pad__dot" aria-hidden="true" />
        {message}
      </p>
      {status.localFailed ? <p className="play-pad__note">{labels.localFailed}</p> : null}
    </div>
  );
}
