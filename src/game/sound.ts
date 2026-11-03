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

export class GameSound {
  private lib: Cuelume | null = null;

  constructor(enabled: boolean) {
    if (enabled) void loadCuelume().then((lib) => (this.lib = lib));
  }

  /** Call from a key or click: starts audio where the browser allows it. */
  unlock(): void {
    void this.lib?.unlock();
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
