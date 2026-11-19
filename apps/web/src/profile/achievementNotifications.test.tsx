import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from '../ui';
import { AchievementNotification } from './AchievementNotification';
import { parseAchievementNotifications } from './achievementNotifications';
import type { Profile } from './profiles';

const player: Profile = {
  id: '00000000-0000-4000-a000-000000000001',
  first_name: 'Ada',
  last_name: 'Testowa',
  hook: 'ada-testowa-a001',
  role: 'admin',
  avatar_path: null,
  deleted_at: null,
};
const unlocks = ['meet-1', 'win-1', 'beginners-luck', 'hattrick'].map((achievement_id) => ({
  profile_id: player.id,
  achievement_id,
}));

describe('powiadomienia osiągnięć', () => {
  it('odrzuca nieznane i błędne odznaki oraz duplikaty, zachowuje różnych graczy', () => {
    const another = { ...unlocks[0], profile_id: '00000000-0000-4000-a000-000000000002' };
    expect(
      parseAchievementNotifications({
        unlocks: [
          ...unlocks,
          unlocks[0],
          another,
          null,
          {},
          { profile_id: player.id, achievement_id: 'future' },
          { profile_id: 'bad', achievement_id: 'win-1' },
        ],
      }),
    ).toEqual([...unlocks, another]);
    expect(parseAchievementNotifications(null)).toEqual([]);
    expect(parseAchievementNotifications({ unlocks: {} })).toEqual([]);
  });

  it('zachowuje wszystkie linki, ogłasza listę, deduplikuje wynik i wstrzymuje timer przy fokusie', () => {
    vi.useFakeTimers();
    try {
      const open = vi.fn();
      function Trigger() {
        const toast = useToast();
        return (
          <button
            onClick={() =>
              toast.show(
                <AchievementNotification
                  unlocks={unlocks}
                  profiles={new Map([[player.id, player]])}
                  open={open}
                />,
                'success',
                { rich: true, key: 'request-1', duration: 1000 },
              )
            }
          >
            zapisz
          </button>
        );
      }
      render(
        <ToastProvider>
          <Trigger />
        </ToastProvider>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'zapisz' }));
      fireEvent.click(screen.getByRole('button', { name: 'zapisz' }));
      const list = screen.getByRole('list', { name: 'Nowo odblokowane osiągnięcia' });
      const links = within(list).getAllByRole('link');
      const firstLink = links[0];
      if (!firstLink) throw new Error('Brak linku osiągnięcia');
      expect(links).toHaveLength(4);
      expect(list.closest('[aria-live]')).toHaveAttribute('aria-live', 'polite');
      fireEvent.click(firstLink);
      expect(open).toHaveBeenCalledWith({
        kind: 'achievement',
        profileId: player.id,
        id: 'meet-1',
      });
      fireEvent.click(firstLink, { ctrlKey: true });
      expect(open).toHaveBeenCalledTimes(1);
      act(() => firstLink.focus());
      act(() => vi.advanceTimersByTime(2000));
      expect(list).toBeInTheDocument();
      act(() => screen.getByRole('button', { name: 'zapisz' }).focus());
      act(() => vi.advanceTimersByTime(1000));
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'zapisz' }));
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
