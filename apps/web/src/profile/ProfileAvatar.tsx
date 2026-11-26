import { createMemo, omit } from 'solid-js';
import { avatarPerson, type Profile } from './profileQueries';
import { Avatar, type AvatarProps } from '../ui/Avatar';
import { createAvatarUrl } from './profiles';

type ProfileAvatarProps = Omit<AvatarProps, 'id' | 'name' | 'src' | 'removed'> & {
  readonly profile: Pick<
    Profile,
    'hook' | 'first_name' | 'last_name' | 'deleted_at' | 'avatar_path'
  >;
};

/**
 * Awatar gracza (DS §8): zdjęcie z prywatnego bucketu `avatars` (USR-3), a bez zdjęcia albo
 * do czasu jego wczytania monogram w kolorze z hooka (USR-2). Usunięty członek ma szary
 * monogram (MEM-5).
 */
export function ProfileAvatar(props: ProfileAvatarProps) {
  const rest = omit(props, 'profile');
  const url = createAvatarUrl(() =>
    props.profile.deleted_at === null ? (props.profile.avatar_path ?? null) : null,
  );
  const person = createMemo(() => avatarPerson(props.profile, url().data));
  return (
    <Avatar
      id={person().id}
      name={person().name}
      src={person().src}
      removed={person().removed}
      {...rest}
    />
  );
}
