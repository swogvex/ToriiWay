// Loads Cloudflare Turnstile on demand (only after the visitor opens a form that needs it)
// and renders one widget, keeping the latest token.

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface Turnstile {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  reset(widget?: string): void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let loading: Promise<Turnstile | null> | undefined;

function loadTurnstile(): Promise<Turnstile | null> {
  loading ??= new Promise((resolve) => {
    if (window.turnstile) return resolve(window.turnstile);
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.addEventListener('load', () => resolve(window.turnstile ?? null));
    script.addEventListener('error', () => resolve(null));
    document.head.append(script);
  });
  return loading;
}

export interface Widget {
  token(): string;
  reset(): void;
}

/** Renders the widget in `box` (once) and returns its token holder; null if it failed to load. */
export async function turnstileWidget(box: HTMLElement, siteKey: string): Promise<Widget | null> {
  const turnstile = await loadTurnstile();
  if (!turnstile) return null;
  let token = '';
  const id = turnstile.render(box, {
    sitekey: siteKey,
    theme: 'auto',
    callback: (value: string) => {
      token = value;
    },
    'expired-callback': () => {
      token = '';
    },
  });
  return {
    token: () => token,
    reset: () => {
      token = '';
      turnstile.reset(id);
    },
  };
}
