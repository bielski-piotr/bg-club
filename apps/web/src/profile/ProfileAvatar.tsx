import { useAuth } from '../auth/authContext';
import { Avatar, type AvatarProps } from '../ui';
import { avatarPerson, useAvatarUrl, type Profile } from './profiles';

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
export function ProfileAvatar({ profile, ...rest }: ProfileAvatarProps) {
  const { client } = useAuth();
  const url = useAvatarUrl(
    client,
    profile.deleted_at === null ? (profile.avatar_path ?? null) : null,
  );
  return <Avatar {...avatarPerson(profile, url.data)} {...rest} />;
}
