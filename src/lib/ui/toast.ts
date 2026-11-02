/** Shows a message in the page's toast live region (components/ui/Toast.astro). */
const TOAST_DURATION_MS = 5000;

let hideTimer: ReturnType<typeof setTimeout> | undefined;

export function showToast(message: string): void {
  const region = document.querySelector<HTMLElement>('[data-toast-region]');
  if (!region) return;
  const toast = document.createElement('p');
  toast.className = 'toast';
  toast.textContent = message;
  region.replaceChildren(toast);
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => region.replaceChildren(), TOAST_DURATION_MS);
}
