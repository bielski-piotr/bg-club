/**
 * Komponenty design systemu BG Club w Solid 2.0 (migracja: docs/solidjs-2-migration.md). Ten
 * sam DOM i te same klasy CSS co `src/ui` (React); różnice API: `class` zamiast `className`,
 * pola tekstowe `value` + `onInput`, slot `trigger` w `Menu` dostaje `open` jako akcesor,
 * `Tabs` – funkcję treści. Toasty: `useContext(ToastContext)` z `src/solid/context.ts`.
 */
export {
  Avatar,
  AvatarStack,
  type AvatarPerson,
  type AvatarProps,
  type AvatarSize,
} from './Avatar';
export { monogram, paletteColor, paletteIndex, AVATAR_PALETTE_SIZE } from '../../ui/avatarUtils';
export { Badge, MetaChip, StatusChip, type Tone } from './Badge';
export { Button, IconButton, TextLink, type ButtonSize, type ButtonVariant } from './Button';
export { Card, ListRow, Tray } from './Card';
export { createChunks } from './chunks';
export { ShowMore } from './ShowMore';
export {
  Checkbox,
  ChipGroup,
  ColorSwatches,
  RadioGroup,
  SegmentedControl,
  type ChoiceOption,
  type SwatchOption,
} from './Choice';
export { Slider, Switch } from './Controls';
export { Banner, EmptyState, Skeleton, type BannerVariant } from './Feedback';
export { FieldFrame, PasswordField, SearchField, Stepper, TextField } from './Field';
export { Icon, type IconName } from './Icon';
export { focusableIn } from '../../ui/focusable';
export { Menu, type MenuItem, type MenuProps, type MenuTriggerProps } from './Menu';
export { Dialog, Modal, type DialogProps, type ModalProps } from './Modal';
export { iconNames } from './iconPaths';
export { Select, type SelectOption } from './Select';
export { normalizeSearch } from '../../ui/search';
export { Spinner } from './Spinner';
export { Tabs, type TabItem } from './Tabs';
export type { ClassValue } from './dom';
