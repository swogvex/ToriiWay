/**
 * Inline <head> script that applies a manually chosen theme before first paint.
 * Without a stored choice, CSS light-dark() follows prefers-color-scheme on its own.
 * Its SHA-256 is allowed in the CSP (vercel.json); prepaint.test.ts keeps both in sync.
 */
export const THEME_STORAGE_KEY = 'theme';

export const THEME_PREPAINT_SCRIPT = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;
