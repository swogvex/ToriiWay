import { describe, expect, it, vi } from 'vitest';

const play = vi.fn();
const unlock = vi.fn(() => Promise.resolve(true));
vi.mock('cuelume', () => ({ play, unlock }));

const { GameSound, loadCuelume } = await import('./sound');

const bubble = {} as never;

describe('GameSound', () => {
  it('stays silent and loads nothing when sound is off', async () => {
    const sound = new GameSound(false);
    await loadCuelume();
    sound.react({ type: 'pop', bubble });
    sound.unlock();
    expect(play).not.toHaveBeenCalled();
    expect(unlock).not.toHaveBeenCalled();
  });

  it('maps run events to cues', async () => {
    const sound = new GameSound(true);
    await loadCuelume();
    await Promise.resolve();
    sound.unlock();
    sound.react({ type: 'key', key: 'k', correct: true, bubble: null });
    sound.react({ type: 'key', key: 'q', correct: false, bubble: null });
    sound.react({ type: 'pop', bubble });
    sound.react({ type: 'miss', bubble });
    sound.react({ type: 'life', lives: 4 });
    sound.react({ type: 'end', status: 'cleared' });
    expect(unlock).toHaveBeenCalledOnce();
    expect(play.mock.calls).toEqual([
      ['type', { emphasis: 'subtle', key: 'printable' }],
      ['error', { emphasis: 'subtle' }],
      ['success', { emphasis: 'subtle' }],
      ['error'],
      ['success', { emphasis: 'strong' }],
    ]);
  });
});
