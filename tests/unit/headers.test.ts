import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

interface VercelConfig {
  headers: { source: string; headers: { key: string; value: string }[] }[];
}

const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as VercelConfig;
const all = vercel.headers.find((rule) => rule.source === '/(.*)')?.headers ?? [];
const header = (key: string) => all.find((entry) => entry.key === key)?.value;

/** The CSP as a map of directive → sources. */
function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp
      .split(';')
      .map((part) => part.trim().split(/\s+/))
      .filter(([name]) => name)
      .map(([name, ...sources]) => [name ?? '', sources]),
  );
}

describe('security headers in vercel.json (13-security)', () => {
  it('enforces the CSP on every route, never report-only', () => {
    expect(header('Content-Security-Policy')).toBeDefined();
    expect(header('Content-Security-Policy-Report-Only')).toBeUndefined();
  });

  it('keeps the CSP strict', () => {
    const csp = directives(header('Content-Security-Policy') ?? '');
    for (const sources of csp.values()) {
      expect(sources).not.toContain("'unsafe-inline'");
      expect(sources).not.toContain("'unsafe-eval'");
      expect(sources).not.toContain('*');
    }
    expect(csp.get('default-src')).toEqual(["'self'"]);
    expect(csp.get('style-src')).toEqual(["'self'"]);
    expect(csp.get('object-src')).toEqual(["'none'"]);
    expect(csp.get('base-uri')).toEqual(["'none'"]);
    expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
    expect(csp.get('form-action')).toEqual(["'self'"]);
    expect(csp.has('upgrade-insecure-requests')).toBe(true);
  });

  it('sends the rest of the A+ header set', () => {
    expect(header('Strict-Transport-Security')).toMatch(/^max-age=63072000; includeSubDomains/);
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(header('Permissions-Policy')).toContain('camera=()');
    expect(header('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(header('Cross-Origin-Resource-Policy')).toBe('same-origin');
    expect(header('X-Frame-Options')).toBe('DENY');
  });
});
