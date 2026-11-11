import { expect, test } from '@playwright/test';

const CONTACT = 'git.swogvex@gmail.com';

const PAGES = [
  { path: '/privacy', title: 'Privacy policy', es: 'Política de privacidad' },
  { path: '/legal', title: 'Legal notice', es: 'Aviso legal' },
  { path: '/accessibility', title: 'Accessibility statement', es: 'Declaración de accesibilidad' },
  { path: '/terms', title: 'Terms of use', es: 'Condiciones de uso' },
];

test.describe('legal pages', () => {
  for (const { path, title, es } of PAGES) {
    test(`${path} exists in both languages with the contact address`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('h1')).toHaveText(title);
      await expect(page.locator(`a[href="mailto:${CONTACT}"]`).first()).toBeVisible();
      await expect(page.locator('.legal__updated time')).toHaveAttribute(
        'datetime',
        /^\d{4}-\d{2}-\d{2}$/,
      );
      await expect(page.locator('[data-lang-link="es"]').first()).toHaveAttribute(
        'href',
        `/es${path}`,
      );

      await page.goto(`/es${path}`);
      await expect(page.locator('html')).toHaveAttribute('lang', 'es');
      await expect(page.locator('h1')).toHaveText(es);
      await expect(page.locator('[data-untranslated]')).toHaveCount(0);
    });
  }

  test('every footer link leads to a page', async ({ page, request }) => {
    for (const home of ['/', '/es']) {
      await page.goto(home);
      const hrefs = await page
        .locator('footer a[href^="/"]')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
      expect(hrefs.length).toBeGreaterThan(4);
      for (const href of hrefs) {
        expect((await request.get(href)).status(), href).toBe(200);
      }
    }
  });

  test('security.txt names the contact and has not expired', async ({ request }) => {
    const response = await request.get('/.well-known/security.txt');
    expect(response.status()).toBe(200);
    const text = await response.text();
    expect(text).toContain(`Contact: mailto:${CONTACT}`);
    expect(text).toContain('Preferred-Languages: en, es');
    const expires = /^Expires: (.+)$/m.exec(text)?.[1] ?? '';
    const days = (Date.parse(expires) - Date.now()) / 86_400_000;
    // RFC 9116 asks for less than a year; renew it before it runs out.
    expect(days).toBeGreaterThan(30);
    expect(days).toBeLessThan(366);
  });
});
