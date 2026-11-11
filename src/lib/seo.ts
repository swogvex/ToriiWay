/** Same shape as the header's Crumb (components/shell/Header.astro). */
interface Crumb {
  label: string;
  href?: string;
}

/**
 * BreadcrumbList JSON-LD for the header breadcrumb (15-quality). The current page, which
 * the breadcrumb shows without a link, takes `pageUrl`.
 */
export function breadcrumbList(crumbs: readonly Crumb[], site: URL, pageUrl: URL) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.label,
      item: crumb.href ? new URL(crumb.href, site).href : pageUrl.href,
    })),
  };
}

/** Several JSON-LD nodes in one script. */
export function jsonLdGraph(...nodes: Record<string, unknown>[]) {
  return { '@context': 'https://schema.org', '@graph': nodes };
}

/** Longest `<title>` and meta description (15-quality: SEO rules). */
export const MAX_TITLE = 60;
export const MAX_DESCRIPTION = 160;

/**
 * Joins title parts with " · ". When the result is too long, the parts between the first
 * and the last (the section) go first, then the last (the site name). The page's own name
 * always stays whole, even when it alone is longer than the limit.
 */
export function pageTitle(...parts: string[]): string {
  const [own = '', ...rest] = parts;
  for (let keep = rest.length; keep >= 0; keep--) {
    const kept = keep === rest.length ? rest : rest.slice(rest.length - keep);
    const title = [own, ...kept].join(' · ');
    if (title.length <= MAX_TITLE || keep === 0) return title;
  }
  return own;
}

/** Text for a meta description: whole if it fits, else cut at a word with an ellipsis. */
export function metaDescription(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= MAX_DESCRIPTION) return clean;
  const cut = clean.slice(0, MAX_DESCRIPTION - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, '')}…`;
}
