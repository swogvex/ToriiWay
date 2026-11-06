// The video player (components/community/VideoPlayer.astro): a click on a video link inside
// `root` opens the dialog with a youtube-nocookie iframe; closing it removes the iframe
// (playback stops) and returns focus to the link. Nothing reaches YouTube before a click.
// A link is `[data-video-open]` inside an element with `data-video-id` that holds the
// title in `[data-video-title]` (the element can be the link itself).

import { embedUrl } from './videos';

export function initPlayer(root: HTMLElement): void {
  const dialog = document.querySelector<HTMLDialogElement>('#video-player');
  const frame = dialog?.querySelector<HTMLElement>('[data-player-frame]');
  const heading = dialog?.querySelector<HTMLElement>('#video-player-title');
  if (!dialog || !frame) return;

  let opener: HTMLElement | null = null;

  root.addEventListener('click', (event) => {
    const link = (event.target as Element | null)?.closest<HTMLElement>('[data-video-open]');
    const video = link?.closest<HTMLElement>('[data-video-id]');
    const id = video?.dataset.videoId;
    if (!link || !video || !id) return;
    event.preventDefault();
    const title = video.querySelector('[data-video-title]')?.textContent?.trim() ?? '';
    const iframe = document.createElement('iframe');
    iframe.src = embedUrl(id);
    iframe.title = title;
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    if (heading) heading.textContent = title;
    frame.replaceChildren(iframe);
    opener = link;
    dialog.showModal();
  });

  dialog.addEventListener('close', () => {
    frame.replaceChildren();
    opener?.focus();
    opener = null;
  });

  markVideoLinks(root);
}

/** Tells assistive tech the links open a dialog (only true once the player is ready). */
export function markVideoLinks(root: ParentNode): void {
  for (const link of root.querySelectorAll<HTMLElement>('[data-video-open]')) {
    link.setAttribute('aria-haspopup', 'dialog');
  }
}
