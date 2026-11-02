import { showToast } from '../ui/toast';
import { loadVoices, pickJapaneseVoice, speak } from './speech';

const NOTICE_KEY = 'nnt:v1:no-ja-voice';

function noticeShown(): boolean {
  try {
    if (localStorage.getItem(NOTICE_KEY)) return true;
    localStorage.setItem(NOTICE_KEY, '1');
  } catch {
    // Without storage the notice may repeat on the next visit; that is acceptable.
  }
  return false;
}

/**
 * Listen buttons: `[data-listen="か"]`, optionally with `data-listen-audio` for a
 * recorded file, which wins. They start hidden and appear once a Japanese voice (or a
 * recording) exists; without either, a one-time notice explains why there is no Listen.
 */
export async function initListen(root: ParentNode = document): Promise<void> {
  const buttons = () => [...root.querySelectorAll<HTMLElement>('[data-listen]')];
  if (buttons().length === 0) return;

  const voice = pickJapaneseVoice(await loadVoices());
  for (const button of buttons()) {
    button.hidden = !voice && !button.dataset.listenAudio;
  }
  if (!voice && buttons().every((button) => button.hidden) && !noticeShown()) {
    showToast(document.querySelector<HTMLElement>('[data-no-voice]')?.dataset.noVoice ?? '');
  }

  root.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLElement>('[data-listen]');
    if (!button) return;
    if (button.dataset.listenAudio) {
      void new Audio(button.dataset.listenAudio).play();
    } else if (voice && button.dataset.listen) {
      speak(button.dataset.listen, voice);
    }
  });
}
