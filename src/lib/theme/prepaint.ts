/**
 * Inline <head> script that applies stored UI choices before first paint: a manually
 * chosen theme and the expanded rail. Without a stored theme, CSS light-dark() follows
 * prefers-color-scheme on its own.
 * Its SHA-256 is allowed in the CSP (vercel.json); prepaint.test.ts keeps both in sync.
 */
export const THEME_STORAGE_KEY = 'nnt:v1:theme';
export const RAIL_STORAGE_KEY = 'nnt:v1:rail';

export const THEME_PREPAINT_SCRIPT = `try{var d=document.documentElement,s=localStorage,t=s.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark')d.dataset.theme=t;if(s.getItem('${RAIL_STORAGE_KEY}')==='expanded')d.dataset.rail='expanded'}catch(e){}`;
