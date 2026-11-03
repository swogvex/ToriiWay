export type System = 'windows' | 'mac' | 'android' | 'ios' | 'linux';

/** The visitor's operating system, for the voice instructions; null when unknown. */
export function detectSystem(userAgent: string): System | null {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  if (/Windows/i.test(userAgent)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'mac';
  if (/Linux|X11|CrOS/i.test(userAgent)) return 'linux';
  return null;
}
