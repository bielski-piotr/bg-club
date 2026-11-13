import { useState, type ReactNode } from 'react';
import { t } from '../i18n';
import { THEME_PREFERENCES, type ThemePreference } from '../theme/theme';
import { useTheme } from '../theme/useTheme';
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
  useToast,
  type AvatarSize,
  type SelectOption,
} from '../ui';
import './DesignSystemPage.css';

const s = t.designSystem.samples;
const sections = t.designSystem.sections;

const people = s.members.map((name, i) => ({ id: `member-${i}`, name }));

/** Przykładowy członek o danym indeksie (lista w słowniku ma 12 osób). */
function member(index: number) {
  return people[index] ?? { id: 'member-x', name: s.removedMember };
}
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

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="ds-section" aria-labelledby={`ds-${id}`}>
      <h2 id={`ds-${id}`} className="ds-section__title">
        {title}
      </h2>
      <div className="ds-section__body">{children}</div>
    </section>
  );
}

function Row({ children, column = false }: { children: ReactNode; column?: boolean }) {
  return <div className={column ? 'ds-col' : 'ds-row'}>{children}</div>;
}

export default function DesignSystemPage() {
  const theme = useTheme();
  const toast = useToast();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('sekret123');
  const [repeat, setRepeat] = useState('sekret12');
  const [query, setQuery] = useState('');
  const [players, setPlayers] = useState(5);
  const [year, setYear] = useState('all');
  const [timezone, setTimezone] = useState('Europe/Warsaw');
  const [forceTie, setForceTie] = useState(true);
  const [optIn, setOptIn] = useState(false);
  const [direction, setDirection] = useState<'more' | 'less'>('more');
  const [range, setRange] = useState<'any' | 'minmax' | 'list'>('minmax');
  const [summed, setSummed] = useState<string[]>(['0', '3']);
  const [color, setColor] = useState('4');
  const [tab, setTab] = useState<'points' | 'wins' | 'streak'>('points');
  const [smooth, setSmooth] = useState(true);
  const [strength, setStrength] = useState(4);
  const [loading, setLoading] = useState(false);

  const save = () => {
    setLoading(true);
    window.setTimeout(() => setLoading(false), 1500);
  };

  return (
    <main className="ds-page">
      <header className="ds-header">
        <div className="ds-header__text">
          <p className="ds-eyebrow">{t.app.name}</p>
          <h1 className="ds-title">{t.designSystem.title}</h1>
          <p className="ds-intro">{t.designSystem.intro}</p>
          <TextLink href="/">{t.designSystem.backToApp}</TextLink>
        </div>
        <SegmentedControl<ThemePreference>
          legend={t.theme.label}
          hideLegend={false}
          options={THEME_PREFERENCES.map((value) => ({ value, label: t.theme[value] }))}
          value={theme.preference}
          onChange={theme.setPreference}
        />
      </header>

      <div className="ds-grid">
        <Section id="colors" title={sections.colors}>
          <ul className="ds-swatches">
            {colorTokens.map((token) => (
              <li key={token} className="ds-swatch">
                <span className="ds-swatch__chip" style={{ background: `var(--c-${token})` }} />
                <code>--c-{token}</code>
              </li>
            ))}
          </ul>
          <div className="ds-palette" aria-hidden="true">
            {Array.from({ length: AVATAR_PALETTE_SIZE }, (_, i) => (
              <span key={i} style={{ background: paletteColor(i) }}>
                AB
              </span>
            ))}
          </div>
        </Section>

        <Section id="typography" title={sections.typography}>
          <p className="ds-type ds-type--title">{s.rankingTitle}</p>
          <p className="ds-type ds-type--featured">{s.membersTitle}</p>
          <p className="ds-type ds-type--number tnum">1 234</p>
          <p className="ds-type ds-type--row">{s.members[0]}</p>
          <p className="ds-type ds-type--meta">{s.metaDate}</p>
          <p className="ds-type ds-type--body">{s.emptyHelper}</p>
          <p className="ds-type ds-type--mono">{s.hookValue}</p>
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
            <Button loading={loading} onClick={save} icon="check">
              {loading ? s.saving : s.primary}
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
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="given-name"
          />
          <PasswordField
            label={s.passwordLabel}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <PasswordField
            label={s.repeatLabel}
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            autoComplete="new-password"
            error={repeat !== password ? s.passwordMismatch : undefined}
          />
          <TextField label={s.hookLabel} value={s.hookValue} readOnly mono />
          <div className="ds-row ds-row--fields">
            <TextField
              label={s.widthLabel}
              defaultValue="10,5"
              inputMode="decimal"
              numeric
              trailing={s.unitCm}
            />
            <TextField label={s.noteLabel} optional disabled defaultValue="" />
          </div>
          <SearchField
            label={s.searchLabel}
            placeholder={s.searchPlaceholder}
            value={query}
            onValueChange={setQuery}
          />
          <Stepper label={s.stepperLabel} value={players} onChange={setPlayers} min={1} max={20} />
        </Section>

        <Section id="selectors" title={sections.selectors}>
          <Select
            label={s.timezoneLabel}
            options={timezones}
            value={timezone}
            onChange={setTimezone}
            leadingIcon="globe"
          />
          <Select
            label={s.yearLabel}
            hideLabel
            appearance="pill"
            options={years}
            value={year}
            onChange={setYear}
            leadingIcon="calendar"
          />
          <Row column>
            <Checkbox label={s.checkboxLabel} checked={forceTie} onCheckedChange={setForceTie} />
            <Checkbox label={s.switchDisabled} checked={optIn} onCheckedChange={setOptIn} />
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
            value={direction}
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
            value={range}
            onChange={setRange}
          />
          <ChipGroup
            legend={s.sumLegend}
            options={s.categories.map((label, i) => ({ value: String(i), label }))}
            values={summed}
            onChange={setSummed}
          />
          <ColorSwatches
            legend={s.colorLegend}
            options={swatches}
            value={color}
            onChange={setColor}
          />
        </Section>

        <Section id="avatars" title={sections.avatars}>
          <Row>
            {avatarSizes.map((size, i) => (
              <Avatar key={size} {...member(i)} size={size} />
            ))}
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
            <div className="ds-card-body">
              <Tray label={s.rankingTitle}>
                {[
                  { person: member(1), points: 128 },
                  { person: member(0), points: 117, me: true },
                  { person: member(2), points: 96 },
                ].map(({ person, points, me }, i) => (
                  <ListRow
                    key={person.id}
                    highlighted={me ?? false}
                    leading={
                      <>
                        <span className="rank">{i + 1}</span>
                        <Avatar {...person} size={36} decorative ring={me ? 'white' : undefined} />
                      </>
                    }
                    title={
                      <span className="ds-name">
                        {person.name}
                        {me ? <Badge onAccent>{t.ui.youBadge}</Badge> : null}
                      </span>
                    }
                    trailing={
                      <span className="score">
                        {points}
                        <span className="score__unit">{s.points}</span>
                      </span>
                    }
                  />
                ))}
                <ListRow
                  muted
                  leading={
                    <>
                      <span className="rank">–</span>
                      <Avatar name={s.removedMember} removed size={36} decorative />
                    </>
                  }
                  title={`${s.removedMember} ${t.ui.removedSuffix}`}
                  trailing={
                    <span className="score">
                      41
                      <span className="score__unit">{s.points}</span>
                    </span>
                  }
                />
              </Tray>
            </div>
          </Card>
          <Card title={s.membersTitle} count={s.membersCount}>
            <div className="ds-card-body">
              <Tray label={s.membersTitle}>
                {people.slice(0, 2).map((person, i) => (
                  <ListRow
                    key={person.id}
                    height={64}
                    leading={<Avatar {...person} size={40} decorative />}
                    title={person.name}
                    meta={s.metaPlays}
                    trailing={i === 0 ? <Badge tone="accent">{t.ui.adminBadge}</Badge> : undefined}
                    onClick={() => toast.show(person.name, 'neutral')}
                  />
                ))}
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
            value={tab}
            onChange={setTab}
          >
            {(value) => (
              <p className="ds-type ds-type--body">
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
          <fieldset className="ds-fieldset">
            <legend className="group__legend">{s.showToast}</legend>
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
          <div className="ds-loading">
            <Spinner label={s.loadingList} />
            <Skeleton height={54} radius={14} />
            <Skeleton height={54} radius={14} />
          </div>
        </Section>

        <Section id="controls" title={sections.controls}>
          <Switch label={s.switchLabel} checked={smooth} onCheckedChange={setSmooth} />
          <Switch label={s.switchDisabled} checked={false} onCheckedChange={() => {}} disabled />
          <Slider
            label={s.sliderLabel}
            min={0}
            max={10}
            value={strength}
            onValueChange={setStrength}
            disabled={!smooth}
          />
        </Section>

        <Section id="icons" title={sections.icons}>
          <ul className="ds-icons">
            {iconNames.map((icon) => (
              <li key={icon}>
                <Icon name={icon} size={20} />
                <code>{icon}</code>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </main>
  );
}
