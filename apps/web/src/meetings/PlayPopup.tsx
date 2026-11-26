import type {
  ScorePadFile,
  ScorePadSaveDetail,
  ScorePadSheet,
  ScorePadTemplate,
} from '@bg-club/score-pad';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/authContext';
import type { OwnProfile } from '../auth/useOwnProfile';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { useClub } from '../hub/club';
import { format, t } from '../i18n';
import { usePopups, type LeaveGuard } from '../popups/popupContext';
import { PopupModal } from '../popups/PopupModal';
import { QueryStatus } from '../popups/QueryStatus';
import { useLeaveGuard } from '../popups/useLeaveGuard';
import { useMounted } from '../popups/useMounted';
import { fullName, useAllProfiles, type Profile } from '../react-shared/profiles';
import { ScorePadView, type ScorePadHandle } from '../react-shared/ScorePadView';
import {
  discardSheetImage,
  finishSheetImage,
  SHEET_IMAGE_MAX_BYTES,
  SHEET_IMAGE_MAX_SIDE,
  uploadSheetImage,
  type PendingSheetImage,
} from '../sheets/sheetImages';
import { loadVersionTemplate, versionTemplateKey } from '../score-pad/scorepads';
import { Banner, Button, useToast } from '../ui';
import { cx } from '../ui/cx';
import { localDateTime } from './datetime';
import { meetingsKey, useMeeting, type Meeting } from './meetings';
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
import { pwa } from '../pwa/updates';
import { invalidatePlayData } from './playDelete';
import { isMeetingRunner, playKey, usePlay, type PlayDetail } from './plays';
import { PlaySaveError, playSummary, savePlay, type PlaySummary } from './playSave';
import { PlaySummaryDialog } from './PlaySummaryDialog';

const text = t.meetings.play;

/**
 * Partia w toku (PAD-4, PAD-8, PAD-9, RUN-3): notes 3D z szablonem wersji, z którą partia się
 * zaczęła, i graczami na ich miejscach. Wpisy zapisują się jako szkic w bazie (po 1,5 s)
 * i w `localStorage`, więc odświeżenie, awaria i utrata sieci ich nie gubią, a admin albo
 * prowadzący może dokończyć partię na innym urządzeniu. Nowszy szkic z innego urządzenia daje
 * konflikt do rozstrzygnięcia zamiast cichego nadpisania.
 *
 * Oderwanie karteczki kończy partię (PAD-5): podsumowanie z miejscami i punktami, po
 * potwierdzeniu zapis kartki i wyników w jednej transakcji (`save_play`), a „Wróć do kartki”
 * kładzie kartkę z powrotem na notes.
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
  const saved = play.data?.status === 'saved';
  useEffect(() => {
    if (gone || saved) removeLocalDrafts(draftStorage(), id);
  }, [gone, saved, id]);

  const title = play.data?.game.title ?? text.loading;
  if (gone || (play.data && meeting.isSuccess && !meeting.data)) {
    return (
      <PopupModal title={t.meetings.view.plays}>
        <p className="meeting-form__state">{text.gone}</p>
      </PopupModal>
    );
  }
  // Notes zaczyna od świeżego szkicu z bazy, nie z pamięci podręcznej (inne urządzenie
  // mogło go w międzyczasie zmienić, PAD-4).
  if (!play.data || !play.isFetchedAfterMount || !meeting.data || !profiles.data) {
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

/**
 * Imiona graczy na miejscach notesu (indeks = miejsce − 1); wolne miejsca to `null`. Zespół
 * (kilku graczy na miejscu) ma imiona z inicjałem nazwiska połączone „+”, żeby zmieściły się
 * w polu kartki.
 */
function seatNames(play: PlayDetail, profiles: ReadonlyMap<string, Profile>): (string | null)[] {
  const bySeat: Profile[][] = Array.from({ length: play.scorepad.slots }, () => []);
  const unknown = new Set<number>();
  for (const seat of play.seats) {
    const person = profiles.get(seat.profile_id);
    if (person) bySeat[seat.seat - 1]?.push(person);
    else unknown.add(seat.seat - 1);
  }
  return bySeat.map((people, i) => {
    if (people.length === 0) return unknown.has(i) ? t.meetings.plays.unknownPlayer : null;
    if (people.length === 1 && !unknown.has(i)) return fullName(people[0] as Profile);
    return people
      .map((p) => `${p.first_name} ${p.last_name.slice(0, 1)}.`.trim())
      .concat(unknown.has(i) ? [t.meetings.plays.unknownPlayer] : [])
      .join(' + ');
  });
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
  const toast = useToast();
  const mounted = useMounted();
  const { open, back } = usePopups();
  const padRef = useRef<ScorePadHandle>(null);
  const names = useMemo(() => seatNames(play, profiles), [play, profiles]);
  const namesRef = useRef(names);

  // Start notesu liczony raz, przy otwarciu: wpisy z bazy, niezapisana kopia z tego
  // urządzenia albo konflikt między nimi (wznowienie, PAD-4).
  const [start] = useState(() =>
    resolveDraftStart(readLocalDraft(draftStorage(), me.id, play.id), fromDraftRow(play)),
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
          // Niezapisana kopia z tego urządzenia idzie do bazy od razu. Pustej kartki nie
          // zapisujemy (imiona wynikają z miejsc partii), więc dwa urządzenia otwierające
          // nową partię nie wchodzą sobie w drogę.
          dirty: start.kind === 'local',
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

  // Zapis szkicu: jeden na otwarte wpisy startowe; przy zamknięciu niezapisane wpisy idą od
  // razu. Zamknięcie jest odroczone o jedno zadanie: ponowne zamontowanie (StrictMode) używa
  // tego samego zapisu zamiast wysyłać dwa zapisy od tej samej wersji (fałszywy konflikt).
  const saverFor = useRef<object | null>(null);
  const pendingClose = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!initial) return;
    if (pendingClose.current !== null) {
      clearTimeout(pendingClose.current);
      pendingClose.current = null;
    }
    let saver = saverRef.current;
    if (!saver || saverFor.current !== initial) {
      void saver?.dispose(true);
      saver = new DraftSaver({
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
      saverFor.current = initial;
    }
    const current = saver;
    return () => {
      pendingClose.current = setTimeout(() => {
        pendingClose.current = null;
        // Odświeżenie (nowa wersja) czeka, aż wpisy z zamknięcia trafią do bazy.
        void current.dispose(true).then(() => pwa.setDraft(play.id, false));
        if (saverRef.current === current) saverRef.current = null;
        // Lista partii i kolejne otwarcie mają czytać szkic z bazy.
        void queryClient.invalidateQueries({ queryKey: playKey(play.id) });
      }, 0);
    };
  }, [initial, client, me.id, play.id, queryClient]);

  // Aktualizacja aplikacji czeka, aż wpisy będą w bazie (NFR-3, PAD-4).
  // Po zamknięciu notesu blokadę zdejmuje dopiero koniec zapisu (`dispose` wyżej).
  useEffect(() => {
    pwa.setDraft(play.id, status.state !== 'saved' && status.state !== 'failed');
  }, [play.id, status.state]);

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
    setStartConflict(null);
    if (keep === 'local' && !startConflict) {
      // Notes ma już te wpisy: zapis od wersji z bazy (świadome nadpisanie).
      saverRef.current?.reset(server.version, chosen, true);
      return;
    }
    // Notes powstaje od nowa z wybranymi wpisami (także numerem kartki z bazy).
    setStatus({ state: keep === 'local' ? 'pending' : 'saved', version: server.version });
    setInitial({ sheet: chosen, version: server.version, dirty: keep === 'local' });
  };

  // Oderwana kartka czeka na decyzję (PAD-5): podsumowanie albo powrót na notes. Notes po
  // oderwaniu kładzie na wierzch czystą kartkę; jej wpisów nie zapisujemy jako szkicu.
  const tearing = useRef(false);
  const tornRef = useRef(false);
  const [torn, setTorn] = useState<{
    readonly sheet: ScorePadSheet;
    readonly summary: PlaySummary | null;
    readonly ranked: ScorePadSaveDetail['results'];
    /** Obraz karteczki wgrywany w tle, zanim użytkownik potwierdzi zapis (PAD-6). */
    readonly image: PendingSheetImage;
  } | null>(null);
  const [tearNotice, setTearNotice] = useState<'empty' | 'conflict' | 'restoreFailed' | null>(null);

  /** Kładzie kartkę z powrotem na notes; jej wpisy znów idą do szkicu. */
  const restore = useCallback((sheet: ScorePadSheet) => {
    lastSheet.current = sheet;
    if (padRef.current?.restoreSheet(sheet)) {
      tearing.current = false;
      return true;
    }
    // Notes nie położył kartki: wpisy czystej kartki nadal nie trafiają do szkicu, a szkic
    // z wpisami partii czeka w bazie i w kopii lokalnej na ponowne otwarcie notesu.
    setTearNotice('restoreFailed');
    return false;
  }, []);

  const onTear = () => {
    tearing.current = true;
    setTearNotice(null);
    const before = lastSheet.current ?? sheetWithPlayers(null, namesRef.current);
    // `scorepad:save` przychodzi w tym samym zadaniu co `scorepad:tear`; bez niego kartka była
    // pusta i wraca na notes.
    queueMicrotask(() => {
      if (!tearing.current || tornRef.current) return;
      if (restore(before)) setTearNotice('empty');
    });
  };
  const onSave = (detail: ScorePadSaveDetail) => {
    const sheet = sheetWithPlayers(detail.sheet, namesRef.current);
    if (showConflict) {
      // Nowszy szkic z innego urządzenia: najpierw decyzja, potem koniec partii.
      if (restore(sheet)) setTearNotice('conflict');
      return;
    }
    tornRef.current = true;
    saveFinal.reset();
    const summary = playSummary(play, sheet, detail.results);
    // Kartki bez wyniku nie da się zapisać, więc jej obrazu nie wysyłamy.
    const image: PendingSheetImage = summary
      ? detail
          .image({ maxSide: SHEET_IMAGE_MAX_SIDE, maxBytes: SHEET_IMAGE_MAX_BYTES })
          .catch(() => null)
          .then((blob) => uploadSheetImage(client, play, blob))
      : Promise.resolve(null);
    setTorn({ sheet, summary, image, ranked: detail.results });
  };

  const cancelTear = useCallback(() => {
    if (!torn) return;
    tornRef.current = false;
    setTorn(null);
    // Kartka wraca na notes: obraz z tego oderwania nie trafi do historii.
    void discardSheetImage(client, torn.image);
    restore(torn.sheet);
  }, [torn, restore, client]);

  // Wstecz, Esc i × przy otwartym podsumowaniu wracają do kartki zamiast zamykać notes.
  // W trakcie zapisu (i po nim) nic nie zamyka podsumowania: wynik zapisu zamknie notes albo
  // pokaże błąd w podsumowaniu.
  const savingRef = useRef(false);
  const tearGuard = useCallback<LeaveGuard>(() => {
    if (!savingRef.current) cancelTear();
  }, [cancelTear]);
  const { release } = useLeaveGuard(torn ? tearGuard : null);

  const saveFinal = useMutation({
    mutationFn: ({ summary }: { summary: PlaySummary; image: PendingSheetImage }) =>
      savePlay(client, play, summary),
    onMutate: () => {
      savingRef.current = true;
    },
    onError: () => {
      savingRef.current = false;
      void queryClient.invalidateQueries({ queryKey: playKey(play.id) });
    },
    onSuccess: (_saved, { image }) => {
      // Obraz karteczki dołączamy w tle: zapis wyników na niego nie czeka, a jego brak nie psuje
      // historii (PAD-6). Po dołączeniu lista partii pokazuje miniaturę.
      void finishSheetImage(client, play, image)
        .catch(() => null)
        .then(() => queryClient.invalidateQueries({ queryKey: meetingsKey }));
      // Partia zakończona: szkic i jego kopie lokalne nic już nie znaczą.
      void saverRef.current?.dispose(false);
      saverRef.current = null;
      removeLocalDrafts(draftStorage(), play.id);
      release();
      toast.show(format(t.meetings.toasts.playSaved, { title: play.game.title }), 'success');
      // Nowy wynik zmienia rankingi, statystyki i „ostatnio grane” (§5.6.5).
      void invalidatePlayData(queryClient);
      if (mounted.current) back();
    },
  });
  const saveFailure = saveFinal.error
    ? saveFinal.error instanceof PlaySaveError
      ? saveFinal.error.reason
      : 'server'
    : null;

  const savedBy = conflictServer?.savedBy ? profiles.get(conflictServer.savedBy) : undefined;
  const savedAt = conflictServer?.savedAt
    ? localDateTime(conflictServer.savedAt, timeZone).time
    : null;

  return (
    <>
      <PopupModal
        title={play.game.title}
        width={1120}
        className="play-pad"
        blocked={torn !== null}
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
              {tearNotice ? (
                <Banner variant="warning">
                  {tearNotice === 'empty'
                    ? text.emptySheet
                    : tearNotice === 'conflict'
                      ? text.tearConflict
                      : text.restoreFailed}
                </Banner>
              ) : null}
              {config ? (
                <ScorePadView
                  ref={padRef}
                  config={config}
                  controls={false}
                  summary={false}
                  className="play-pad__pad"
                  onTear={onTear}
                  onSave={onSave}
                  onChange={({ sheet }) => {
                    // Po oderwaniu na wierzchu jest czysta kartka: to nie są wpisy partii.
                    if (tearing.current) return;
                    // Imiona graczy wynikają z miejsc partii (PAD-2), nie z klawiatury.
                    const next = sheetWithPlayers(sheet, namesRef.current);
                    lastSheet.current = next;
                    saverRef.current?.change(next);
                  }}
                />
              ) : (
                <QueryStatus isError={template.isError} onRetry={() => void template.refetch()} />
              )}
              <div className="play-pad__footer">
                <p className="play-pad__note">{text.tearHint}</p>
                <Button
                  variant="secondary"
                  icon="tear-off"
                  disabled={!config || torn !== null}
                  aria-label={format(text.tearLabel, { title: play.game.title })}
                  onClick={() => padRef.current?.tear()}
                >
                  {text.tear}
                </Button>
              </div>
            </>
          ) : null}
          {meeting.status !== 'in_progress' ? (
            <Banner variant="warning">{text.notInProgress}</Banner>
          ) : null}
        </div>
      </PopupModal>
      {torn ? (
        <PlaySummaryDialog
          title={play.game.title}
          playId={play.id}
          startedAt={play.started_at}
          timeZone={timeZone}
          summary={torn.summary}
          profiles={profiles}
          saving={saveFinal.isPending || saveFinal.isSuccess}
          failure={saveFailure}
          onCancel={cancelTear}
          manual={
            template.data ? { template: template.data, ranked: torn.ranked, play } : undefined
          }
          onConfirm={(summary) => {
            saveFinal.mutate({ summary, image: torn.image });
          }}
        />
      ) : null}
    </>
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
