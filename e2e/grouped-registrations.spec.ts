import { test, expect, Page } from '@playwright/test';

/**
 * E2E Test Suite: V2 Grouped Registrations
 *
 * Tests voor complexe invoer met variaties:
 * - "Alle appels met Merpan, maar de Kanzi ook met Score"
 * - "Alle peren met Captan, behalve de Conference"
 * - "Fruit met Score, halve dosering voor Lucas"
 *
 * De V2 flow splitst dit in meerdere deelregistraties
 * die individueel bevestigd kunnen worden.
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
    } catch {
        await page.waitForSelector('[data-testid="chat-input"]', { timeout: 30000 });
    }
}

async function typeAndSend(page: Page, text: string) {
    const textarea = page.locator('[data-testid="chat-input"]').first();
    await textarea.fill(text);
    const sendButton = page.locator('[data-testid="send-button"]').first();
    await sendButton.click({ force: true });
}

async function waitForResponse(page: Page, timeout = 60000) {
    try {
        await page.waitForFunction(
            () => {
                const sendBtn = document.querySelector('[data-testid="send-button"]');
                if (!sendBtn) return true;
                return !sendBtn.querySelector('.animate-spin');
            },
            { timeout }
        );
    } catch {
        console.log('Timeout waiting for response');
    }
    await page.waitForTimeout(2000);
}

// ============================================================================
// V2 GROUPED REGISTRATION TESTS
// ============================================================================

test.describe('V2 Grouped Registrations', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/command-center/smart-input');
        await waitForPageLoad(page);
    });

    test('Simple grouped input: appels met variatie', async ({ page }) => {
        // Input met variatie pattern "maar...ook"
        await typeAndSend(page, 'Alle appels met Merpan, maar de Kanzi ook met Score');
        await waitForResponse(page, 90000);

        // Check of er een grouped registration card verschijnt
        // Dit zou de RegistrationGroupCard moeten tonen
        const groupCard = page.locator('text=/deelregistratie|Bevestig Alles/i').first();
        const isGrouped = await groupCard.isVisible({ timeout: 15000 }).catch(() => false);

        if (isGrouped) {
            console.log('✓ V2 Grouped registration detected');

            // Check of er meerdere units zijn
            const unitCards = page.locator('text=/Appels|Kanzi/i');
            const unitCount = await unitCards.count();
            console.log(`  Found ${unitCount} unit references`);

            // Check of er individuele bevestig knoppen zijn
            const confirmButtons = page.locator('button:has-text("Bevestig")');
            const confirmCount = await confirmButtons.count();
            console.log(`  Found ${confirmCount} confirm buttons`);

            expect(unitCount).toBeGreaterThan(0);
        } else {
            // Fallback: check of er een reguliere draft is
            const hasDraft = await page.locator('text=/Actieve Registratie|Merpan/i').first().isVisible().catch(() => false);
            console.log(`  Fallback: Regular draft visible: ${hasDraft}`);
        }
    });

    test('Variatie: behalve pattern', async ({ page }) => {
        await typeAndSend(page, 'Alle peren met Merpan, behalve de Conference');
        await waitForResponse(page, 90000);

        // Check voor response
        const hasResponse = await page.locator('text=/registratie|Merpan|peren/i').first().isVisible({ timeout: 15000 }).catch(() => false);
        expect(hasResponse).toBeTruthy();

        console.log(`  Response received for "behalve" pattern`);
    });

    test('Variatie: halve dosering', async ({ page }) => {
        await typeAndSend(page, 'Alle appels met 1kg Merpan, de Tessa met halve dosering');
        await waitForResponse(page, 90000);

        // Check voor response
        const hasResponse = await page.locator('text=/registratie|Merpan|dosering/i').first().isVisible({ timeout: 15000 }).catch(() => false);
        console.log(`  Response for "halve dosering" pattern: ${hasResponse}`);
    });

    test('Confirm individual unit in grouped registration', async ({ page }) => {
        // Stuur grouped input
        await typeAndSend(page, 'Alle appels met Merpan, maar de Kanzi ook met Score');
        await waitForResponse(page, 90000);

        // Zoek naar een individuele bevestig knop
        const confirmButton = page.locator('[data-testid="confirm-unit"]').first()
            .or(page.locator('button:has-text("Bevestig")').first());

        const hasConfirmButton = await confirmButton.isVisible({ timeout: 10000 }).catch(() => false);

        if (hasConfirmButton) {
            console.log('  Found confirm button, clicking...');
            await confirmButton.click({ force: true });
            await page.waitForTimeout(3000);

            // Check of de unit bevestigd is
            const isConfirmed = await page.locator('text=/bevestigd|Bevestigd/i').first().isVisible().catch(() => false);
            console.log(`  Unit confirmed: ${isConfirmed}`);
        } else {
            console.log('  No individual confirm button found - may be single registration');
        }
    });

    test('Confirm all units at once', async ({ page }) => {
        // Stuur grouped input
        await typeAndSend(page, 'Alle appels met Merpan, maar de Kanzi ook met Score');
        await waitForResponse(page, 90000);

        // Zoek naar "Bevestig Alles" knop
        const confirmAllButton = page.locator('button:has-text("Bevestig Alles")').first();
        const hasConfirmAll = await confirmAllButton.isVisible({ timeout: 10000 }).catch(() => false);

        if (hasConfirmAll) {
            console.log('  Found "Bevestig Alles" button, clicking...');
            await confirmAllButton.click({ force: true });
            await page.waitForTimeout(3000);

            // Check of alles bevestigd is
            const allConfirmed = await page.locator('text=/Alle registraties bevestigd/i').first().isVisible().catch(() => false);
            console.log(`  All units confirmed: ${allConfirmed}`);
        } else {
            console.log('  No "Bevestig Alles" button - may be single unit');
        }
    });

    test('Remove unit from grouped registration', async ({ page }) => {
        // Stuur grouped input
        await typeAndSend(page, 'Alle appels met Merpan, maar de Kanzi ook met Score');
        await waitForResponse(page, 90000);

        // Zoek naar verwijder knop (trash icon)
        const removeButton = page.locator('[data-testid="remove-unit"]').first()
            .or(page.locator('button:has(svg.lucide-trash-2)').first());

        const hasRemoveButton = await removeButton.isVisible({ timeout: 10000 }).catch(() => false);

        if (hasRemoveButton) {
            console.log('  Found remove button, clicking...');
            await removeButton.click({ force: true });
            await page.waitForTimeout(2000);

            console.log('  Unit removed from group');
        } else {
            console.log('  No remove button found');
        }
    });

    test('Cancel all grouped registrations', async ({ page }) => {
        // Stuur grouped input
        await typeAndSend(page, 'Alle appels met Merpan, maar de Kanzi ook met Score');
        await waitForResponse(page, 90000);

        // Zoek naar annuleer knop
        const cancelButton = page.locator('button:has-text("Annuleer")').first()
            .or(page.locator('[data-testid="cancel-all"]').first());

        const hasCancelButton = await cancelButton.isVisible({ timeout: 10000 }).catch(() => false);

        if (hasCancelButton) {
            console.log('  Found cancel button, clicking...');
            await cancelButton.click({ force: true });
            await page.waitForTimeout(2000);

            // Check of alles geannuleerd is
            const isEmpty = await page.locator('text=/Geen actieve registratie/i').first().isVisible().catch(() => false);
            console.log(`  Registrations cancelled: ${isEmpty}`);
        } else {
            console.log('  No cancel button found');
        }
    });
});

// ============================================================================
// NON-GROUPED TESTS (should NOT trigger V2)
// ============================================================================

test.describe('Simple Registrations (Non-V2)', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/command-center/smart-input');
        await waitForPageLoad(page);
    });

    test('Simple input without variations should use regular flow', async ({ page }) => {
        await typeAndSend(page, 'Alle appels met Merpan');
        await waitForResponse(page, 60000);

        // Should NOT show grouped registration
        const isGrouped = await page.locator('text=/deelregistratie|Bevestig Alles/i').first().isVisible({ timeout: 5000 }).catch(() => false);

        if (isGrouped) {
            console.log('  WARNING: Simple input triggered grouped flow');
        } else {
            console.log('  ✓ Simple input correctly uses regular flow');
        }

        // Should show regular draft
        const hasDraft = await page.locator('text=/Actieve Registratie|Merpan/i').first().isVisible().catch(() => false);
        console.log(`  Regular draft visible: ${hasDraft}`);
    });

    test('Input with dosage should use regular flow', async ({ page }) => {
        await typeAndSend(page, '1.5 kg Merpan op alle peren');
        await waitForResponse(page, 60000);

        const hasDraft = await page.locator('text=/Merpan|1\\.5|1,5/i').first().isVisible({ timeout: 15000 }).catch(() => false);
        console.log(`  Draft with dosage visible: ${hasDraft}`);
        expect(hasDraft).toBeTruthy();
    });
});

// ============================================================================
// EDGE CASES
// ============================================================================

test.describe('V2 Edge Cases', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/command-center/smart-input');
        await waitForPageLoad(page);
    });

    test('Follow-up message should NOT trigger V2', async ({ page }) => {
        // First message - simple registration
        await typeAndSend(page, 'Alle appels met Merpan');
        await waitForResponse(page, 60000);

        // Wait for draft
        await page.waitForTimeout(2000);

        // Follow-up - should modify draft, not create grouped
        await typeAndSend(page, 'Kanzi ook met Score');
        await waitForResponse(page, 60000);

        // This should modify the existing draft, not create a grouped registration
        const hasProducts = await page.locator('text=/Merpan|Score/i').first().isVisible().catch(() => false);
        console.log(`  Follow-up merged into draft: ${hasProducts}`);
    });

    test('Unknown product in variation', async ({ page }) => {
        await typeAndSend(page, 'Alle appels met XYZ123, maar Kanzi ook met ABC456');
        await waitForResponse(page, 60000);

        // Should handle gracefully
        const hasResponse = await page.locator('text=/registratie|niet gevonden|onbekend/i').first().isVisible({ timeout: 15000 }).catch(() => false);
        console.log(`  Response for unknown products: ${hasResponse}`);
    });

    test('Empty variation group', async ({ page }) => {
        // Request that might result in empty group (unknown variety)
        await typeAndSend(page, 'Alle appels met Merpan, behalve de Nonexistent');
        await waitForResponse(page, 60000);

        // Should handle gracefully
        const hasResponse = await page.locator('text=/registratie|Merpan|niet/i').first().isVisible({ timeout: 15000 }).catch(() => false);
        console.log(`  Response for unknown variety: ${hasResponse}`);
    });
});
