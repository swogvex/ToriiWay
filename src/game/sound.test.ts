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

describe('GameSound countdown', () => {
  it('needs no key and makes no beep when sound is off', async () => {
    const sound = new GameSound(false);
    expect(await sound.ready()).toBe(true);
    expect(() => sound.beep(true)).not.toThrow();
  });

  it('asks for a key while the browser blocks audio, then beeps low, low, low, high', async () => {
    const frequencies: number[] = [];
    let state = 'suspended';
    const param = () => ({
      value: 0,
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    });
    const node = () => ({ connect: (next: unknown) => next });
    class FakeContext {
      currentTime = 0;
      destination = {};
      get state() {
        return state;
      }
      resume() {
        return new Promise<void>(() => undefined);
      }
      createOscillator() {
        const frequency = param();
        return {
          ...node(),
          type: '',
          frequency,
          start: () => frequencies.push(frequency.value),
          stop: vi.fn(),
        };
      }
      createBiquadFilter() {
        return { ...node(), type: '', frequency: param() };
      }
      createGain() {
        return { ...node(), gain: param() };
      }
    }
    vi.stubGlobal('AudioContext', FakeContext);
    const sound = new GameSound(true);
    expect(await sound.ready()).toBe(false);
    state = 'running';
    expect(await sound.ready()).toBe(true);
    [false, false, false, true].forEach((go) => sound.beep(go));
    expect(frequencies).toEqual([440, 440, 440, 880]);
    vi.unstubAllGlobals();
  });
});
