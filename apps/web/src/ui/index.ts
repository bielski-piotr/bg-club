/**
 * Komponenty design systemu BG Club. Pola tekstowe: `value` + `onInput`
 * (szkic w sygnale rodzica); slot `trigger` w `Menu` dostaje `open` jako akcesor, `Tabs` –
 * funkcję treści. Toasty: `useContext(ToastContext)` z `./toastContext`.
 */
export {
  Avatar,
  AvatarStack,
  type AvatarPerson,
  type AvatarProps,
  type AvatarSize,
} from './Avatar';
export { monogram, paletteColor, paletteIndex, AVATAR_PALETTE_SIZE } from './avatarUtils';
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
export { focusableIn } from './focusable';
export { Menu, type MenuItem, type MenuProps, type MenuTriggerProps } from './Menu';
export { Nav, type NavItem } from './Nav';
export { Dialog, Modal, type DialogProps, type ModalProps } from './Modal';
export { iconNames } from './iconPaths';
export { Select, type SelectOption } from './Select';
export { createDebounced, normalizeSearch, SEARCH_DELAY_MS } from './search';
export { PageSection, SectionLayout, type SectionItem } from './SectionLayout';
export { Spinner } from './Spinner';
export { Tabs, type TabItem } from './Tabs';
export { Toast, ToastProvider } from './Toast';
export { ToastContext, type ToastApi, type ToastVariant } from './toastContext';
export type { ClassValue } from './dom';
