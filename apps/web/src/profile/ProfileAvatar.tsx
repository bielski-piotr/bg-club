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
 * Awatar gracza: zdjęcie z prywatnego bucketu `avatars`, a bez zdjęcia albo
 * do czasu jego wczytania monogram w kolorze z hooka. Usunięty członek ma szary
 * monogram.
 */
export function ProfileAvatar(props: ProfileAvatarProps) {
  const rest = omit(props, 'profile');
  const url = createAvatarUrl(() =>
    props.profile.deleted_at === null ? (props.profile.avatar_path ?? null) : null,
  );
  const person = createMemo(() => avatarPerson(props.profile, url.current()));
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
