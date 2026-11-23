import { expect, test } from '@playwright/test';

test('public demo screens fixed mail samples under a strict CSP', async ({
  page,
  browser,
  baseURL,
}) => {
  const response = await page.goto('/');
  const policy = response?.headers()['content-security-policy'];
  expect(policy).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(policy).not.toContain('unsafe-inline');
  expect(policy).not.toContain('unsafe-eval');

  await page.getByRole('button', { name: 'Try the demo, no signup' }).click();
  await expect(
    page.getByRole('heading', { name: 'Demo workspace' }),
  ).toBeVisible();
  const [labPage] = await Promise.all([
    page.waitForResponse(
      (request) =>
        request.url() === baseURL + '/security-lab' &&
        request.request().isNavigationRequest(),
    ),
    page.getByRole('link', { name: 'Security Lab' }).click(),
  ]);
  expect(labPage.headers()['content-security-policy']).not.toBe(policy);
  await page.getByRole('button', { name: 'Check restricted sample' }).click();
  const result = page.getByRole('status');
  await expect(result).toContainText('Egress · blocked');
  await expect(result).toContainText('1 attempt · 1 blocked');
  await page.getByText('Decision trace').click();
  await expect(result).toContainText(
    'Sensitive data cannot leave through mock mail.',
  );
  await page.getByRole('button', { name: 'Check routine sample' }).click();
  await expect(result).toContainText('Egress · allowed');
  await expect(result).toContainText('2 attempts · 1 blocked');

  const other = await browser.newContext({ baseURL });
  try {
    const endpoint = '/api/security-lab';
    const headers = { Origin: baseURL! };
    const sample = { fixture: 'routine' };
    expect(
      (await other.request.post(endpoint, { headers, data: sample })).status(),
    ).toBe(401);
    expect(
      (await other.request.post('/api/sandbox', { headers })).status(),
    ).toBe(201);
    expect(
      (
        await other.request.post(endpoint, {
          headers,
          data: { ...sample, body: 'custom text' },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await other.request.post(endpoint, {
          headers,
          data: { ...sample, body: 'x'.repeat(1024) },
        })
      ).status(),
    ).toBe(413);
    const independent = await other.request.post(endpoint, {
      headers,
      data: sample,
    });
    expect(independent.ok()).toBe(true);
    expect(await independent.json()).toMatchObject({ attempts: 1, blocked: 0 });
  } finally {
    await other.close();
  }
});
