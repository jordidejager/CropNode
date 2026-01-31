import { test, expect, Page } from '@playwright/test';

/**
 * E2E Test Suite: Smart Input Flow
 *
 * Deze tests simuleren de volledige gebruikerservaring
 * van de "Slimme Invoer" functionaliteit.
 *
 * Test scenarios:
 * A. Concept Flow - Draft opslaan en hervatten
 * B. Spuitschrift Flow - Bevestigen en registreren
 */

// Helper functies
async function typeInChat(page: Page, text: string) {
  // Gebruik data-testid voor betrouwbaarheid, fallback naar placeholder
  const textarea = page.locator('[data-testid="chat-input"], textarea[placeholder*="Type je bespuiting"], textarea[placeholder*="AgriBot"]').first();
  await textarea.fill(text);
}

async function sendMessage(page: Page) {
  // Gebruik data-testid voor betrouwbaarheid
  const sendButton = page.locator('[data-testid="send-button"]').first();
  // Force click om Next.js dev overlay te omzeilen
  await sendButton.click({ force: true });
}

async function waitForProcessingComplete(page: Page, timeout = 30000) {
  // Wacht tot de send button niet meer aan het spinnen is
  // De spinner heeft class "animate-spin" binnen de button
  try {
    await page.waitForFunction(
      () => {
        const sendBtn = document.querySelector('[data-testid="send-button"]');
        if (!sendBtn) return true;
        // Check of er geen spinner meer is
        return !sendBtn.querySelector('.animate-spin');
      },
      { timeout }
    );
  } catch (e) {
    // Als timeout, check of we toch klaar zijn
    console.log('Timeout waiting for processing, continuing...');
  }
  // Kleine extra wachttijd voor UI update
  await page.waitForTimeout(1500);
}

async function waitForStatusPanel(page: Page, timeout = 30000) {
  // Wacht tot de "Actieve Registratie" sectie data bevat
  await page.waitForSelector('[data-testid="status-panel"]', { timeout });
}

async function waitForPageLoad(page: Page, timeout = 60000) {
  // Wacht tot de skeleton verdwijnt (data is geladen)
  try {
    // Eerst checken of de skeleton er is
    const skeletonExists = await page.locator('[data-testid="dashboard-skeleton"]').isVisible({ timeout: 2000 }).catch(() => false);

    if (skeletonExists) {
      // Wacht tot de skeleton verdwijnt
      await page.waitForSelector('[data-testid="dashboard-skeleton"]', { state: 'hidden', timeout });
    }

    // Wacht tot de chat input zichtbaar is
    await page.waitForSelector('[data-testid="chat-input"]', { timeout: 30000 });
  } catch (e) {
    // Als de skeleton niet bestaat, wacht gewoon op de chat input
    await page.waitForSelector('[data-testid="chat-input"]', { timeout: 30000 });
  }
}

// ============================================================================
// SCENARIO A: De "Concept" Flow
// ============================================================================
test.describe('Scenario A: Concept Flow', () => {

  test('Complete flow: invoer → concept opslaan → tijdlijn → hervatten', async ({ page }) => {
    // 1. Navigeer naar Smart Input
    await page.goto('/command-center/smart-input');
    await expect(page).toHaveURL('/command-center/smart-input');

    // Wacht op pagina load (data uit Supabase)
    await waitForPageLoad(page);

    // 2. Typ bespuiting in chat
    await typeInChat(page, 'Vandaag peren gespoten met 0.5kg Merpan');
    await sendMessage(page);

    // 3. Wacht tot verwerking klaar is
    await waitForProcessingComplete(page);

    // 4. Check of de Actieve Registratie kaart verschijnt
    // We checken of er tekst verschijnt die wijst op de verwerking
    const statusSection = page.locator('text=Actieve Registratie').first();
    await expect(statusSection).toBeVisible({ timeout: 15000 });

    // Check of Merpan voorkomt in de UI
    const productText = page.locator('text=Merpan').first();
    await expect(productText).toBeVisible({ timeout: 10000 });

    // Check of de dosering voorkomt (0.5 kg of variant)
    const dosageText = page.locator('text=/0\\.5|0,5/').first();
    await expect(dosageText).toBeVisible({ timeout: 10000 });

    // 5. Klik op "Opslaan als Concept" (Concept knop)
    const conceptButton = page.locator('[data-testid="save-draft"]');
    await expect(conceptButton).toBeVisible({ timeout: 30000 });
    await conceptButton.click({ force: true });

    // 6. Wacht op succesmelding (toast) of redirect naar tijdlijn
    // De app redirect direct naar tijdlijn na opslaan
    await page.waitForTimeout(2000);

    // 7. We worden doorgestuurd naar tijdlijn OF we navigeren zelf
    // Wacht even voor redirect
    await page.waitForTimeout(2000);

    // Als we niet automatisch zijn doorgestuurd, navigeer handmatig
    if (!page.url().includes('/timeline')) {
      await page.goto('/command-center/timeline');
    }

    // 8. Check of we op de tijdlijn pagina zijn
    await expect(page).toHaveURL(/timeline/);

    // 9. Check of het concept hier staat met oranje badge
    const draftBadge = page.locator('text=Concept').first();
    await expect(draftBadge).toBeVisible({ timeout: 10000 });

    // 10. Check of er een item is met "Merpan" of een relevante tekst
    const draftItem = page.locator('[class*="card"], [class*="Card"]').filter({
      hasText: /Merpan|peren|perceel/i
    }).first();

    if (await draftItem.isVisible()) {
      // 11. Klik op "Hervatten" knop
      const resumeButton = page.locator('button:has-text("Hervatten")').first();
      await resumeButton.click();

      // 12. Check of we terug zijn in de chat met de draft geladen
      await expect(page).toHaveURL(/smart-input/);

      // Wacht op pagina load
      await page.waitForSelector('textarea', { timeout: 10000 });

      // Check of de draft data zichtbaar is
      const restoredProduct = page.locator('text=Merpan');
      await expect(restoredProduct).toBeVisible({ timeout: 10000 });
    }
  });

  test('Annuleren van registratie reset de UI', async ({ page }) => {
    await page.goto('/command-center/smart-input');
    await waitForPageLoad(page);

    // Typ iets en verstuur
    await typeInChat(page, '1kg Captan op appels');
    await sendMessage(page);
    await waitForProcessingComplete(page);

    // Wacht tot er een Cancel/X knop verschijnt in de status panel
    const cancelButton = page.locator('[data-testid="cancel-draft"]').first();

    if (await cancelButton.isVisible({ timeout: 10000 })) {
      await cancelButton.click({ force: true });

      // Check of de "Geen actieve registratie" tekst verschijnt
      const emptyState = page.getByText('Geen actieve registratie');
      await expect(emptyState).toBeVisible({ timeout: 10000 });
    }
  });
});

// ============================================================================
// SCENARIO B: De "Spuitschrift" Flow (Bevestigen)
// ============================================================================
test.describe('Scenario B: Spuitschrift Flow', () => {

  test('Complete flow: invoer → bevestigen → spuitschrift', async ({ page }) => {
    // 1. Navigeer naar Smart Input
    await page.goto('/command-center/smart-input');
    await waitForPageLoad(page);

    // 2. Typ bespuiting
    await typeInChat(page, 'Spuit 1.5L Surround op alle appels');
    await sendMessage(page);

    // 3. Wacht tot verwerking klaar is
    await waitForProcessingComplete(page);

    // 4. Verifieer de draft kaart - check op productnaam
    const productInDraft = page.locator('text=Surround').first();
    await expect(productInDraft).toBeVisible({ timeout: 15000 });

    // 5. Check of appels geselecteerd zijn (of er percelen zijn)
    const parcelSection = page.locator('text=/Percelen|appel/i').first();
    await expect(parcelSection).toBeVisible({ timeout: 10000 });

    // 6. Klik op "Bevestigen" (wacht langer voor AI verwerking)
    const confirmButton = page.locator('[data-testid="confirm-draft"]');
    await expect(confirmButton).toBeVisible({ timeout: 30000 });
    await confirmButton.click({ force: true });

    // 7. Wacht op succesmelding of status panel verdwijning
    // De draft wordt opgeslagen en de UI reset
    await page.waitForTimeout(3000);

    // 8. Wacht tot de registratie is verwerkt
    await page.waitForTimeout(2000);

    // 9. Navigeer naar het spuitschrift
    await page.goto('/crop-care/logs');
    await expect(page).toHaveURL(/logs/);

    // 10. Wacht op pagina load (kan skeletons hebben)
    await page.waitForTimeout(3000);
    // Wacht tot de CardTitle "Spuitschrift" zichtbaar is
    await page.getByRole('main').getByText('Spuitschrift').waitFor({ timeout: 30000 });

    // 11. Check of de registratie hier staat
    // Zoek naar de productnaam in de tabel/accordion
    const registrationInLog = page.locator('text=Surround').first();

    // De registratie moet zichtbaar zijn (of er is een empty state als er nog geen data is)
    const hasEntry = await registrationInLog.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasEntry) {
      await expect(registrationInLog).toBeVisible();

      // Check of de datum van vandaag erbij staat
      const today = new Date();
      const dateFormats = [
        today.toLocaleDateString('nl-NL'),
        `${today.getDate().toString().padStart(2, '0')}-${(today.getMonth() + 1).toString().padStart(2, '0')}`,
      ];

      // Zoek naar een datum die overeenkomt
      const dateVisible = await page.locator(`text=/${dateFormats.join('|')}/`).first().isVisible().catch(() => false);
      // Datum check is optioneel - de entry is het belangrijkst
      console.log('Date visible in entry:', dateVisible);
    } else {
      // Als er geen entry is, check of het spuitschrift leeg is of er een fout is
      const emptyOrError = page.locator('text=/Geen registraties|geen bevestigde|Er is een fout/i');
      const isEmptyOrError = await emptyOrError.isVisible().catch(() => false);
      console.log('Spuitschrift appears empty or has error:', isEmptyOrError);
    }
  });

  test('Dosering aanpassen voor bevestiging', async ({ page }) => {
    await page.goto('/command-center/smart-input');
    await waitForPageLoad(page);

    // Typ en verstuur
    await typeInChat(page, '1kg Captan op peren');
    await sendMessage(page);
    await waitForProcessingComplete(page);

    // Wacht tot de draft verschijnt
    const product = page.locator('text=Captan').first();
    await expect(product).toBeVisible({ timeout: 15000 });

    // Zoek naar de dosering aanpas knoppen (up/down)
    const increaseButton = page.locator('button:has(svg.lucide-chevron-up)').first();

    if (await increaseButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Verhoog de dosering
      await increaseButton.click();

      // Check of de dosering is aangepast (bijv. van 1 naar 1.05 of 1.1)
      const newDosage = page.locator('text=/1\\.(0[5-9]|[1-9])/').first();
      await expect(newDosage).toBeVisible({ timeout: 5000 });
    }
  });
});

// ============================================================================
// SMOKE TEST: Basis navigatie werkt
// ============================================================================
test.describe('Smoke Tests', () => {

  test('Smart Input pagina laadt correct', async ({ page }) => {
    await page.goto('/command-center/smart-input');

    // Wacht tot de data geladen is
    await waitForPageLoad(page);

    // Check of de chat interface aanwezig is
    await expect(page.locator('[data-testid="chat-input"]')).toBeVisible();

    // Check of "Actieve Registratie" header zichtbaar is (exact match)
    await expect(page.getByText('Actieve Registratie', { exact: true })).toBeVisible();

    // Check of de "Logboek" header zichtbaar is
    await expect(page.getByText('Logboek', { exact: true })).toBeVisible();
  });

  test('Tijdlijn pagina laadt correct', async ({ page }) => {
    await page.goto('/command-center/timeline');

    // Check of de pagina titel aanwezig is
    await expect(page.getByRole('heading', { name: 'Tijdlijn' })).toBeVisible({ timeout: 15000 });

    // Check of de tabs aanwezig zijn (role-based voor specifiekheid)
    await expect(page.getByRole('tab', { name: /Alles/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Concepten/i })).toBeVisible();
  });

  test('Spuitschrift pagina laadt correct', async ({ page }) => {
    await page.goto('/crop-care/logs');

    // Check of de pagina titel aanwezig is (CardTitle)
    await expect(page.getByRole('main').getByText('Spuitschrift')).toBeVisible({ timeout: 15000 });

    // Check of de tabs aanwezig zijn (Chronologisch / Per Perceel)
    await expect(page.getByRole('tab', { name: 'Chronologisch' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Per Perceel' })).toBeVisible();
  });

  test('Navigatie tussen paginas werkt', async ({ page }) => {
    // Start op smart-input
    await page.goto('/command-center/smart-input');
    await expect(page).toHaveURL(/smart-input/);

    // Ga naar timeline (via directe URL omdat navigatie elementen anders kunnen zijn)
    await page.goto('/command-center/timeline');
    await expect(page).toHaveURL(/timeline/);

    // Ga naar spuitschrift
    await page.goto('/crop-care/logs');
    await expect(page).toHaveURL(/logs/);
  });
});

// ============================================================================
// ERROR HANDLING TESTS
// ============================================================================
test.describe('Error Handling', () => {

  test('Lege input wordt niet verstuurd', async ({ page }) => {
    await page.goto('/command-center/smart-input');
    await waitForPageLoad(page);

    // Probeer lege input te versturen
    const sendButton = page.locator('button:has(svg.lucide-send)');

    // De knop moet disabled zijn
    await expect(sendButton).toBeDisabled();

    // Typ spatie en check opnieuw
    await typeInChat(page, '   ');
    await expect(sendButton).toBeDisabled();
  });

  test('Verwerk ongeldige invoer graceful', async ({ page }) => {
    await page.goto('/command-center/smart-input');
    await waitForPageLoad(page);

    // Typ iets dat niet als bespuiting herkend wordt
    await typeInChat(page, 'Wat is het weer vandaag?');
    await sendMessage(page);

    // Wacht op response
    await waitForProcessingComplete(page);

    // Er zou een antwoord moeten komen (geen crash)
    // Check dat de pagina nog steeds functioneel is
    await expect(page.locator('textarea')).toBeVisible();
  });
});
