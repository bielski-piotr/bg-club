import { fireEvent, render, screen } from '@solidjs/testing-library';
import { flush } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import { club, members } from '../data/fixtures';
import { format, t } from '../i18n';
import { fullName } from '../model/member';
import { AppHeader } from './AppHeader';

const me = members[0];

function setup() {
  const onOpenProfile = vi.fn();
  render(() => <AppHeader club={club} me={me} onOpenProfile={onOpenProfile} />);
  const trigger = screen.getByRole('button', {
    name: format(t.avatarMenu.trigger, { name: fullName(me) }),
  });
  return { trigger, onOpenProfile };
}

describe('menu konta w nagłówku', () => {
  it('kliknięcie awatara otwiera menu, a wybór pozycji uruchamia akcję i je zamyka', () => {
    const { trigger, onOpenProfile } = setup();
    fireEvent.click(trigger);
    flush();
    const profile = screen.getByRole('menuitem', { name: t.avatarMenu.profile });
    // Fokus w menu: klawiatura i czytnik ekranu od razu są na pierwszej pozycji.
    expect(profile).toHaveFocus();

    fireEvent.click(profile);
    flush();
    expect(onOpenProfile).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Esc zamyka menu i oddaje fokus awatarowi', () => {
    const { trigger } = setup();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    flush();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    flush();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('dotknięcie poza menu je zamyka', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    flush();
    fireEvent.pointerDown(document.body);
    flush();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
