/** @jsxImportSource @solidjs/web */
import type {
  ScorePadFile,
  ScorePadSaveDetail,
  ScorePadSheet,
  ScorePadTemplate,
} from '@bg-club/score-pad';
import { createEffect, createMemo, createSignal, Match, Show, Switch, useContext } from 'solid-js';
import type { OwnProfile } from '../auth/useOwnProfile';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { format, t } from '../i18n';
import type { LeaveGuard } from '../popups/popupContext';
import { fullName, type Profile } from '../profile/profileQueries';
import { pwa } from '../pwa/updates';
import { loadVersionTemplate, versionTemplateKey } from '../score-pad/scorepads';
import { ScorePadView, type ScorePadHandle } from '../score-pad/ScorePadView';
import {
  discardSheetImage,
  finishSheetImage,
  SHEET_IMAGE_MAX_BYTES,
  SHEET_IMAGE_MAX_SIDE,
  uploadSheetImage,
  type PendingSheetImage,
} from '../sheets/sheetImages';
import { createClub } from '../solid/club';
import { AuthContext, PopupsContext, QueryClientContext, ToastContext } from '../solid/context';
import { createLeaveGuard, createMounted } from '../solid/popups/leaveGuard';
import { PopupModal } from '../solid/popups/PopupModal';
import { QueryStatus } from '../solid/popups/QueryStatus';
import { createAllProfiles } from '../solid/profile/profiles';
import { createMutation, createQuery } from '../solid/query';
import { Banner, Button } from '../solid/ui';
import { localDateTime } from './datetime';
import { createMeeting, createPlay } from './meetingData';
import { meetingsKey } from './meetings';
import {
  DraftSaver,
  draftStorage,
  isSheet,
  readLocalDraft,
  removeLocalDrafts,
  resolveDraftStart,
  saveDraft,
  sheetWithPlayers,
  type DraftStart,
  type DraftStatus,
  type ServerDraft,
} from './playDraft';
import { invalidatePlayData } from './playDelete';
import { isMeetingRunner, playKey, type PlayDetail } from './plays';
import { PlaySaveError, playSummary, savePlay, type PlaySummary } from './playSave';
import { PlaySummaryDialog } from './PlaySummaryDialog';

const text = t.meetings.play;

/** Oderwana kartka czekająca na decyzję (PAD-5): podsumowanie albo powrót na notes. */
interface TornSheet {
  readonly sheet: ScorePadSheet;
  readonly summary: PlaySummary | null;
  readonly ranked: ScorePadSaveDetail['results'];
  /** Obraz karteczki wgrywany w tle, zanim użytkownik potwierdzi zapis (PAD-6). */
  readonly image: PendingSheetImage;
}

/** Start notesu z chwili otwarcia (wznowienie, PAD-4). */
interface Opened {
  readonly start: DraftStart;
  /** Wpisy startowe z imionami graczy; `null` przy konflikcie. */
  readonly sheet: ScorePadSheet | null;
  readonly version: number;
}

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
 * Jedno okno na wczytywanie, notes, „Trwa partia” i „Partii nie ma”: fokus ustawiony przez
 * `PopupHost` zostaje na oknie po wczytaniu. Stan notesu powstaje przy pierwszym wejściu
 * w notes, a zapis szkicu działa tylko, dopóki notes jest pokazany.
 */
export function PlayPopup(props: { readonly id: string; readonly me: OwnProfile }) {
  const auth = useContext(AuthContext);
  const queryClient = useContext(QueryClientContext);
  const toast = useContext(ToastContext);
  const popups = useContext(PopupsContext);
  const mounted = createMounted();
  const play = createPlay(() => props.id);
  const meeting = createMeeting(() => play().data?.meeting_id ?? '');
  const profiles = createAllProfiles();
  const club = createClub();

  const current = createMemo(() => play().data ?? undefined);
  const meetingData = createMemo(() => meeting().data ?? undefined);
  const profileMap = createMemo(() => profiles().data);
  const timeZone = () => club().data?.timezone ?? FALLBACK_TIMEZONE;
  const meId = createMemo(() => props.me.id);
  const playId = createMemo(() => props.id);

  // Partii nie ma (porzucona, zły link): kopie szkicu na tym urządzeniu nic już nie znaczą.
  const gone = () => play().isSuccess && play().data === null;
  createEffect(
    () => (gone() || current()?.status === 'saved' ? playId() : null),
    (id) => {
      if (id !== null) removeLocalDrafts(draftStorage(), id);
    },
  );

  const view = createMemo<'gone' | 'loading' | 'live' | 'pad'>(() => {
    if (gone() || (current() && meeting().isSuccess && !meetingData())) return 'gone';
    // Notes zaczyna od świeżego szkicu z bazy, nie z pamięci podręcznej (inne urządzenie
    // mogło go w międzyczasie zmienić, PAD-4).
    if (!current() || !play().isFetchedAfterMount || !meetingData() || !profileMap()) {
      return 'loading';
    }
    return reason() ? 'live' : 'pad';
  });
  const reason = () => {
    const shown = current();
    const found = meetingData();
    if (!shown || !found) return null;
    return shown.status === 'saved'
      ? text.saved
      : !isMeetingRunner(found, props.me)
        ? text.notRunner
        : found.status !== 'in_progress'
          ? text.notInProgress
          : null;
  };
  const active = createMemo(() => view() === 'pad');
  const title = () => current()?.game.title ?? text.loading;

  const names = createMemo(() => {
    const shown = current();
    const map = profileMap();
    return shown && map ? seatNames(shown, map) : [];
  });

  // Start notesu liczony raz, przy pierwszym wejściu w notes: wpisy z bazy, niezapisana kopia
  // z tego urządzenia albo konflikt między nimi (wznowienie, PAD-4).
  let first: Opened | undefined;
  const opened = createMemo(() => {
    if (first || !active()) return first;
    const shown = current();
    if (!shown) return undefined;
    const start = resolveDraftStart(
      readLocalDraft(draftStorage(), meId(), shown.id),
      fromDraftRow(shown),
    );
    return (first = {
      start,
      sheet: start.kind === 'conflict' ? null : sheetWithPlayers(start.sheet, names()),
      version: shown.draft_version,
    });
  });
  const [initial, setInitial] = createSignal<{
    sheet: ScorePadSheet;
    version: number;
    dirty: boolean;
  } | null>(() => {
    const start = opened()?.start;
    const sheet = opened()?.sheet;
    return start && sheet && start.kind !== 'conflict'
      ? {
          sheet,
          version: start.version,
          // Niezapisana kopia z tego urządzenia idzie do bazy od razu. Pustej kartki nie
          // zapisujemy (imiona wynikają z miejsc partii), więc dwa urządzenia otwierające
          // nową partię nie wchodzą sobie w drogę.
          dirty: start.kind === 'local',
        }
      : null;
  });
  // Konflikt przy otwarciu (kopia z tego urządzenia i nowszy szkic w bazie).
  const [startConflict, setStartConflict] = createSignal<ServerDraft | null>(() => {
    const start = opened()?.start;
    return start?.kind === 'conflict' ? start.server : null;
  });
  const [status, setStatus] = createSignal<DraftStatus>((): DraftStatus => ({
    state: 'saved',
    version: opened()?.version ?? 0,
  }));
  let saver: DraftSaver | null = null;
  /** Ostatnie wpisy notesu (do zachowania przy konflikcie w trakcie wpisywania). */
  let lastSheet: ScorePadSheet | null = null;
  let pad: ScorePadHandle | undefined;

  // Zapis szkicu: jeden na wpisy startowe, tylko gdy notes jest pokazany. Przy zamknięciu
  // notesu niezapisane wpisy idą od razu; nowe wpisy startowe (rozstrzygnięty konflikt)
  // zastępują zapis bez zdejmowania blokady aktualizacji.
  let generation = 0;
  createEffect(
    () => (active() ? { start: initial(), playId: playId(), meId: meId() } : null),
    (input) => {
      const start = input?.start;
      if (!input || !start) return;
      const gen = ++generation;
      lastSheet = start.sheet;
      const id = input.playId;
      const next = new DraftSaver({
        profileId: input.meId,
        playId: id,
        version: start.version,
        sheet: start.sheet,
        dirty: start.dirty,
        save: (sheet, base) => saveDraft(auth.client, id, sheet, base),
        storage: draftStorage(),
        onStatus: setStatus,
      });
      saver = next;
      return () => {
        if (saver === next) saver = null;
        const closing = next.dispose(true);
        queueMicrotask(() => {
          if (gen !== generation) return;
          // Notes zamknięty. Odświeżenie (nowa wersja) czeka, aż wpisy z zamknięcia trafią do bazy.
          void closing.then(() => pwa.setDraft(id, false));
          // Lista partii i kolejne otwarcie mają czytać szkic z bazy.
          void queryClient.invalidateQueries({ queryKey: playKey(id) });
        });
      };
    },
  );

  // Aktualizacja aplikacji czeka, aż wpisy będą w bazie (NFR-3, PAD-4).
  // Po zamknięciu notesu blokadę zdejmuje dopiero koniec zapisu (efekt wyżej).
  createEffect(
    () => (active() ? { id: playId(), state: status().state } : null),
    (input) => {
      if (input) pwa.setDraft(input.id, input.state !== 'saved' && input.state !== 'failed');
    },
  );

  // Konflikt w trakcie wpisywania: nowszy szkic z bazy (kto i kiedy go zapisał).
  const liveConflict = () => status().state === 'conflict';
  const latest = createQuery(() => {
    return {
      queryKey: [...playKey(playId()), 'conflict', status().version],
      enabled: active() && liveConflict(),
      gcTime: 0,
      retry: false,
      queryFn: async (): Promise<ServerDraft | null> => {
        const { data, error } = await auth.client
          .from('plays')
          .select('sheet, draft_version, draft_saved_at, draft_saved_by')
          .eq('id', playId())
          .maybeSingle<DraftRow>();
        if (error) throw error;
        return data ? fromDraftRow(data) : null;
      },
    };
  });
  const conflictServer = () => startConflict() ?? (liveConflict() ? (latest().data ?? null) : null);
  const showConflict = () => startConflict() !== null || liveConflict();
  const conflictError = () => liveConflict() && (latest().isError || latest().data === null);

  const template = createQuery(() => {
    const shown = active() ? current() : undefined;
    const versionId = shown?.scorepad_version_id ?? '';
    const name = shown ? shown.scorepad.name || shown.game.title : '';
    return {
      queryKey: versionTemplateKey(versionId),
      enabled: versionId !== '',
      staleTime: Infinity,
      // Zdjęcie ma kilka MB: po zamknięciu notesu nie trzymamy go w pamięci.
      gcTime: 0,
      queryFn: () => loadVersionTemplate(auth.client, versionId, name),
    };
  });
  const templateData = createMemo(() => template().data);

  // Notes powstaje raz z wpisami startowymi; dalsze wpisy żyją w nim samym.
  const config = createMemo<ScorePadFile | null>(() => {
    const loaded = templateData();
    const start = initial();
    return loaded && start ? padFile(loaded, start.sheet) : null;
  });

  const resolve = (keep: 'server' | 'local') => {
    const server = conflictServer();
    if (!server) return;
    const atStart = startConflict();
    const start = opened()?.start;
    const local = atStart && start?.kind === 'conflict' ? start.local.sheet : lastSheet;
    const chosen = sheetWithPlayers(keep === 'server' ? server.sheet : local, names());
    lastSheet = chosen;
    setStartConflict(null);
    if (keep === 'local' && !atStart) {
      // Notes ma już te wpisy: zapis od wersji z bazy (świadome nadpisanie).
      saver?.reset(server.version, chosen, true);
      return;
    }
    // Notes powstaje od nowa z wybranymi wpisami (także numerem kartki z bazy).
    setStatus({ state: keep === 'local' ? 'pending' : 'saved', version: server.version });
    setInitial({ sheet: chosen, version: server.version, dirty: keep === 'local' });
  };

  // Oderwana kartka czeka na decyzję (PAD-5): podsumowanie albo powrót na notes. Notes po
  // oderwaniu kładzie na wierzch czystą kartkę; jej wpisów nie zapisujemy jako szkicu.
  let tearing = false;
  let tornNow = false;
  const [torn, setTorn] = createSignal<TornSheet | null>(null);
  const [tearNotice, setTearNotice] = createSignal<'empty' | 'conflict' | 'restoreFailed' | null>(
    null,
  );
  // Notes zamknięty (np. partię zapisano gdzie indziej): oderwanej kartki już nie pokazujemy.
  createEffect(active, (shown) => {
    if (!shown) {
      tornNow = false;
      setTorn(null);
    }
  });

  /** Kładzie kartkę z powrotem na notes; jej wpisy znów idą do szkicu. */
  const restore = (sheet: ScorePadSheet) => {
    lastSheet = sheet;
    if (pad?.restoreSheet(sheet)) {
      tearing = false;
      return true;
    }
    // Notes nie położył kartki: wpisy czystej kartki nadal nie trafiają do szkicu, a szkic
    // z wpisami partii czeka w bazie i w kopii lokalnej na ponowne otwarcie notesu.
    setTearNotice('restoreFailed');
    return false;
  };

  const onTear = () => {
    tearing = true;
    setTearNotice(null);
    const before = lastSheet ?? sheetWithPlayers(null, names());
    // `scorepad:save` przychodzi w tym samym zadaniu co `scorepad:tear`; bez niego kartka była
    // pusta i wraca na notes.
    queueMicrotask(() => {
      if (!tearing || tornNow) return;
      if (restore(before)) setTearNotice('empty');
    });
  };
  const onSave = (detail: ScorePadSaveDetail) => {
    const shown = current();
    if (!shown) return;
    const sheet = sheetWithPlayers(detail.sheet, names());
    if (showConflict()) {
      // Nowszy szkic z innego urządzenia: najpierw decyzja, potem koniec partii.
      if (restore(sheet)) setTearNotice('conflict');
      return;
    }
    tornNow = true;
    saveFinal.reset();
    const summary = playSummary(shown, sheet, detail.results);
    // Kartki bez wyniku nie da się zapisać, więc jej obrazu nie wysyłamy.
    const image: PendingSheetImage = summary
      ? detail
          .image({ maxSide: SHEET_IMAGE_MAX_SIDE, maxBytes: SHEET_IMAGE_MAX_BYTES })
          .catch(() => null)
          .then((blob) => uploadSheetImage(auth.client, shown, blob))
      : Promise.resolve(null);
    setTorn({ sheet, summary, image, ranked: detail.results });
  };

  const cancelTear = () => {
    const shown = torn();
    if (!shown) return;
    tornNow = false;
    setTorn(null);
    // Kartka wraca na notes: obraz z tego oderwania nie trafi do historii.
    void discardSheetImage(auth.client, shown.image);
    restore(shown.sheet);
  };

  // Wstecz, Esc i × przy otwartym podsumowaniu wracają do kartki zamiast zamykać notes.
  // W trakcie zapisu (i po nim) nic nie zamyka podsumowania: wynik zapisu zamknie notes albo
  // pokaże błąd w podsumowaniu.
  let saving = false;
  const tearGuard: LeaveGuard = () => {
    if (!saving) cancelTear();
  };
  const { release } = createLeaveGuard(() => (active() && torn() ? tearGuard : null));

  const saveFinal = createMutation({
    mutationFn: (input: {
      readonly play: PlayDetail;
      readonly summary: PlaySummary;
      readonly image: PendingSheetImage;
    }) => savePlay(auth.client, input.play, input.summary),
    onMutate: () => {
      saving = true;
    },
    onError: (_error, input) => {
      saving = false;
      void queryClient.invalidateQueries({ queryKey: playKey(input.play.id) });
    },
    onSuccess: (_saved, input) => {
      // Obraz karteczki dołączamy w tle: zapis wyników na niego nie czeka, a jego brak nie psuje
      // historii (PAD-6). Po dołączeniu lista partii pokazuje miniaturę.
      void finishSheetImage(auth.client, input.play, input.image)
        .catch(() => null)
        .then(() => queryClient.invalidateQueries({ queryKey: meetingsKey }));
      // Partia zakończona: szkic i jego kopie lokalne nic już nie znaczą.
      void saver?.dispose(false);
      saver = null;
      removeLocalDrafts(draftStorage(), input.play.id);
      release();
      toast.show(format(t.meetings.toasts.playSaved, { title: input.play.game.title }), 'success');
      // Nowy wynik zmienia rankingi, statystyki i „ostatnio grane” (§5.6.5).
      void invalidatePlayData(queryClient);
      if (mounted()) popups.back();
    },
  });
  const saveFailure = () => {
    const error = saveFinal.state().error;
    return error ? (error instanceof PlaySaveError ? error.reason : 'server') : null;
  };

  const savedBy = () => {
    const by = conflictServer()?.savedBy;
    return by ? profileMap()?.get(by) : undefined;
  };
  const savedAt = () => {
    const at = conflictServer()?.savedAt;
    return at ? localDateTime(at, timeZone()).time : null;
  };

  const modalTitle = () => {
    const shown = current();
    switch (view()) {
      case 'gone':
        return t.meetings.view.plays;
      case 'loading':
        return title();
      case 'live':
        return format(text.liveTitle, { title: shown?.game.title ?? '' });
      case 'pad':
        return shown?.game.title ?? '';
    }
  };

  return (
    <>
      <PopupModal
        title={modalTitle()}
        width={active() ? 1120 : undefined}
        class={active() ? 'play-pad' : undefined}
        blocked={active() && torn() !== null}
        actions={
          <Show when={active()}>
            <Button
              variant="secondary"
              size="sm"
              icon="trash"
              aria-label={format(text.discardLabel, { title: title() })}
              onClick={() => {
                saver?.flush();
                popups.open({ kind: 'discard-play', id: props.id });
              }}
            >
              {text.discard}
            </Button>
          </Show>
        }
      >
        <Switch>
          <Match when={view() === 'gone'}>
            <p class="meeting-form__state">{text.gone}</p>
          </Match>
          <Match when={view() === 'loading'}>
            <QueryStatus
              isError={play().isError || meeting().isError || profiles().isError}
              onRetry={() => {
                if (play().isError) void play().refetch();
                if (meeting().isError) void meeting().refetch();
                if (profiles().isError) void profiles().refetch();
              }}
            />
          </Match>
          <Match when={view() === 'live'}>
            <LiveInfo
              play={current() as PlayDetail}
              profiles={profileMap() ?? new Map()}
              reason={reason() ?? ''}
            />
          </Match>
          <Match when={view() === 'pad'}>
            <div class="play-pad__body">
              <Show when={showConflict()}>
                <section
                  class="play-pad__conflict"
                  role="alert"
                  aria-labelledby={`${props.id}-conflict`}
                >
                  <h3 id={`${props.id}-conflict`} class="play-pad__conflict-title">
                    {text.conflict.title}
                  </h3>
                  <p>{text.conflict.text}</p>
                  <Show when={savedAt()}>
                    {(at) => (
                      <p>
                        {(() => {
                          const by = savedBy();
                          return by
                            ? format(text.conflict.by, { name: fullName(by), time: at() })
                            : format(text.conflict.byUnknown, { time: at() });
                        })()}
                      </p>
                    )}
                  </Show>
                  <Show when={conflictError()}>
                    <Banner variant="error">{text.conflict.loadError}</Banner>
                  </Show>
                  <p class="play-pad__note">{text.conflict.keepLocalNote}</p>
                  <div class="play-pad__conflict-actions">
                    <Show when={conflictError()}>
                      <Button variant="secondary" onClick={() => void latest().refetch()}>
                        {text.conflict.retry}
                      </Button>
                    </Show>
                    <Button
                      variant="secondary"
                      disabled={!conflictServer()}
                      onClick={() => resolve('local')}
                    >
                      {text.conflict.keepLocal}
                    </Button>
                    <Button disabled={!conflictServer()} onClick={() => resolve('server')}>
                      {text.conflict.useServer}
                    </Button>
                  </div>
                </section>
              </Show>
              <Show when={initial()}>
                <DraftStatusLine status={status()} />
                <Show when={tearNotice()}>
                  {(notice) => (
                    <Banner variant="warning">
                      {notice() === 'empty'
                        ? text.emptySheet
                        : notice() === 'conflict'
                          ? text.tearConflict
                          : text.restoreFailed}
                    </Banner>
                  )}
                </Show>
                <Show
                  when={config()}
                  fallback={
                    <QueryStatus
                      isError={template().isError}
                      onRetry={() => void template().refetch()}
                    />
                  }
                >
                  {(file) => (
                    <ScorePadView
                      ref={(handle) => (pad = handle)}
                      config={file()}
                      controls={false}
                      summary={false}
                      class="play-pad__pad"
                      onTear={onTear}
                      onSave={onSave}
                      onChange={({ sheet }) => {
                        // Po oderwaniu na wierzchu jest czysta kartka: to nie są wpisy partii.
                        if (tearing) return;
                        // Imiona graczy wynikają z miejsc partii (PAD-2), nie z klawiatury.
                        const next = sheetWithPlayers(sheet, names());
                        lastSheet = next;
                        saver?.change(next);
                      }}
                    />
                  )}
                </Show>
                <div class="play-pad__footer">
                  <p class="play-pad__note">{text.tearHint}</p>
                  <Button
                    variant="secondary"
                    icon="tear-off"
                    disabled={!config() || torn() !== null}
                    aria-label={format(text.tearLabel, { title: title() })}
                    onClick={() => pad?.tear()}
                  >
                    {text.tear}
                  </Button>
                </div>
              </Show>
              <Show when={meetingData()?.status !== 'in_progress'}>
                <Banner variant="warning">{text.notInProgress}</Banner>
              </Show>
            </div>
          </Match>
        </Switch>
      </PopupModal>
      <Show when={active() ? torn() : null} keyed>
        {(shown) => (
          <PlaySummaryDialog
            title={title()}
            playId={props.id}
            startedAt={current()?.started_at ?? ''}
            timeZone={timeZone()}
            summary={shown.summary}
            profiles={profileMap() ?? new Map()}
            saving={saveFinal.state().isPending || saveFinal.state().isSuccess}
            failure={saveFailure()}
            onCancel={cancelTear}
            manual={(() => {
              const loaded = templateData();
              const seats = current();
              return loaded && seats
                ? { template: loaded, ranked: shown.ranked, play: seats }
                : undefined;
            })()}
            onConfirm={(summary) => {
              const seats = current();
              if (seats) saveFinal.mutate({ play: seats, summary, image: shown.image });
            }}
          />
        )}
      </Show>
    </>
  );
}

/** PAD-9: zamiast notesu „Trwa partia: {gra}” z graczami i powodem. */
function LiveInfo(props: {
  readonly play: PlayDetail;
  readonly profiles: ReadonlyMap<string, Profile>;
  readonly reason: string;
}) {
  const names = () =>
    props.play.seats.flatMap((seat) => {
      const person = props.profiles.get(seat.profile_id);
      return person ? [fullName(person)] : [];
    });
  return (
    <div class="play-pad__info">
      <Show when={names().length > 0}>
        <p class="play-pad__players">{format(text.players, { names: names().join(', ') })}</p>
      </Show>
      <Banner variant="info">{props.reason}</Banner>
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

/** Plik notesu v2 z szablonem wersji partii i wpisami kartki. */
function padFile(template: ScorePadTemplate, sheet: ScorePadSheet): ScorePadFile {
  return { format: 'score-pad', version: 2, template, active: template.id, sheet };
}

/** Stan zapisu szkicu nad notesem (ogłaszany czytnikom ekranu bez przerywania). */
function DraftStatusLine(props: { readonly status: DraftStatus }) {
  const labels = text.status;
  const message = () => {
    const status = props.status;
    return status.state === 'saved'
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
  };
  const tone = () => {
    const state = props.status.state;
    return state === 'failed'
      ? 'error'
      : state === 'offline' || state === 'conflict'
        ? 'warning'
        : 'ok';
  };
  return (
    <div class="play-pad__status-row">
      <p class={['play-pad__status', `play-pad__status--${tone()}`]} role="status">
        <span class="play-pad__dot" aria-hidden="true" />
        {message()}
      </p>
      <Show when={props.status.localFailed}>
        <p class="play-pad__note">{labels.localFailed}</p>
      </Show>
    </div>
  );
}
