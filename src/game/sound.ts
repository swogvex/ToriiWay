// Game sounds with cuelume (synthesized with Web Audio, no audio files). The library is
// loaded only when sound is on; browsers start audio after a key or click, so the first
// cues of a run may stay silent until the player types.

import type { RunEvent } from './run';

type Cuelume = typeof import('cuelume');

let loading: Promise<Cuelume> | null = null;

/** Loads cuelume once. */
export function loadCuelume(): Promise<Cuelume> {
  loading ??= import('cuelume');
  return loading;
}

/** Start beeps: three short low ones for 3 · 2 · 1, a long high one for 始め!. */
const BEEP = { count: { hz: 440, seconds: 0.18 }, go: { hz: 880, seconds: 0.6 } } as const;
const BEEP_VOLUME = 0.12;
/** How long to wait for the browser to start audio before asking for a key. */
const RESUME_WAIT_MS = 150;

export class GameSound {
  private lib: Cuelume | null = null;
  private context: AudioContext | null = null;
  private readonly loaded: Promise<void>;

  constructor(private readonly enabled: boolean) {
    this.loaded = enabled
      ? loadCuelume().then(
          (lib) => {
            this.lib = lib;
          },
          () => undefined,
        )
      : Promise.resolve();
  }

  /** Call from a key or click: starts audio where the browser allows it. */
  unlock(): void {
    void this.lib?.unlock();
    void this.context?.resume();
  }

  /**
   * True when sound is off or audio can play now. Browsers keep audio blocked until
   * the player presses something on the page; then the countdown asks for a key.
   */
  async ready(): Promise<boolean> {
    if (!this.enabled) return true;
    await this.loaded;
    if (typeof AudioContext === 'undefined') return true;
    this.context ??= new AudioContext();
    const context = this.context;
    // A function, so the check after resume() reads the state again.
    const running = () => context.state === 'running';
    if (running()) return true;
    // resume() stays pending while the browser blocks audio, so do not wait forever.
    await Promise.race([
      context.resume().catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, RESUME_WAIT_MS)),
    ]);
    return running();
  }

  /** One countdown beep; `go` is the long high one. */
  beep(go: boolean): void {
    const context = this.context;
    if (!this.enabled || !context || context.state !== 'running') return;
    const { hz, seconds } = go ? BEEP.go : BEEP.count;
    const start = context.currentTime;
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = hz;
    // A square wave through a low-pass: the classic start beep, softened.
    filter.type = 'lowpass';
    filter.frequency.value = hz * 4;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(BEEP_VOLUME, start + 0.01);
    gain.gain.setValueAtTime(BEEP_VOLUME, start + seconds * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    oscillator.connect(filter).connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + seconds + 0.02);
  }

  /** Correct key → tap of a key, wrong key → soft error, pop → success, miss → error. */
  react(event: RunEvent): void {
    const lib = this.lib;
    if (!lib) return;
    switch (event.type) {
      case 'key':
        if (event.correct) lib.play('type', { emphasis: 'subtle', key: 'printable' });
        else lib.play('error', { emphasis: 'subtle' });
        break;
      case 'pop':
        lib.play('success', { emphasis: 'subtle' });
        break;
      case 'miss':
        lib.play('error');
        break;
      case 'level':
        lib.play('success', { emphasis: 'strong' });
        break;
      case 'end':
        if (event.status === 'cleared') lib.play('success', { emphasis: 'strong' });
        else if (event.status === 'failed') lib.play('error', { emphasis: 'strong' });
        else lib.play('close');
        break;
      default:
        break;
    }
  }
}
