import { createMemo, createSignal, For, onSettled, Show, type Accessor } from 'solid-js';
import { format, formatNumber, plural, t } from '../i18n';
import { fullName, type Profile } from '../profile/profileQueries';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import { ProfileLink } from '../profile/ProfileLink';
import { Badge, type AvatarSize } from '../ui';
import { ariaTrue } from '../ui/dom';
import {
  leaderboardLayout,
  widgetRows,
  type LeaderboardEntry,
  type LeaderboardKind,
  type PodiumStep,
} from './leaderboard';
import './leaderboard.css';

/** Ile awatarów remisującego stopnia widać w widżecie; resztę skrót „i N więcej”. */
const WIDGET_TIED_AVATARS = 3;

const DESKTOP = '(min-width: 768px)';

/** Szerokość od 768 px: większe awatary podium (104 i 80; na telefonie 80 i 64). */
function createDesktop(): Accessor<boolean> {
  const query = typeof window.matchMedia === 'function' ? window.matchMedia(DESKTOP) : undefined;
  const [desktop, setDesktop] = createSignal(query?.matches ?? false);
  onSettled(() => {
    if (!query) return;
    const onChange = () => setDesktop(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  });
  return desktop;
}

/** Profil do awatara: hook z listy profili (kolor monogramu), reszta z wiersza rankingu. */
function avatarProfile(entry: LeaderboardEntry, profiles: ReadonlyMap<string, Profile>) {
  return {
    hook: profiles.get(entry.profile_id)?.hook ?? entry.profile_id,
    first_name: entry.first_name,
    last_name: entry.last_name,
    avatar_path: entry.avatar_path,
    deleted_at: entry.deleted ? (profiles.get(entry.profile_id)?.deleted_at ?? 'deleted') : null,
  };
}

function Score(props: { readonly kind: LeaderboardKind; readonly value: number }) {
  // Formy jednostki nie zawierają `{n}`: liczba stoi osobno, większą czcionką.
  return (
    <span class="score leaderboard__score">
      {formatNumber(props.value)}
      <span class="score__unit">{plural(props.value, t.leaderboard.units[props.kind])}</span>
    </span>
  );
}

interface BoardProps {
  readonly entries: readonly LeaderboardEntry[];
  readonly kind: LeaderboardKind;
  readonly meId: string;
  readonly profiles: ReadonlyMap<string, Profile>;
  /** Widżet: miejsca 4–7 (+ własny wiersz) i skrócone remisy; popup: pełna lista. */
  readonly variant: 'widget' | 'popup';
}

/**
 * Wspólny układ rankingu widżetu i popupu: podium z awatarami w ringu,
 * odznaką miejsca i koroną, a pod nim taca z kolejnymi miejscami. Remisujący stoją razem
 * jednym stopniu, usunięci są wyszarzeni na końcu listy, bieżący użytkownik ma
 * wiersz akcentu i odznakę „Ty”. Każdy awatar prowadzi do profilu.
 */
export function LeaderboardBoard(props: BoardProps) {
  const desktop = createDesktop();
  const layout = createMemo(() => {
    const { steps, rows } = leaderboardLayout(props.entries);
    const { shown, own } =
      props.variant === 'widget' ? widgetRows(rows, props.meId) : { shown: rows, own: undefined };
    return { steps, own, listed: own ? [...shown, own] : shown };
  });

  return (
    <div class={['leaderboard', `leaderboard--${props.variant}`]}>
      <Show when={layout().steps.length > 0}>
        <ol class="podium" aria-label={t.leaderboard.podiumLabel}>
          <For each={layout().steps} keyed={(step) => step.place}>
            {(step, index) => (
              <PodiumColumn
                step={step()}
                first={index() === 0}
                kind={props.kind}
                meId={props.meId}
                profiles={props.profiles}
                desktop={desktop()}
                limit={props.variant === 'widget' ? WIDGET_TIED_AVATARS : undefined}
              />
            )}
          </For>
        </ol>
      </Show>
      <Show when={layout().listed.length > 0}>
        <ul class="tray leaderboard__list" aria-label={t.leaderboard.listLabel}>
          <For each={layout().listed} keyed={(entry) => entry.profile_id}>
            {(entry) => (
              <LeaderboardRow
                entry={entry()}
                kind={props.kind}
                me={entry().profile_id === props.meId}
                separated={entry() === layout().own}
                profiles={props.profiles}
              />
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}

function PodiumColumn(props: {
  readonly step: PodiumStep;
  readonly first: boolean;
  readonly kind: LeaderboardKind;
  readonly meId: string;
  readonly profiles: ReadonlyMap<string, Profile>;
  readonly desktop: boolean;
  readonly limit: number | undefined;
}) {
  const view = createMemo(() => {
    const entries = props.step.entries;
    const tied = entries.length > 1;
    // Pojedyncza osoba: (104 i 80, na telefonie 80 i 64); remis: mniejsze, żeby się zmieściły.
    const size: AvatarSize = tied
      ? props.first && props.desktop
        ? 56
        : 40
      : props.first
        ? props.desktop
          ? 104
          : 80
        : props.desktop
          ? 80
          : 64;
    const visible = props.limit === undefined ? entries : entries.slice(0, props.limit);
    const hidden = entries.slice(visible.length);
    const names = entries.map((entry) => entry.first_name);
    const shownNames = visible.map((entry) => entry.first_name);
    return {
      tied,
      size,
      visible,
      hidden,
      value: entries[0]?.value ?? 0,
      mine: entries.some((entry) => entry.profile_id === props.meId),
      fullNames: entries.map(fullName).join(', '),
      caption:
        hidden.length > 0
          ? `${shownNames.join(', ')} ${format(t.leaderboard.more, { n: hidden.length })}`
          : names.join(', '),
    };
  });

  return (
    <li
      class={[
        'podium__step',
        // Stopień według miejsca, nie pozycji: przy remisie 1, 1, 3 trzeci stoi na 3. stopniu.
        `podium__step--${props.step.place}`,
        { 'podium__step--tied': view().tied, 'podium__step--mine': view().mine },
      ]}
    >
      <span class="sr-only">
        {format(t.leaderboard.place, { place: props.step.place })}
        {view().tied ? `, ${plural(props.step.entries.length, t.leaderboard.tied)}` : null}:{' '}
        {view().fullNames}
      </span>
      <div class="podium__people">
        <Show when={props.first}>
          <svg class="podium__crown" viewBox="0 0 36 26" aria-hidden="true">
            <path d="M2 8L10 15L18 2L26 15L34 8L31 24H5L2 8Z" />
          </svg>
        </Show>
        <ul class="podium__avatars">
          <For each={view().visible} keyed={(entry) => entry.profile_id}>
            {(entry) => (
              <li class="podium__avatar">
                <ProfileLink id={entry().profile_id} name={fullName(entry())}>
                  <ProfileAvatar
                    profile={avatarProfile(entry(), props.profiles)}
                    size={view().size}
                    ring="accent"
                    decorative
                  />
                </ProfileLink>
              </li>
            )}
          </For>
          <Show when={view().hidden.length > 0}>
            <li
              class="podium__more tnum"
              aria-label={format(t.leaderboard.moreLabel, {
                names: view().hidden.map(fullName).join(', '),
              })}
            >
              +{view().hidden.length}
            </li>
          </Show>
        </ul>
        <span class="podium__badge tnum" aria-hidden="true">
          {props.step.place}
        </span>
      </div>
      <div class="podium__block" aria-hidden="true">
        <span class="podium__name" title={view().fullNames}>
          {view().caption}
        </span>
        <Show when={view().mine}>
          <Badge tone="accent">{t.ui.youBadge}</Badge>
        </Show>
        <span class="podium__value">
          <Score kind={props.kind} value={view().value} />
        </span>
      </div>
    </li>
  );
}

function LeaderboardRow(props: {
  readonly entry: LeaderboardEntry;
  readonly kind: LeaderboardKind;
  readonly me: boolean;
  readonly separated: boolean;
  readonly profiles: ReadonlyMap<string, Profile>;
}) {
  const name = () => fullName(props.entry);
  return (
    <li class={['tray__item', { leaderboard__own: props.separated }]}>
      <div
        class={[
          'row row--54 leaderboard__row',
          { 'row--highlighted': props.me, 'row--muted': props.entry.deleted },
        ]}
      >
        <span class="rank" aria-hidden={ariaTrue(props.entry.deleted)}>
          {props.entry.deleted ? '–' : props.entry.place}
        </span>
        <ProfileLink id={props.entry.profile_id} name={name()} class="leaderboard__avatar">
          <ProfileAvatar
            profile={avatarProfile(props.entry, props.profiles)}
            size={36}
            ring={props.me ? 'white' : undefined}
            decorative
          />
        </ProfileLink>
        <span class="row__text">
          <span class="row__title leaderboard__name">
            <span class="leaderboard__name-text" title={name()}>
              {props.entry.deleted ? `${name()} ${t.ui.removedSuffix}` : name()}
            </span>
            <Show when={props.me}>
              <Badge onAccent>{t.ui.youBadge}</Badge>
            </Show>
          </span>
        </span>
        <Score kind={props.kind} value={props.entry.value} />
      </div>
    </li>
  );
}
