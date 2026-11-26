import type { JSX } from '@solidjs/web';
import { createSignal, For, useContext } from 'solid-js';
import { t } from '../i18n';
import { THEME_PREFERENCES, type ThemePreference } from '../theme/theme';
import { createTheme } from '../theme/createTheme';
import {
  AVATAR_PALETTE_SIZE,
  Avatar,
  AvatarStack,
  Badge,
  Banner,
  Button,
  Card,
  Checkbox,
  ChipGroup,
  ColorSwatches,
  EmptyState,
  Icon,
  IconButton,
  ListRow,
  MetaChip,
  PasswordField,
  RadioGroup,
  SearchField,
  SegmentedControl,
  Menu,
  Select,
  Skeleton,
  Slider,
  Spinner,
  StatusChip,
  Stepper,
  Switch,
  Tabs,
  TextField,
  TextLink,
  Toast,
  Tray,
  iconNames,
  paletteColor,
  ToastContext,
  type AvatarSize,
  type SelectOption,
} from '../ui';
import { ScorePadEditorView } from '../score-pad/ScorePadEditorView';
import { ScorePadView } from '../score-pad/ScorePadView';
import { ariaBool } from '../ui/dom';
import { SAMPLE_SCORE_PAD } from './scorePadSample';
import './DesignSystemPage.css';

const s = t.designSystem.samples;
const sections = t.designSystem.sections;

const people = s.members.map((name, i) => ({ id: `member-${i}`, name }));

/** Przykładowy członek o danym indeksie (lista w słowniku ma 12 osób). */
function member(index: number) {
  return people[index] ?? { id: 'member-x', name: s.removedMember };
}
/** Przykładowy ranking w karcie (miejsce = kolejność). */
const rankingSample: readonly {
  person: ReturnType<typeof member>;
  points: number;
  me?: boolean;
}[] = [
  { person: member(1), points: 128 },
  { person: member(0), points: 117, me: true },
  { person: member(2), points: 96 },
];

const avatarSizes: readonly AvatarSize[] = [20, 24, 28, 32, 36, 40, 56, 64, 88];

/** Kolory pokazane w galerii: rola → token. Nazwy ról to identyfikatory tokenów. */
const colorTokens = [
  'page',
  'surface',
  'border',
  'tint',
  'ink',
  'muted',
  'disabled',
  'accent',
  'accent-text',
  'accent-tint',
  'danger',
  'danger-tint',
  'warning-bg',
  'warning-text',
  'success-bg',
  'success-text',
  'inverse',
  'toast',
] as const;

const years: readonly SelectOption<string>[] = [
  { value: 'all', label: s.allYears },
  { value: '2026', label: '2026' },
  { value: '2025', label: '2025' },
  { value: '2024', label: '2024' },
];

const timezones: readonly SelectOption<string>[] = [
  { value: 'Europe/Warsaw', label: 'Europe/Warsaw', meta: 'UTC+01:00' },
  { value: 'Europe/London', label: 'Europe/London', meta: 'UTC+00:00' },
  { value: 'Europe/Helsinki', label: 'Europe/Helsinki', meta: 'UTC+02:00' },
  { value: 'America/New_York', label: 'America/New_York', meta: 'UTC−05:00' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo', meta: 'UTC+09:00' },
];

const swatches = s.colorNames.map((label, i) => ({
  value: String(i),
  label,
  color: i < AVATAR_PALETTE_SIZE ? paletteColor(i) : 'var(--c-inverse)',
}));

function Section(props: { id: string; title: string; children: JSX.Element }) {
  return (
    <section class="ds-section" aria-labelledby={`ds-${props.id}`}>
      <h2 id={`ds-${props.id}`} class="ds-section__title">
        {props.title}
      </h2>
      <div class="ds-section__body">{props.children}</div>
    </section>
  );
}

function Row(props: { children: JSX.Element; column?: boolean }) {
  return <div class={props.column ? 'ds-col' : 'ds-row'}>{props.children}</div>;
}

export default function DesignSystemPage() {
  const theme = createTheme();
  const toast = useContext(ToastContext);
  const [name, setName] = createSignal('');
  const [password, setPassword] = createSignal('sekret123');
  const [repeat, setRepeat] = createSignal('sekret12');
  const [query, setQuery] = createSignal('');
  const [players, setPlayers] = createSignal(5);
  const [year, setYear] = createSignal('all');
  const [timezone, setTimezone] = createSignal('Europe/Warsaw');
  const [forceTie, setForceTie] = createSignal(true);
  const [optIn, setOptIn] = createSignal(false);
  const [direction, setDirection] = createSignal<'more' | 'less'>('more');
  const [range, setRange] = createSignal<'any' | 'minmax' | 'list'>('minmax');
  const [summed, setSummed] = createSignal<string[]>(['0', '3']);
  const [color, setColor] = createSignal('4');
  const [tab, setTab] = createSignal<'points' | 'wins' | 'streak'>('points');
  const [smooth, setSmooth] = createSignal(true);
  const [strength, setStrength] = createSignal(4);
  const [loading, setLoading] = createSignal(false);
  const [scorePad, setScorePad] = createSignal<'none' | 'pad' | 'editor'>('none');

  const save = () => {
    setLoading(true);
    window.setTimeout(() => setLoading(false), 1500);
  };

  return (
    <main class="ds-page">
      <header class="ds-header">
        <div class="ds-header__text">
          <p class="ds-eyebrow">{t.app.name}</p>
          <h1 class="ds-title">{t.designSystem.title}</h1>
          <p class="ds-intro">{t.designSystem.intro}</p>
          <TextLink href="/">{t.designSystem.backToApp}</TextLink>
        </div>
        <SegmentedControl<ThemePreference>
          legend={t.theme.label}
          hideLegend={false}
          options={THEME_PREFERENCES.map((value) => ({ value, label: t.theme[value] }))}
          value={theme.preference()}
          onChange={theme.setPreference}
        />
      </header>

      <div class="ds-grid">
        <Section id="colors" title={sections.colors}>
          <ul class="ds-swatches">
            <For each={colorTokens}>
              {(token) => (
                <li class="ds-swatch">
                  <span class="ds-swatch__chip" style={{ background: `var(--c-${token})` }} />
                  <code>--c-{token}</code>
                </li>
              )}
            </For>
          </ul>
          <div class="ds-palette" aria-hidden="true">
            {Array.from({ length: AVATAR_PALETTE_SIZE }, (_, i) => (
              <span style={{ background: paletteColor(i) }}>AB</span>
            ))}
          </div>
        </Section>

        <Section id="typography" title={sections.typography}>
          <p class="ds-type ds-type--title">{s.rankingTitle}</p>
          <p class="ds-type ds-type--featured">{s.membersTitle}</p>
          <p class="ds-type ds-type--number tnum">1 234</p>
          <p class="ds-type ds-type--row">{s.members[0]}</p>
          <p class="ds-type ds-type--meta">{s.metaDate}</p>
          <p class="ds-type ds-type--body">{s.emptyHelper}</p>
          <p class="ds-type ds-type--mono">{s.hookValue}</p>
        </Section>

        <Section id="buttons" title={sections.buttons}>
          <Row>
            <Button>{s.primary}</Button>
            <Button variant="secondary">{s.secondary}</Button>
            <Button variant="destructive" icon="trash">
              {s.destructive}
            </Button>
          </Row>
          <Row>
            <Button size="sm" icon="plus">
              {s.add}
            </Button>
            <Button size="sm" variant="secondary">
              {s.secondary}
            </Button>
            <Button loading={loading()} onClick={save} icon="check">
              {loading() ? s.saving : s.primary}
            </Button>
            <Button disabled>{s.disabled}</Button>
          </Row>
          <Row>
            <IconButton icon="chevron-left" label={t.ui.back} />
            <IconButton icon="x" label={t.ui.close} />
            <IconButton icon="more" label={t.ui.more} size={32} />
            <IconButton icon="pencil" label={s.edit} size={32} disabled />
            <TextLink onClick={() => toast.show(s.toastSuccess)}>{t.ui.seeMore}</TextLink>
          </Row>
          <Button fullWidth icon="plus">
            {s.addMember}
          </Button>
        </Section>

        <Section id="fields" title={sections.fields}>
          <TextField
            label={s.nameLabel}
            placeholder={s.namePlaceholder}
            hint={s.nameHint}
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            autocomplete="given-name"
          />
          <PasswordField
            label={s.passwordLabel}
            value={password()}
            onInput={(e) => setPassword(e.currentTarget.value)}
            autocomplete="new-password"
          />
          <PasswordField
            label={s.repeatLabel}
            value={repeat()}
            onInput={(e) => setRepeat(e.currentTarget.value)}
            autocomplete="new-password"
            error={repeat() !== password() ? s.passwordMismatch : undefined}
          />
          <TextField label={s.hookLabel} value={s.hookValue} readonly mono />
          <div class="ds-row ds-row--fields">
            <TextField
              label={s.widthLabel}
              value="10,5"
              inputmode="decimal"
              numeric
              trailing={s.unitCm}
            />
            <TextField label={s.noteLabel} optional disabled value="" />
          </div>
          <SearchField
            label={s.searchLabel}
            placeholder={s.searchPlaceholder}
            value={query()}
            onValueChange={setQuery}
          />
          <Stepper
            label={s.stepperLabel}
            value={players()}
            onChange={setPlayers}
            min={1}
            max={20}
          />
        </Section>

        <Section id="selectors" title={sections.selectors}>
          <Select
            label={s.timezoneLabel}
            options={timezones}
            value={timezone()}
            onChange={setTimezone}
            leadingIcon="globe"
          />
          <Select
            label={s.yearLabel}
            hideLabel
            appearance="pill"
            options={years}
            value={year()}
            onChange={setYear}
            leadingIcon="calendar"
          />
          <Row column>
            <Checkbox label={s.checkboxLabel} checked={forceTie()} onCheckedChange={setForceTie} />
            <Checkbox label={s.switchDisabled} checked={optIn()} onCheckedChange={setOptIn} />
            <Checkbox
              label={s.checkboxDisabled}
              checked={false}
              onCheckedChange={() => {}}
              disabled
            />
          </Row>
          <RadioGroup
            legend={s.directionLegend}
            options={[
              { value: 'more', label: s.directionMore },
              { value: 'less', label: s.directionLess },
            ]}
            value={direction()}
            onChange={setDirection}
          />
          <SegmentedControl
            legend={s.rangeLegend}
            hideLegend={false}
            options={[
              { value: 'any', label: s.rangeAny },
              { value: 'minmax', label: s.rangeMinMax },
              { value: 'list', label: s.rangeList },
            ]}
            value={range()}
            onChange={setRange}
          />
          <ChipGroup
            legend={s.sumLegend}
            options={s.categories.map((label, i) => ({ value: String(i), label }))}
            values={summed()}
            onChange={setSummed}
          />
          <ColorSwatches
            legend={s.colorLegend}
            options={swatches}
            value={color()}
            onChange={setColor}
          />
          <Menu
            label={s.menuLabel}
            items={[
              {
                id: 'edit',
                label: s.menuEdit,
                icon: 'pencil',
                onSelect: () => toast.show(s.menuEdit, 'neutral'),
              },
              {
                id: 'delete',
                label: s.menuDelete,
                icon: 'trash',
                destructive: true,
                onSelect: () => toast.show(s.menuDelete, 'neutral'),
              },
            ]}
            trigger={(props) => (
              <button
                type="button"
                {...props}
                class="icon-btn icon-btn--36"
                aria-label={s.menuTrigger}
              >
                <Icon name="more" />
              </button>
            )}
          />
        </Section>

        <Section id="avatars" title={sections.avatars}>
          <Row>
            <For each={avatarSizes}>{(size, i) => <Avatar {...member(i())} size={size} />}</For>
          </Row>
          <Row>
            <Avatar name={s.removedMember} removed size={40} />
            <Avatar {...member(1)} size={80} ring="accent" />
          </Row>
          <AvatarStack people={people} size={64} max={4} showOverflow />
          <AvatarStack people={people} size={56} max={4} showOverflow />
          <Row>
            <AvatarStack people={people.slice(0, 4)} size={20} />
            <AvatarStack people={people.slice(0, 4)} size={24} />
            <AvatarStack people={people.slice(0, 3)} size={28} />
            <AvatarStack people={people.slice(0, 5)} size={36} />
          </Row>
        </Section>

        <Section id="cards" title={sections.cards}>
          <Card
            title={s.rankingTitle}
            action={<TextLink href="#ds-cards">{t.ui.seeMore}</TextLink>}
          >
            <div class="ds-card-body">
              <Tray label={s.rankingTitle}>
                <For each={rankingSample}>
                  {(row, i) => (
                    <ListRow
                      highlighted={row.me ?? false}
                      leading={
                        <>
                          <span class="rank">{i() + 1}</span>
                          <Avatar
                            {...row.person}
                            size={36}
                            decorative
                            ring={row.me ? 'white' : undefined}
                          />
                        </>
                      }
                      title={
                        <span class="ds-name">
                          {row.person.name}
                          {row.me ? <Badge onAccent>{t.ui.youBadge}</Badge> : null}
                        </span>
                      }
                      trailing={
                        <span class="score">
                          {row.points}
                          <span class="score__unit">{s.points}</span>
                        </span>
                      }
                    />
                  )}
                </For>
                <ListRow
                  muted
                  leading={
                    <>
                      <span class="rank">–</span>
                      <Avatar name={s.removedMember} removed size={36} decorative />
                    </>
                  }
                  title={`${s.removedMember} ${t.ui.removedSuffix}`}
                  trailing={
                    <span class="score">
                      41
                      <span class="score__unit">{s.points}</span>
                    </span>
                  }
                />
              </Tray>
            </div>
          </Card>
          <Card title={s.membersTitle} count={s.membersCount}>
            <div class="ds-card-body">
              <Tray label={s.membersTitle}>
                <For each={people.slice(0, 2)}>
                  {(person, i) => (
                    <ListRow
                      height={64}
                      leading={<Avatar {...person} size={40} decorative />}
                      title={person.name}
                      meta={s.metaPlays}
                      trailing={
                        i() === 0 ? <Badge tone="accent">{t.ui.adminBadge}</Badge> : undefined
                      }
                      onClick={() => toast.show(person.name, 'neutral')}
                    />
                  )}
                </For>
              </Tray>
            </div>
          </Card>
          <Card title={s.membersTitle} count={s.oneMember}>
            <EmptyState
              lead={<Avatar {...member(0)} size={56} decorative />}
              title={s.emptyTitle}
              helper={s.emptyHelper}
              action={
                <Button fullWidth icon="plus">
                  {s.addMember}
                </Button>
              }
            />
          </Card>
          <Card title={s.collectionTitle} count={s.zeroGames}>
            <EmptyState
              icon="dice"
              title={s.collectionEmpty}
              helper={s.collectionEmptyHelper}
              action={
                <Button fullWidth icon="plus">
                  {s.addGame}
                </Button>
              }
            />
          </Card>
        </Section>

        <Section id="tabs" title={sections.tabs}>
          <Tabs
            label={s.tabsLabel}
            items={[
              { id: 'points', label: s.tabPoints },
              { id: 'wins', label: s.tabWins },
              { id: 'streak', label: s.tabStreak },
            ]}
            value={tab()}
            onChange={setTab}
          >
            {(value) => (
              <p class="ds-type ds-type--body">
                {value === 'points'
                  ? s.tabPanelPoints
                  : value === 'wins'
                    ? s.tabPanelWins
                    : s.tabPanelStreak}
              </p>
            )}
          </Tabs>
        </Section>

        <Section id="badges" title={sections.badges}>
          <Row>
            <Badge tone="accent">{t.ui.adminBadge}</Badge>
            <Badge>{t.ui.youBadge}</Badge>
            <Badge tone="success">{s.leads}</Badge>
            <Badge tone="warning">{s.twoPlayers}</Badge>
            <Badge tone="danger">{s.streakBroken}</Badge>
          </Row>
          <Row>
            <StatusChip tone="accent">{s.statusVoting}</StatusChip>
            <StatusChip tone="ink">{s.statusChosen}</StatusChip>
            <StatusChip tone="success">{s.statusLive}</StatusChip>
            <StatusChip tone="neutral">{s.statusFinished}</StatusChip>
          </Row>
          <Row>
            <MetaChip icon="user">{s.metaPlayers}</MetaChip>
            <MetaChip icon="trophy">{s.metaPlays}</MetaChip>
            <MetaChip icon="calendar">{s.metaDate}</MetaChip>
          </Row>
        </Section>

        <Section id="feedback" title={sections.feedback}>
          <Row column>
            <Toast variant="success">{s.toastSuccess}</Toast>
            <Toast variant="neutral">{s.toastNeutral}</Toast>
            <Toast variant="error">{s.toastError}</Toast>
          </Row>
          <fieldset class="ds-fieldset">
            <legend class="group__legend">{s.showToast}</legend>
            <Row>
              <Button size="sm" variant="secondary" onClick={() => toast.show(s.toastSuccess)}>
                {s.showSuccess}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => toast.show(s.toastNeutral, 'neutral')}
              >
                {s.showNeutral}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => toast.show(s.toastError, 'error')}
              >
                {s.showError}
              </Button>
            </Row>
          </fieldset>
          <Banner variant="info">{s.info}</Banner>
          <Banner variant="warning">{s.warning}</Banner>
          <Banner
            variant="error"
            action={
              <Button size="sm" variant="secondary" icon="refresh">
                {s.retry}
              </Button>
            }
          >
            {s.error}
          </Banner>
          <div class="ds-loading">
            <Spinner label={s.loadingList} />
            <Skeleton height={54} radius={14} />
            <Skeleton height={54} radius={14} />
          </div>
        </Section>

        <Section id="controls" title={sections.controls}>
          <Switch label={s.switchLabel} checked={smooth()} onCheckedChange={setSmooth} />
          <Switch label={s.switchDisabled} checked={false} onCheckedChange={() => {}} disabled />
          <Slider
            label={s.sliderLabel}
            min={0}
            max={10}
            value={strength()}
            onValueChange={setStrength}
            disabled={!smooth()}
          />
        </Section>

        <Section id="score-pad" title={sections.scorePad}>
          <p class="ds-note">{s.scorePadIntro}</p>
          <Row>
            <Button
              variant={scorePad() === 'pad' ? 'primary' : 'secondary'}
              icon="pad"
              aria-pressed={ariaBool(scorePad() === 'pad')}
              onClick={() => setScorePad(scorePad() === 'pad' ? 'none' : 'pad')}
            >
              {s.showScorePad}
            </Button>
            <Button
              variant={scorePad() === 'editor' ? 'primary' : 'secondary'}
              icon="pencil"
              aria-pressed={ariaBool(scorePad() === 'editor')}
              onClick={() => setScorePad(scorePad() === 'editor' ? 'none' : 'editor')}
            >
              {s.showScorePadEditor}
            </Button>
          </Row>
          {scorePad() === 'pad' ? (
            <ScorePadView config={SAMPLE_SCORE_PAD} class="ds-score-pad" />
          ) : null}
          {scorePad() === 'editor' ? <ScorePadEditorView class="ds-score-pad" /> : null}
        </Section>

        <Section id="icons" title={sections.icons}>
          <ul class="ds-icons">
            <For each={iconNames}>
              {(icon) => (
                <li>
                  <Icon name={icon} size={20} />
                  <code>{icon}</code>
                </li>
              )}
            </For>
          </ul>
        </Section>
      </div>
    </main>
  );
}
