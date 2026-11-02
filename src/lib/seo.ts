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
