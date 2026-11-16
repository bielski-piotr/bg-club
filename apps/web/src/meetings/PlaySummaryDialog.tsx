import { useState, type KeyboardEvent } from 'react';
import {
  manualTieGroups,
  resolveManualTies,
  type RankedPlayer,
  type ScoringTemplate,
} from '@bg-club/scoring';
import { ManualTieControls } from '../score-pad/ManualTieControls';
import { format, t } from '../i18n';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import { fullName, type Profile } from '../profile/profiles';
import { Banner, Button, Dialog } from '../ui';
import { cx } from '../ui/cx';
import { playSummary, type PlaySeats, type PlaySaveFailure, type PlaySummary } from './playSave';

const text = t.meetings.play.summary;

export interface PlaySummaryDialogProps {
  readonly title: string;
  /** `null`: kartki nie da się zapisać (wyniki nie pasują do partii). */
  readonly summary: PlaySummary | null;
  readonly profiles: ReadonlyMap<string, Profile>;
  readonly saving: boolean;
  readonly failure: PlaySaveFailure | null;
  /** Wraca do kartki (kartka wraca na wierzch notesu). */
  readonly onCancel: () => void;
  readonly onConfirm: (summary: PlaySummary) => void;
  readonly manual?:
    | {
        readonly template: ScoringTemplate;
        readonly ranked: readonly RankedPlayer[];
        readonly play: PlaySeats;
      }
    | undefined;
}

/**
 * Podsumowanie oderwanej karteczki (PAD-5): miejsca, wyniki kategorii decydującej i punkty
 * leaderboardu (podgląd z tej samej reguły co w bazie). „Zapisz partię” kończy partię,
 * „Wróć do kartki”, Esc i tło kładą kartkę z powrotem na notes.
 */
export function PlaySummaryDialog({
  title,
  summary: original,
  profiles,
  saving,
  failure,
  onCancel,
  onConfirm,
  manual,
}: PlaySummaryDialogProps) {
  const [resolved, setResolved] = useState<readonly RankedPlayer[] | null>(null);
  const summary =
    original && resolved && manual ? playSummary(manual.play, original.sheet, resolved) : original;
  const groups = manual ? manualTieGroups(manual.template, manual.ranked) : [];
  const cancel = () => {
    if (!saving) onCancel();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    // Esc zamyka tylko podsumowanie, nie notes pod nim (PopupHost pomija obsłużone Esc).
    event.preventDefault();
    cancel();
  };
  return (
    <div className="play-summary" onKeyDown={onKeyDown}>
      <Dialog
        title={text.title}
        icon="tear-off"
        description={<p>{format(text.description, { title })}</p>}
        onScrimClick={cancel}
        footer={
          <>
            <Button variant="secondary" autoFocus disabled={saving} onClick={cancel}>
              {text.cancel}
            </Button>
            <Button
              loading={saving}
              disabled={!summary}
              onClick={() => summary && onConfirm(summary)}
            >
              {text.submit}
            </Button>
          </>
        }
      >
        {original && manual ? (
          <ManualTieControls
            groups={groups}
            disabled={saving}
            nameOf={(seat) => {
              const row = original.rows.find((r) => r.seat === seat + 1);
              const person = row && profiles.get(row.profileId);
              return person ? fullName(person) : t.meetings.plays.unknownPlayer;
            }}
            onChange={(decisions) =>
              setResolved(resolveManualTies(manual.template, manual.ranked, decisions))
            }
          />
        ) : null}
        {summary ? (
          <ol className="play-summary__list" aria-label={format(text.listLabel, { title })}>
            {summary.rows.map((row) => {
              const person = profiles.get(row.profileId);
              const note = [row.win ? text.win : null, row.tied ? text.shared : null]
                .filter(Boolean)
                .join(' · ');
              return (
                <li key={row.seat} className={cx('play-summary__row', row.win && 'is-first')}>
                  <span className="play-summary__place">
                    <span aria-hidden="true">{format(text.place, { n: row.place })}</span>
                    <span className="sr-only">{format(text.placeLabel, { n: row.place })}</span>
                  </span>
                  {person ? <ProfileAvatar profile={person} size={36} decorative /> : null}
                  <span className="play-summary__player">
                    <span className="play-summary__name">
                      {person ? fullName(person) : t.meetings.plays.unknownPlayer}
                    </span>
                    {note ? <span className="play-summary__note">{note}</span> : null}
                  </span>
                  <span className="play-summary__score">
                    {row.value === null ? (
                      <span className="play-summary__empty">{text.noValue}</span>
                    ) : (
                      <>
                        <span aria-hidden="true">{row.value}</span>
                        <span className="sr-only">{format(text.score, { n: row.value })}</span>
                      </>
                    )}
                    {row.points !== null ? (
                      <span className="play-summary__points">
                        <span aria-hidden="true">{format(text.points, { n: row.points })}</span>
                        <span className="sr-only">
                          {format(text.pointsLabel, { n: row.points })}
                        </span>
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <Banner variant="warning">{text.invalidSheet}</Banner>
        )}
        {failure ? <Banner variant="error">{text.errors[failure]}</Banner> : null}
      </Dialog>
    </div>
  );
}
