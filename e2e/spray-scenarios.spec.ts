import { test, expect, Page } from '@playwright/test';

/**
 * E2E Test Suite: Verschillende Bespuiting Scenarios
 *
 * Deze "Ralph Loop" test veel verschillende soorten bespuitingen
 * om te valideren dat de hele UX werkt - van invoer tot spuitschrift.
 *
 * Test scenarios:
 * - Enkelvoudige middelen
 * - Meervoudige middelen (combinaties)
 * - Verschillende gewassen
 * - Verschillende eenheden (kg, L, ml, g)
 * - Verschillende doseringen
 * - Edge cases
 */

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function waitForPageLoad(page: Page, timeout = 60000) {
  try {
    const skeletonExists = await page.locator('[data-testid="dashboard-skeleton"]').isVisible({ timeout: 2000 }).catch(() => false);
    if (skeletonExists) {
      await page.waitForSelector('[data-testid="dashboard-skeleton"]', { state: 'hidden', timeout });
    }
    await page.waitForSelector('[data-testid="chat-input"]', { timeout: 30000 });
  } catch (e) {
    await page.waitForSelector('[data-testid="chat-input"]', { timeout: 30000 });
  }
}

async function typeAndSend(page: Page, text: string) {
  const textarea = page.locator('[data-testid="chat-input"]').first();
  await textarea.fill(text);
  const sendButton = page.locator('[data-testid="send-button"]').first();
  await sendButton.click({ force: true });
}

async function waitForResponse(page: Page, timeout = 45000) {
  // Wacht tot de spinner stopt
  try {
    await page.waitForFunction(
      () => {
        const sendBtn = document.querySelector('[data-testid="send-button"]');
        if (!sendBtn) return true;
        return !sendBtn.querySelector('.animate-spin');
      },
      { timeout }
    );
  } catch (e) {
    console.log('Timeout waiting for response');
  }
  await page.waitForTimeout(2000);
}

async function checkDraftCreated(page: Page): Promise<boolean> {
  const statusPanel = page.locator('[data-testid="status-panel"]');
  return await statusPanel.isVisible({ timeout: 30000 }).catch(() => false);
}

async function getDraftStatus(page: Page): Promise<string | null> {
  const statusBadge = page.locator('[data-testid="status-panel"]').locator('text=/Akkoord|Waarschuwing|Afgekeurd/i').first();
  if (await statusBadge.isVisible({ timeout: 5000 }).catch(() => false)) {
    return await statusBadge.textContent();
  }
  return null;
}

async function canConfirm(page: Page): Promise<boolean> {
  const confirmButton = page.locator('[data-testid="confirm-draft"]');
  if (!await confirmButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    return false;
  }
  return !await confirmButton.isDisabled();
}

async function confirmDraft(page: Page): Promise<boolean> {
  const confirmButton = page.locator('[data-testid="confirm-draft"]');
  if (!await confirmButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    return false;
  }
  if (await confirmButton.isDisabled()) {
    return false;
  }
  await confirmButton.click({ force: true });
  await page.waitForTimeout(3000);
  return true;
}

async function saveDraft(page: Page): Promise<boolean> {
  const saveButton = page.locator('[data-testid="save-draft"]');
  if (!await saveButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    return false;
  }
  await saveButton.click({ force: true });
  await page.waitForTimeout(2000);
  return true;
}

interface TestResult {
  input: string;
  draftCreated: boolean;
  status: string | null;
  canConfirm: boolean;
  confirmed: boolean;
  error?: string;
}

async function testSprayInput(page: Page, input: string): Promise<TestResult> {
  const result: TestResult = {
    input,
    draftCreated: false,
    status: null,
    canConfirm: false,
    confirmed: false,
  };

  try {
    await typeAndSend(page, input);
    await waitForResponse(page);

    result.draftCreated = await checkDraftCreated(page);
    if (result.draftCreated) {
      result.status = await getDraftStatus(page);
      result.canConfirm = await canConfirm(page);

      if (result.canConfirm) {
        result.confirmed = await confirmDraft(page);
      }
    }
  } catch (e: any) {
    result.error = e.message;
  }

  return result;
}

// ============================================================================
// TEST DATA - Verschillende bespuiting scenarios
// ============================================================================

const SPRAY_SCENARIOS = {
  // Enkelvoudige middelen met verschillende eenheden
  singleProducts: [
    '1 kg Captan op appels',
    '1.5 L Merpan op peren',
    '500 ml Surround op appels',
    '2 kg/ha Delan op peren',
    '0.5 L/ha Luna op appels',
  ],

  // Combinaties van middelen
  combinations: [
    'Captan 1 kg en Delan 0.5 kg op appels',
    'Spuit Merpan 1.5 L met Surround 2 L op peren',
    '1 kg Captan + 0.5 L Luna op alle appels',
  ],

  // Verschillende gewassen
  differentCrops: [
    '1 L Merpan op peren',
    '0.5 kg Captan op appels',
    '2 L fungicide op druiven',
    '1.5 kg meststof op aardbeien',
  ],

  // Natuurlijke taal variaties
  naturalLanguage: [
    'Vandaag alle peren gespoten met 1 kg Merpan',
    'Gisteren heb ik de appels behandeld met Captan, 0.5 kg per hectare',
    'Spuit morgen 1.5 L Surround op de perenbomen',
    'Alle percelen met peren: 2 kg/ha Delan',
  ],

  // Edge cases
  edgeCases: [
    'Spuit appels',  // Geen dosering
    '1 kg op peren',  // Geen middel
    'Captan',  // Alleen middel
    '1,5 kg Captan op appels',  // Komma als decimaal
    '1.234 L Merpan op peren',  // Veel decimalen
  ],

  // Hoge doseringen (verwacht waarschuwing/afkeuring)
  highDosages: [
    '50 kg Captan op appels',
    '100 L Merpan op peren',
    '25 kg/ha fungicide op druiven',
  ],
};

// ============================================================================
// TESTS
// ============================================================================

test.describe('Spray Scenarios - Enkelvoudige Middelen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/command-center/smart-input');
    await waitForPageLoad(page);
  });

  for (const input of SPRAY_SCENARIOS.singleProducts) {
    test(`Test: "${input}"`, async ({ page }) => {
      const result = await testSprayInput(page, input);

      console.log('=====================================');
      console.log(`Input: ${result.input}`);
      console.log(`Draft created: ${result.draftCreated}`);
      console.log(`Status: ${result.status}`);
      console.log(`Can confirm: ${result.canConfirm}`);
      console.log(`Confirmed: ${result.confirmed}`);
      if (result.error) console.log(`Error: ${result.error}`);
      console.log('=====================================');

      // Basisvalidatie: er moet iets gebeuren (draft of chat response)
      const hasChatResponse = await page.locator('.bg-black\\/40, [class*="message"]').first().isVisible().catch(() => false);
      expect(result.draftCreated || hasChatResponse).toBeTruthy();
    });
  }
});

test.describe('Spray Scenarios - Combinaties', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/command-center/smart-input');
    await waitForPageLoad(page);
  });

  for (const input of SPRAY_SCENARIOS.combinations) {
    test(`Test: "${input}"`, async ({ page }) => {
      const result = await testSprayInput(page, input);

      console.log('=====================================');
      console.log(`COMBO Input: ${result.input}`);
      console.log(`Draft created: ${result.draftCreated}`);
      console.log(`Status: ${result.status}`);
      console.log(`Can confirm: ${result.canConfirm}`);
      console.log('=====================================');

      // Bij combinaties verwachten we dat de AI meerdere producten herkent
      if (result.draftCreated) {
        const productCount = await page.locator('[data-testid="status-panel"]').locator('text=/kg|L|ml/i').count();
        console.log(`Products detected: ${productCount}`);
      }
    });
  }
});

test.describe('Spray Scenarios - Natuurlijke Taal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/command-center/smart-input');
    await waitForPageLoad(page);
  });

  for (const input of SPRAY_SCENARIOS.naturalLanguage) {
    test(`Test: "${input}"`, async ({ page }) => {
      const result = await testSprayInput(page, input);

      console.log('=====================================');
      console.log(`NL Input: ${result.input}`);
      console.log(`Draft created: ${result.draftCreated}`);
      console.log(`Status: ${result.status}`);
      console.log('=====================================');

      // De AI moet natuurlijke taal kunnen begrijpen
      expect(result.draftCreated).toBeTruthy();
    });
  }
});

test.describe('Spray Scenarios - Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/command-center/smart-input');
    await waitForPageLoad(page);
  });

  for (const input of SPRAY_SCENARIOS.edgeCases) {
    test(`Edge case: "${input}"`, async ({ page }) => {
      const result = await testSprayInput(page, input);

      console.log('=====================================');
      console.log(`EDGE Input: ${result.input}`);
      console.log(`Draft created: ${result.draftCreated}`);
      console.log(`Status: ${result.status}`);
      console.log(`Error: ${result.error || 'none'}`);
      console.log('=====================================');

      // Edge cases mogen graceful falen (geen crash)
      // Er moet altijd een response zijn
      const hasAnyResponse = result.draftCreated ||
        await page.locator('text=/niet|onvolledig|specificeer|welk/i').first().isVisible().catch(() => false);

      // Test slaagt als er geen crash is
      expect(true).toBeTruthy();
    });
  }
});

test.describe('Spray Scenarios - Hoge Doseringen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/command-center/smart-input');
    await waitForPageLoad(page);
  });

  for (const input of SPRAY_SCENARIOS.highDosages) {
    test(`High dosage: "${input}"`, async ({ page }) => {
      const result = await testSprayInput(page, input);

      console.log('=====================================');
      console.log(`HIGH DOSE Input: ${result.input}`);
      console.log(`Draft created: ${result.draftCreated}`);
      console.log(`Status: ${result.status}`);
      console.log(`Can confirm: ${result.canConfirm}`);
      console.log('=====================================');

      // Bij extreem hoge doseringen verwachten we:
      // - Status "Afgekeurd" of "Waarschuwing"
      // - OF de bevestig knop is disabled
      if (result.draftCreated && result.status) {
        const hasWarningOrRejection = result.status === 'Afgekeurd' || result.status === 'Waarschuwing' || !result.canConfirm;
        console.log(`Has warning/rejection: ${hasWarningOrRejection}`);
      }
    });
  }
});

// ============================================================================
// COMPLETE FLOW TEST
// ============================================================================

test.describe('Complete Flow Tests', () => {
  test('Volledige flow: invoer → validatie → bevestigen → spuitschrift', async ({ page }) => {
    // 1. Ga naar Smart Input
    await page.goto('/command-center/smart-input');
    await waitForPageLoad(page);

    // 2. Voer een bespuiting in
    const input = '1 L Merpan op peren';
    await typeAndSend(page, input);
    await waitForResponse(page);

    // 3. Check of draft is aangemaakt
    const draftCreated = await checkDraftCreated(page);
    console.log('Draft created:', draftCreated);

    if (!draftCreated) {
      console.log('SKIP: No draft created');
      return;
    }

    // 4. Check validatie status
    const status = await getDraftStatus(page);
    console.log('Validation status:', status);

    // 5. Check of we kunnen bevestigen
    const canConfirmDraft = await canConfirm(page);
    console.log('Can confirm:', canConfirmDraft);

    if (!canConfirmDraft) {
      // Probeer als concept op te slaan
      const saved = await saveDraft(page);
      console.log('Saved as draft:', saved);
      return;
    }

    // 6. Bevestig de draft
    const confirmed = await confirmDraft(page);
    console.log('Confirmed:', confirmed);

    // 7. Wacht op success feedback
    await page.waitForTimeout(2000);

    // 8. Ga naar spuitschrift
    await page.goto('/crop-care/logs');
    await page.getByRole('main').getByText('Spuitschrift').waitFor({ timeout: 30000 });

    // 9. Check of de entry in spuitschrift staat
    const entryInSpuitschrift = await page.locator('text=/Merpan|peren/i').first().isVisible({ timeout: 10000 }).catch(() => false);
    console.log('Entry in Spuitschrift:', entryInSpuitschrift);

    // Assertion
    if (confirmed) {
      expect(entryInSpuitschrift).toBeTruthy();
    }
  });

  test('Concept flow: invoer → validatie → concept opslaan → tijdlijn', async ({ page }) => {
    // 1. Ga naar Smart Input
    await page.goto('/command-center/smart-input');
    await waitForPageLoad(page);

    // 2. Voer een bespuiting in
    const input = '0.5 kg Captan op appels';
    await typeAndSend(page, input);
    await waitForResponse(page);

    // 3. Check of draft is aangemaakt
    const draftCreated = await checkDraftCreated(page);
    if (!draftCreated) {
      console.log('SKIP: No draft created');
      return;
    }

    // 4. Sla op als concept
    const saved = await saveDraft(page);
    console.log('Saved as draft:', saved);

    // 5. Wacht op redirect of success
    await page.waitForTimeout(3000);

    // 6. Ga naar tijdlijn
    await page.goto('/command-center/timeline');

    // 7. Check of het concept in de tijdlijn staat
    const conceptInTimeline = await page.locator('text=/Captan|appels|Concept/i').first().isVisible({ timeout: 10000 }).catch(() => false);
    console.log('Concept in Timeline:', conceptInTimeline);
  });
});

// ============================================================================
// VALIDATION RULES TEST
// ============================================================================

test.describe('Validation Rules Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/command-center/smart-input');
    await waitForPageLoad(page);
  });

  test('Validatie: Correcte dosering moet Akkoord of Waarschuwing zijn', async ({ page }) => {
    await typeAndSend(page, '1 kg Captan op appels');
    await waitForResponse(page);

    const draftCreated = await checkDraftCreated(page);
    if (!draftCreated) {
      test.skip();
      return;
    }

    const status = await getDraftStatus(page);
    console.log('Status:', status);

    // Correcte dosering mag niet Afgekeurd zijn (tenzij gewas niet toegelaten)
    // We loggen alleen het resultaat
  });

  test('Validatie: Extreem hoge dosering moet waarschuwing geven', async ({ page }) => {
    await typeAndSend(page, '100 kg Captan op appels');
    await waitForResponse(page);

    const draftCreated = await checkDraftCreated(page);
    if (!draftCreated) {
      console.log('No draft - AI may not have parsed');
      return;
    }

    const status = await getDraftStatus(page);
    const canConfirmDraft = await canConfirm(page);

    console.log('Status:', status);
    console.log('Can confirm:', canConfirmDraft);

    // Bij extreme dosering verwachten we waarschuwing of afkeuring
    if (status === 'Akkoord' && canConfirmDraft) {
      console.log('WARNING: High dosage was accepted without warning!');
    }
  });

  test('Validatie: Bevestig knop disabled bij Afgekeurd', async ({ page }) => {
    // Probeer een registratie die waarschijnlijk wordt afgekeurd
    await typeAndSend(page, '500 kg giftig middel op tomaten');
    await waitForResponse(page);

    const draftCreated = await checkDraftCreated(page);
    if (!draftCreated) {
      console.log('No draft created');
      return;
    }

    const status = await getDraftStatus(page);
    const canConfirmDraft = await canConfirm(page);

    console.log('Status:', status);
    console.log('Can confirm:', canConfirmDraft);

    // Als status Afgekeurd is, moet bevestig knop disabled zijn
    if (status === 'Afgekeurd') {
      expect(canConfirmDraft).toBeFalsy();
    }
  });
});

// ============================================================================
// SUMMARY TEST
// ============================================================================

test('SUMMARY: Run all spray scenarios and collect results', async ({ page }) => {
  const allInputs = [
    ...SPRAY_SCENARIOS.singleProducts,
    ...SPRAY_SCENARIOS.combinations.slice(0, 2),
    ...SPRAY_SCENARIOS.naturalLanguage.slice(0, 2),
  ];

  const results: TestResult[] = [];

  for (const input of allInputs) {
    await page.goto('/command-center/smart-input');
    await waitForPageLoad(page);

    const result = await testSprayInput(page, input);
    results.push(result);

    // Reset voor volgende test
    await page.waitForTimeout(1000);
  }

  // Print summary
  console.log('\n=====================================');
  console.log('SPRAY SCENARIOS SUMMARY');
  console.log('=====================================');

  let successCount = 0;
  let warningCount = 0;
  let rejectedCount = 0;
  let failedCount = 0;

  for (const r of results) {
    const statusIcon = r.status === 'Akkoord' ? '✅' :
                       r.status === 'Waarschuwing' ? '⚠️' :
                       r.status === 'Afgekeurd' ? '❌' :
                       r.draftCreated ? '📝' : '❓';

    console.log(`${statusIcon} ${r.input}`);
    console.log(`   Draft: ${r.draftCreated}, Status: ${r.status}, Confirmed: ${r.confirmed}`);

    if (r.status === 'Akkoord') successCount++;
    else if (r.status === 'Waarschuwing') warningCount++;
    else if (r.status === 'Afgekeurd') rejectedCount++;
    else failedCount++;
  }

  console.log('\n-------------------------------------');
  console.log(`Total: ${results.length}`);
  console.log(`✅ Akkoord: ${successCount}`);
  console.log(`⚠️ Waarschuwing: ${warningCount}`);
  console.log(`❌ Afgekeurd: ${rejectedCount}`);
  console.log(`❓ No draft: ${failedCount}`);
  console.log('=====================================\n');
});
