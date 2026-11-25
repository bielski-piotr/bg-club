import { useSyncExternalStore } from 'react';
import { format, formatNumber, plural, t } from '../i18n';
import { ProfileAvatar } from '../react-shared/ProfileAvatar';
import { ProfileLink } from '../react-shared/ProfileLink';
import { fullName, type Profile } from '../react-shared/profiles';
import { Badge, type AvatarSize } from '../ui';
import { cx } from '../ui/cx';
import {
  leaderboardLayout,
  widgetRows,
  type LeaderboardEntry,
  type LeaderboardKind,
  type PodiumStep,
} from './leaderboard';
import './leaderboard.css';

/** Ile awatarów remisującego stopnia widać w widżecie; resztę skrót „i N więcej” (LB-6). */
const WIDGET_TIED_AVATARS = 3;

const DESKTOP = '(min-width: 768px)';

function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia(DESKTOP);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** Szerokość od 768 px: większe awatary podium (DS §8: 104 i 80; na telefonie 80 i 64). */
function useDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === 'function' && window.matchMedia(DESKTOP).matches,
    () => false,
  );
}

/** Profil do awatara: hook z listy profili (kolor monogramu, USR-2), reszta z wiersza rankingu. */
function avatarProfile(entry: LeaderboardEntry, profiles: ReadonlyMap<string, Profile>) {
  return {
    hook: profiles.get(entry.profile_id)?.hook ?? entry.profile_id,
    first_name: entry.first_name,
    last_name: entry.last_name,
    avatar_path: entry.avatar_path,
    deleted_at: entry.deleted ? (profiles.get(entry.profile_id)?.deleted_at ?? 'deleted') : null,
  };
}

function Score({ kind, value }: { readonly kind: LeaderboardKind; readonly value: number }) {
  // Formy jednostki nie zawierają `{n}`: liczba stoi osobno, większą czcionką (DS §6).
  const unit = plural(value, t.leaderboard.units[kind]);
  return (
    <span className="score leaderboard__score">
      {formatNumber(value)}
      <span className="score__unit">{unit}</span>
    </span>
  );
}

interface BoardProps {
  readonly entries: readonly LeaderboardEntry[];
  readonly kind: LeaderboardKind;
  readonly meId: string;
  readonly profiles: ReadonlyMap<string, Profile>;
  /** Widżet: miejsca 4–7 (+ własny wiersz) i skrócone remisy; popup: pełna lista (LB-3). */
  readonly variant: 'widget' | 'popup';
}

/**
 * Wspólny układ rankingu widżetu i popupu (LB-2, LB-3, DS §6, §8): podium z awatarami w ringu,
 * odznaką miejsca i koroną, a pod nim taca z kolejnymi miejscami. Remisujący stoją razem na
 * jednym stopniu (LB-6), usunięci są wyszarzeni na końcu listy (LB-7), bieżący użytkownik ma
 * wiersz akcentu i odznakę „Ty”. Każdy awatar prowadzi do profilu (PRD §4).
 */
export function LeaderboardBoard({ entries, kind, meId, profiles, variant }: BoardProps) {
  const { steps, rows } = leaderboardLayout(entries);
  const desktop = useDesktop();
  const { shown, own } =
    variant === 'widget' ? widgetRows(rows, meId) : { shown: rows, own: undefined };
  const listed = own ? [...shown, own] : shown;

  return (
    <div className={cx('leaderboard', `leaderboard--${variant}`)}>
      {steps.length > 0 ? (
        <ol className="podium" aria-label={t.leaderboard.podiumLabel}>
          {steps.map((step, index) => (
            <PodiumColumn
              key={step.place}
              step={step}
              index={index}
              kind={kind}
              meId={meId}
              profiles={profiles}
              desktop={desktop}
              limit={variant === 'widget' ? WIDGET_TIED_AVATARS : undefined}
            />
          ))}
        </ol>
      ) : null}
      {listed.length > 0 ? (
        <ul className="tray leaderboard__list" aria-label={t.leaderboard.listLabel}>
          {listed.map((entry) => (
            <LeaderboardRow
              key={entry.profile_id}
              entry={entry}
              kind={kind}
              me={entry.profile_id === meId}
              separated={entry === own}
              profiles={profiles}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PodiumColumn({
  step,
  index,
  kind,
  meId,
  profiles,
  desktop,
  limit,
}: {
  readonly step: PodiumStep;
  readonly index: number;
  readonly kind: LeaderboardKind;
  readonly meId: string;
  readonly profiles: ReadonlyMap<string, Profile>;
  readonly desktop: boolean;
  readonly limit: number | undefined;
}) {
  const first = index === 0;
  const tied = step.entries.length > 1;
  // Pojedyncza osoba: DS §8 (104 i 80, na telefonie 80 i 64); remis: mniejsze, żeby się zmieściły.
  const size: AvatarSize = tied
    ? first && desktop
      ? 56
      : 40
    : first
      ? desktop
        ? 104
        : 80
      : desktop
        ? 80
        : 64;
  const visible = limit === undefined ? step.entries : step.entries.slice(0, limit);
  const hidden = step.entries.slice(visible.length);
  const value = step.entries[0]?.value ?? 0;
  const mine = step.entries.some((entry) => entry.profile_id === meId);
  const names = step.entries.map((entry) => entry.first_name);
  const shownNames = visible.map((entry) => entry.first_name);

  return (
    <li
      className={cx(
        'podium__step',
        // Stopień według miejsca, nie pozycji: przy remisie 1, 1, 3 trzeci stoi na 3. stopniu.
        `podium__step--${step.place}`,
        tied && 'podium__step--tied',
        mine && 'podium__step--mine',
      )}
    >
      <span className="sr-only">
        {format(t.leaderboard.place, { place: step.place })}
        {tied ? `, ${plural(step.entries.length, t.leaderboard.tied)}` : null}:{' '}
        {step.entries.map(fullName).join(', ')}
      </span>
      <div className="podium__people">
        {first ? (
          <svg className="podium__crown" viewBox="0 0 36 26" aria-hidden="true">
            <path d="M2 8L10 15L18 2L26 15L34 8L31 24H5L2 8Z" />
          </svg>
        ) : null}
        <ul className="podium__avatars">
          {visible.map((entry) => (
            <li key={entry.profile_id} className="podium__avatar">
              <ProfileLink id={entry.profile_id} name={fullName(entry)}>
                <ProfileAvatar
                  profile={avatarProfile(entry, profiles)}
                  size={size}
                  ring="accent"
                  decorative
                />
              </ProfileLink>
            </li>
          ))}
          {hidden.length > 0 ? (
            <li
              className="podium__more tnum"
              aria-label={format(t.leaderboard.moreLabel, {
                names: hidden.map(fullName).join(', '),
              })}
            >
              +{hidden.length}
            </li>
          ) : null}
        </ul>
        <span className="podium__badge tnum" aria-hidden="true">
          {step.place}
        </span>
      </div>
      <div className="podium__block" aria-hidden="true">
        <span className="podium__name" title={step.entries.map(fullName).join(', ')}>
          {hidden.length > 0
            ? `${shownNames.join(', ')} ${format(t.leaderboard.more, { n: hidden.length })}`
            : names.join(', ')}
        </span>
        {mine ? <Badge tone="accent">{t.ui.youBadge}</Badge> : null}
        <span className="podium__value">
          <Score kind={kind} value={value} />
        </span>
      </div>
    </li>
  );
}

function LeaderboardRow({
  entry,
  kind,
  me,
  separated,
  profiles,
}: {
  readonly entry: LeaderboardEntry;
  readonly kind: LeaderboardKind;
  readonly me: boolean;
  readonly separated: boolean;
  readonly profiles: ReadonlyMap<string, Profile>;
}) {
  const name = fullName(entry);
  return (
    <li className={cx('tray__item', separated && 'leaderboard__own')}>
      <div
        className={cx(
          'row row--54 leaderboard__row',
          me && 'row--highlighted',
          entry.deleted && 'row--muted',
        )}
      >
        <span className="rank" aria-hidden={entry.deleted || undefined}>
          {entry.deleted ? '–' : entry.place}
        </span>
        <ProfileLink id={entry.profile_id} name={name} className="leaderboard__avatar">
          <ProfileAvatar
            profile={avatarProfile(entry, profiles)}
            size={36}
            ring={me ? 'white' : undefined}
            decorative
          />
        </ProfileLink>
        <span className="row__text">
          <span className="row__title leaderboard__name">
            <span className="leaderboard__name-text" title={name}>
              {entry.deleted ? `${name} ${t.ui.removedSuffix}` : name}
            </span>
            {me ? <Badge onAccent>{t.ui.youBadge}</Badge> : null}
          </span>
        </span>
        <Score kind={kind} value={entry.value} />
      </div>
    </li>
  );
}
