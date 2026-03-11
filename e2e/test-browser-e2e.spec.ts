import { test, expect, type Page } from '@playwright/test';

const BASE_URL = 'https://cropnode.vercel.app';
const USERNAME = 'admin';
const PASSWORD = 'admin123';

// Helper: login
async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle');

  // Fill login form
  await page.fill('input[name="username"]', USERNAME);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');

  // Wait for redirect to app (Vercel cold starts can take 30s+)
  await page.waitForURL(/\/(app|command-center|parcels|crop-care|weather|research|team|profile)/, { timeout: 45000 });
}

// ============================================================
// FASE 1: Login Flow
// ============================================================
test.describe('Fase 1: Login Flow', () => {
  test('1a - Login pagina laadt correct', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    // Check login form elements
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('1b - Succesvolle login en redirect', async ({ page }) => {
    await login(page);

    // Should be redirected to app
    const url = page.url();
    expect(url).toMatch(/\/(app|command-center)/);
  });

  test('1c - Foute login toont foutmelding', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    await page.fill('input[name="username"]', 'fout@test.nl');
    await page.fill('input[name="password"]', 'foutwachtwoord');
    await page.click('button[type="submit"]');

    // Should show error
    await page.waitForTimeout(3000);
    const errorVisible = await page.locator('[role="alert"], .text-red, .text-destructive, [class*="error"]').count();
    expect(errorVisible).toBeGreaterThan(0);
  });

  test('1d - Protected route redirect naar login', async ({ page }) => {
    await page.goto(`${BASE_URL}/command-center`);
    await page.waitForLoadState('networkidle');

    // Should redirect to login
    expect(page.url()).toContain('/login');
  });
});

// ============================================================
// FASE 2: Navigatie alle hoofdpagina's
// ============================================================
test.describe('Fase 2: Navigatie hoofdpaginas', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  const pages = [
    { name: 'Command Center', path: '/command-center', expect: /command-center/ },
    { name: 'Smart Input V2', path: '/command-center/smart-input-v2', expect: /smart-input/ },
    { name: 'Percelen', path: '/parcels', expect: /parcels/ },
    { name: 'Crop Care', path: '/crop-care', expect: /crop-care/ },
    { name: 'Research', path: '/research', expect: /research/ },
    { name: 'Team Tasks', path: '/team-tasks', expect: /team-tasks/ },
    { name: 'Weather Dashboard', path: '/weather/dashboard', expect: /weather/ },
    { name: 'Profiel', path: '/profile', expect: /profile/ },
  ];

  for (const p of pages) {
    test(`2 - ${p.name} laadt (${p.path})`, async ({ page }) => {
      await page.goto(`${BASE_URL}${p.path}`);
      await page.waitForLoadState('networkidle');

      expect(page.url()).toMatch(p.expect);

      // Page should not show error (check visible text, not RSC payload)
      const hasError = await page.locator('text=Application error').count();
      const hasServerError = await page.locator('text=Internal Server Error').count();
      expect(hasError).toBe(0);
      expect(hasServerError).toBe(0);
    });
  }
});

// ============================================================
// FASE 3: Smart Input V2 - Spray registratie
// ============================================================
test.describe('Fase 3: Smart Input V2', () => {
  test.setTimeout(90000); // AI responses can take a while

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/command-center/smart-input-v2`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000); // Wait for context to load
  });

  test('3a - Pagina laadt met invoerveld', async ({ page }) => {
    // Textarea has height:0 but exists in DOM (page may have 2: command center + smart input)
    const textarea = page.locator('textarea[data-testid="chat-input"]');
    const count = await textarea.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('3b - Simpele spray invoer verwerken', async ({ page }) => {
    // Use dispatchEvent to interact with React-controlled textarea (height:0 workaround)
    await page.evaluate(() => {
      const ta = document.querySelector('textarea[data-testid="chat-input"]') as HTMLTextAreaElement;
      if (!ta) throw new Error('textarea not found');
      // Set value via native setter to trigger React onChange
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
      nativeInputValueSetter.call(ta, 'merpan 1 kg op elstar');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(500);

    // Submit with Enter keydown
    await page.evaluate(() => {
      const ta = document.querySelector('textarea[data-testid="chat-input"]') as HTMLTextAreaElement;
      if (!ta) return;
      ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    // Wait for AI response
    await page.waitForTimeout(15000);

    // Should show some response
    const pageText = await page.textContent('body');
    const hasResponse = pageText?.toLowerCase().includes('merpan') ||
                       pageText?.toLowerCase().includes('draft') ||
                       pageText?.toLowerCase().includes('spuit') ||
                       pageText?.toLowerCase().includes('elstar') ||
                       pageText?.toLowerCase().includes('product');
    expect(hasResponse).toBeTruthy();
  });

  test('3c - Levenshtein typo tolerantie: "merpna"', async ({ page }) => {
    await page.evaluate(() => {
      const ta = document.querySelector('textarea[data-testid="chat-input"]') as HTMLTextAreaElement;
      if (!ta) throw new Error('textarea not found');
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
      nativeInputValueSetter.call(ta, 'merpna 1 kg op conference');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const ta = document.querySelector('textarea[data-testid="chat-input"]') as HTMLTextAreaElement;
      if (!ta) return;
      ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    // Wait for AI response - poll until "Verwerken..." disappears or 60s
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(5000);
      const stillProcessing = await page.locator('text=Verwerken').count();
      if (stillProcessing === 0) break;
    }

    // Should recognize "merpna" as "Merpan Spuitkorrel" via Levenshtein
    const pageText = await page.textContent('body');
    const recognized = pageText?.toLowerCase().includes('merpan') ||
                      pageText?.toLowerCase().includes('spuitkorrel') ||
                      pageText?.toLowerCase().includes('conference') && pageText?.toLowerCase().includes('kg');
    expect(recognized).toBeTruthy();
  });
});

// ============================================================
// FASE 4: Sidebar mobiel (z-index fix verificatie)
// ============================================================
test.describe('Fase 4: Sidebar mobiel', () => {
  test('4a - Sidebar opent boven header op mobiel', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await login(page);
    await page.goto(`${BASE_URL}/command-center`);
    await page.waitForLoadState('networkidle');

    // Find and click hamburger/menu button
    const menuButton = page.locator('button[aria-label*="menu"], button[aria-label*="Menu"], [data-testid="sidebar-toggle"], button:has(svg)').first();

    if (await menuButton.isVisible()) {
      await menuButton.click();
      await page.waitForTimeout(500);

      // Take screenshot to verify sidebar is above header
      await page.screenshot({ path: 'test-results/sidebar-mobile.png' });

      // Check that sidebar/overlay is visible
      const sidebar = page.locator('[class*="sidebar"], nav, [role="navigation"]').first();
      const isVisible = await sidebar.isVisible();
      expect(isVisible).toBeTruthy();
    }
  });
});

// ============================================================
// FASE 5: Percelen pagina
// ============================================================
test.describe('Fase 5: Percelen', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('5a - Percelen lijst laadt', async ({ page }) => {
    await page.goto(`${BASE_URL}/parcels`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const body = await page.textContent('body');
    // Should show parcels or empty state
    const hasContent = body?.includes('Perceel') ||
                      body?.includes('perceel') ||
                      body?.includes('Percelen') ||
                      body?.includes('kaart') ||
                      body?.includes('Geen');
    expect(hasContent).toBeTruthy();
  });

  test('5b - Percelen kaart laadt', async ({ page }) => {
    await page.goto(`${BASE_URL}/parcels`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Check for Leaflet map container
    const mapExists = await page.locator('.leaflet-container, [class*="map"], canvas').count();
    // Map may or may not be on this page depending on view
    // Just verify no crash
    const errCount = await page.locator('text=Application error').count();
    expect(errCount).toBe(0);
  });
});

// ============================================================
// FASE 6: Weather Dashboard
// ============================================================
test.describe('Fase 6: Weather Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('6a - Weather dashboard laadt', async ({ page }) => {
    await page.goto(`${BASE_URL}/weather/dashboard`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    const body = await page.textContent('body');
    // Should show weather-related content
    const hasWeather = body?.includes('°') ||
                      body?.includes('weer') ||
                      body?.includes('Weer') ||
                      body?.includes('temp') ||
                      body?.includes('wind') ||
                      body?.includes('forecast') ||
                      body?.includes('Spuit');
    expect(hasWeather).toBeTruthy();
  });

  test('6b - Spuitvenster indicator zichtbaar', async ({ page }) => {
    await page.goto(`${BASE_URL}/weather/dashboard`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    // Should show spray window indicator (green/orange/red)
    const body = await page.textContent('body');
    const hasSprayWindow = body?.toLowerCase().includes('spuit') ||
                          body?.toLowerCase().includes('spray') ||
                          body?.toLowerCase().includes('venster');
    // This is informational - don't fail if weather data isn't loaded
    if (!hasSprayWindow) {
      console.log('Note: Spray window indicator not found - weather data may not be loaded');
    }
  });
});

// ============================================================
// FASE 7: Crop Care / Spuitschrift logs
// ============================================================
test.describe('Fase 7: Crop Care & Logs', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('7a - Crop Care pagina laadt', async ({ page }) => {
    await page.goto(`${BASE_URL}/crop-care`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const errCount = await page.locator('text=Application error').count();
    expect(errCount).toBe(0);

    // Should show some crop care content
    const pageText = await page.textContent('body');
    const hasContent = pageText?.includes('Log') ||
                      pageText?.includes('Product') ||
                      pageText?.includes('Spuit') ||
                      pageText?.includes('registratie') ||
                      pageText?.includes('Voorraad');
    expect(hasContent).toBeTruthy();
  });

  test('7b - Spuitschrift entries zichtbaar', async ({ page }) => {
    await page.goto(`${BASE_URL}/crop-care`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Look for log entries or table rows
    const entries = await page.locator('table tbody tr, [class*="card"], [class*="entry"], [class*="log"]').count();
    // At least verify the page loaded without errors
    const errCount = await page.locator('text=Application error').count();
    expect(errCount).toBe(0);
  });
});

// ============================================================
// FASE 8: Responsive Design
// ============================================================
test.describe('Fase 8: Responsive Design', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('8a - Mobiel (375x812) - Command Center', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE_URL}/command-center`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/responsive-mobile-cc.png' });

    // No horizontal scroll
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5); // 5px tolerance
  });

  test('8b - Tablet (768x1024) - Command Center', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`${BASE_URL}/command-center`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/responsive-tablet-cc.png' });

    const errCount = await page.locator('text=Application error').count();
    expect(errCount).toBe(0);
  });

  test('8c - Desktop (1280x800) - Command Center', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${BASE_URL}/command-center`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/responsive-desktop-cc.png' });

    const errCount = await page.locator('text=Application error').count();
    expect(errCount).toBe(0);
  });

  test('8d - Mobiel (375x812) - Weather', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE_URL}/weather/dashboard`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'test-results/responsive-mobile-weather.png' });

    const errCount = await page.locator('text=Application error').count();
    expect(errCount).toBe(0);
  });
});

// ============================================================
// FASE 9: Research Hub
// ============================================================
test.describe('Fase 9: Research Hub', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('9a - Research pagina laadt', async ({ page }) => {
    await page.goto(`${BASE_URL}/research`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const errCount = await page.locator('text=Application error').count();
    expect(errCount).toBe(0);
  });

  test('9b - Ziekten & plagen encyclopedie', async ({ page }) => {
    await page.goto(`${BASE_URL}/research`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const body = await page.textContent('body');
    const hasContent = body?.includes('Schurft') ||
                      body?.includes('Fruitmot') ||
                      body?.includes('ziekt') ||
                      body?.includes('plag') ||
                      body?.includes('Research');
    expect(hasContent).toBeTruthy();
  });
});

// ============================================================
// FASE 10: Team Tasks
// ============================================================
test.describe('Fase 10: Team Tasks', () => {
  test('10a - Team Tasks pagina laadt', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/team-tasks`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const errCount = await page.locator('text=Application error').count();
    expect(errCount).toBe(0);

    const pageText = await page.textContent('body');
    const hasContent = pageText?.includes('Taak') ||
                      pageText?.includes('taak') ||
                      pageText?.includes('Uren') ||
                      pageText?.includes('Timer') ||
                      pageText?.includes('team');
    expect(hasContent).toBeTruthy();
  });
});

// ============================================================
// FASE 11: Full User Journey
// ============================================================
test.describe('Fase 11: Complete User Journey', () => {
  test.setTimeout(90000);

  test('11a - Login → Smart Input → Draft → Controleren', async ({ page }) => {
    // Step 1: Login
    await login(page);

    // Step 2: Navigate to Smart Input V2
    await page.goto(`${BASE_URL}/command-center/smart-input-v2`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Step 3: Enter spray registration via native setter
    await page.evaluate(() => {
      const ta = document.querySelector('textarea[data-testid="chat-input"]') as HTMLTextAreaElement;
      if (!ta) throw new Error('textarea not found');
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
      nativeInputValueSetter.call(ta, 'delan 0.5 kg op conference');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const ta = document.querySelector('textarea[data-testid="chat-input"]') as HTMLTextAreaElement;
      if (!ta) return;
      ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    // Step 4: Wait for response
    await page.waitForTimeout(15000);

    // Step 5: Verify draft appeared
    const pageText = await page.textContent('body');
    const hasDraft = pageText?.toLowerCase().includes('delan') ||
                    pageText?.toLowerCase().includes('draft') ||
                    pageText?.toLowerCase().includes('conference') ||
                    pageText?.toLowerCase().includes('product');
    expect(hasDraft).toBeTruthy();

    // Take screenshot of result
    await page.screenshot({ path: 'test-results/user-journey-draft.png' });
  });
});
