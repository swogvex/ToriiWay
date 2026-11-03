export type KeyboardLayout = 'ansi' | 'iso-es';

export const KEYBOARD_LAYOUTS: readonly KeyboardLayout[] = ['ansi', 'iso-es'];

/** Letter rows of the virtual keyboard. ISO-ES adds ñ after l; "-" types ー. */
export const KEY_ROWS: Readonly<Record<KeyboardLayout, readonly (readonly string[])[]>> = {
  ansi: [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', '-'],
  ],
  'iso-es': [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ñ'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', '-'],
  ],
};

const FLASH: KeyframeAnimationOptions = { duration: 250, easing: 'ease-out' };
// Hold the colour briefly, then fade over the last 150 ms.
const FLASH_FRAMES: Keyframe[] = [{ opacity: 1 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }];

/** Lights the pressed key: info for a correct key, accent for a wrong one. */
export class VirtualKeyboard {
  private readonly keys = new Map<string, HTMLElement>();

  constructor(root: HTMLElement) {
    for (const key of root.querySelectorAll<HTMLElement>('[data-key]')) {
      this.keys.set(key.dataset['key'] ?? '', key);
    }
  }

  flash(key: string, correct: boolean): void {
    const el = this.keys.get(key.toLowerCase());
    const flash = el?.querySelector<HTMLElement>('[data-flash]');
    if (!el || !flash) return;
    el.dataset['state'] = correct ? 'correct' : 'wrong';
    flash.getAnimations().forEach((animation) => animation.cancel());
    flash.animate(FLASH_FRAMES, FLASH);
  }
}
