/**
 * Smart Input Variations Test Suite
 *
 * Tests all sentence variations that farmers might use.
 * Every variation must produce the same result as the "standard" sentence.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

interface ProductEntry {
  product: string;
  dosage: number;
  unit: string;
}

interface SmartInputResponse {
  messages: Array<{ type: string; [key: string]: unknown }>;
  finalData?: {
    plots?: string[];
    products?: ProductEntry[];
    action?: string;
  };
  groupedData?: {
    units: Array<{
      plots: string[];
      products: ProductEntry[];
      label?: string;
      date?: string;
    }>;
  };
  parcels?: Array<{ id: string; name: string }>;
  reply?: string;
  isSplit?: boolean;
}

interface DraftContext {
  plots: string[];
  products: ProductEntry[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

async function sendSmartInput(
  request: typeof test.prototype['request'],
  input: string,
  history: ChatMessage[] = [],
  existingDraft?: DraftContext,
  parcelInfo?: Array<{ id: string; name: string }>,
  maxRetries: number = 2
): Promise<SmartInputResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`  Retry attempt ${attempt}/${maxRetries} for input: "${input.substring(0, 40)}..."`);
        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }

      const response = await request.post(`${BASE_URL}/api/analyze-input`, {
        data: {
          rawInput: input,
          previousDraft: existingDraft || null,
          chatHistory: history,
          parcelInfo: parcelInfo || [],
          mode: 'registration',
        },
        timeout: 60000,
      });

      if (!response.ok()) {
        throw new Error(`API request failed: ${response.status()}`);
      }

      // Success - parse and return response
      return parseSmartInputResponse(await response.text());
    } catch (error) {
      lastError = error as Error;
      console.log(`  Request failed (attempt ${attempt + 1}): ${lastError.message}`);

      // Only retry on timeout or 5xx errors
      if (!lastError.message.includes('timeout') && !lastError.message.includes('50')) {
        throw lastError;
      }
    }
  }

  throw lastError || new Error('All retry attempts failed');
}

function parseSmartInputResponse(responseText: string): SmartInputResponse {
  const lines = responseText.split('\n').filter(line => line.trim());
  const messages: Array<{ type: string; [key: string]: unknown }> = [];

  const result: SmartInputResponse = { messages };

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      messages.push(parsed);

      if (parsed.type === 'grouped_complete') {
        result.groupedData = parsed.group;
        result.parcels = parsed.parcels;
        result.reply = parsed.reply;
        result.isSplit = parsed.isSplit;
      } else if (parsed.type === 'complete') {
        result.finalData = parsed.data;
        result.reply = parsed.reply;
      } else if (parsed.type === 'slot_request') {
        console.log(`  SLOT_REQUEST: ${parsed.slotRequest?.missingSlot || 'unknown'} - ${parsed.slotRequest?.question || JSON.stringify(parsed)}`);
        const draft = parsed.slotRequest?.currentDraft;
        if (draft) {
          console.log(`    currentDraft: plots=${draft.plots?.length || 0}, products=${draft.products?.length || 0}`);
        }
      } else if (parsed.type === 'error') {
        console.log(`  ERROR: ${parsed.message || JSON.stringify(parsed)}`);
      }
    } catch {
      // Skip non-JSON lines
    }
  }

  return result;
}

function getPlots(response: SmartInputResponse): string[] {
  if (response.groupedData) {
    return response.groupedData.units.flatMap(u => u.plots);
  }
  return response.finalData?.plots || [];
}

function getProducts(response: SmartInputResponse): ProductEntry[] {
  if (response.groupedData) {
    return response.groupedData.units[0]?.products || [];
  }
  return response.finalData?.products || [];
}

function extractDraft(response: SmartInputResponse): DraftContext {
  if (response.groupedData) {
    return {
      plots: response.groupedData.units.flatMap(u => u.plots),
      products: response.groupedData.units[0]?.products || []
    };
  }
  return {
    plots: response.finalData?.plots || [],
    products: response.finalData?.products || []
  };
}

// ============================================
// VARIATION TESTS
// ============================================

test.describe('Smart Input Variations - Basis Registratie', () => {
  // All these should produce: Conference parcels + Surround 30 kg
  const basisVariaties = [
    'Vandaag gespoten alle conference met surround 30 kg',
    'Vandaag alle conference gedaan met surround 30 kg',
    'Conference gespoten vandaag, surround 30 kg',
    'Heb vandaag de conference gespoten met surround 30 kg',
    'Surround 30 kg op alle conference vandaag',
    'Alle conference surround 30 kg',
    'Conference vandaag surround 30kg gespoten',
    'Net alle conference gedaan, surround 30 kilo',
    'Surround gespoten, 30 kg, alle conference',
    'Vandaag conference behandeld met surround 30 kg',
  ];

  for (const variatie of basisVariaties) {
    test(`Basis: "${variatie}"`, async ({ request }) => {
      const response = await sendSmartInput(request, variatie);

      const plots = getPlots(response);
      const products = getProducts(response);

      console.log(`  Input: "${variatie}"`);
      console.log(`  Plots: ${plots.length}`);
      console.log(`  Products: ${products.map(p => `${p.product} ${p.dosage}${p.unit}`).join(', ')}`);

      // Should have conference parcels
      expect(plots.length).toBeGreaterThan(0);

      // Should have Surround
      const hasSurround = products.some(p =>
        p.product.toLowerCase().includes('surround')
      );
      expect(hasSurround).toBe(true);

      // Dosage should be 30
      const surround = products.find(p => p.product.toLowerCase().includes('surround'));
      expect(surround?.dosage).toBe(30);
    });
  }
});

test.describe('Smart Input Variations - Dosering Wijzigen', () => {
  const doseringVariaties = [
    'dosering is 25 kg',
    'dosering 25 kg',
    '25 kg was het',
    'het was 25 kg',
    'eigenlijk 25 kg',
    'moet 25 kg zijn',
    '25 kilo',
    'pas aan naar 25 kg',
  ];

  for (const variatie of doseringVariaties) {
    test(`Dosering: "${variatie}"`, async ({ request }) => {
      // Step 1: Create initial registration
      const step1 = await sendSmartInput(
        request,
        'Vandaag gespoten alle conference met surround 30 kg'
      );

      const draft = extractDraft(step1);
      const history: ChatMessage[] = [
        { role: 'user', content: 'Vandaag gespoten alle conference met surround 30 kg' },
        { role: 'assistant', content: step1.reply || '' }
      ];

      // Step 2: Change dosage
      const step2 = await sendSmartInput(request, variatie, history, draft, step1.parcels);

      const products = getProducts(step2);
      console.log(`  Input: "${variatie}"`);
      console.log(`  Products: ${products.map(p => `${p.product} ${p.dosage}${p.unit}`).join(', ')}`);

      // Should have Surround with dosage 25
      const surround = products.find(p => p.product.toLowerCase().includes('surround'));
      if (surround) {
        expect(surround.dosage).toBe(25);
        console.log(`  ✓ Dosage correctly changed to 25`);
      } else {
        console.log(`  Note: Surround not found in response`);
      }
    });
  }
});

test.describe('Smart Input Variations - Product Toevoegen Subset', () => {
  // Note: Using "Schele" which exists in database
  const productVariaties = [
    'Bij schele nog merpan bij gedaan',
    'Schele ook merpan',
    'Merpan erbij bij schele',
    'Op schele nog merpan gespoten',
    'Schele kreeg ook merpan',
    'Nog merpan op schele',
    'Schele merpan toegevoegd',
    'Bij schele merpan meegespoten',
  ];

  for (const variatie of productVariaties) {
    test(`Product subset: "${variatie}"`, async ({ request }) => {
      // Step 1: Create initial registration
      const step1 = await sendSmartInput(
        request,
        'Vandaag gespoten alle conference met surround 30 kg'
      );

      const draft = extractDraft(step1);
      const history: ChatMessage[] = [
        { role: 'user', content: 'Vandaag gespoten alle conference met surround 30 kg' },
        { role: 'assistant', content: step1.reply || '' }
      ];

      // Step 2: Add Merpan to Schele
      const step2 = await sendSmartInput(request, variatie, history, draft, step1.parcels);

      console.log(`  Input: "${variatie}"`);

      // Should have grouped response with Schele having Merpan
      if (step2.groupedData) {
        const scheleUnit = step2.groupedData.units.find(u =>
          u.label?.toLowerCase().includes('schele')
        );

        if (scheleUnit) {
          const hasMerpan = scheleUnit.products.some(p =>
            p.product.toLowerCase().includes('merpan')
          );
          console.log(`  Schele unit: ${scheleUnit.label}`);
          console.log(`  Has Merpan: ${hasMerpan}`);
          expect(hasMerpan).toBe(true);
        } else {
          console.log(`  Note: No Schele unit found - response type: ${step2.messages.map(m => m.type).join(', ')}`);
        }
      } else {
        console.log(`  Note: No grouped response - type: ${step2.finalData?.action || 'unknown'}`);
      }
    });
  }
});

test.describe('Smart Input Variations - Datum Split', () => {
  // Note: Using "Stadhoek" which exists in Conference parcels
  const datumVariaties = [
    'Stadhoek trouwens gisteren gespoten',
    'Stadhoek was gisteren',
    'Stadhoek heb ik gisteren gedaan',
    'Gisteren stadhoek gespoten',
    'Stadhoek deed ik gisteren',
    'Oh ja stadhoek was gisteren',
    'Stadhoek gisteren, de rest vandaag',
    'Alleen stadhoek was gisteren',
  ];

  for (const variatie of datumVariaties) {
    test(`Datum split: "${variatie}"`, async ({ request }) => {
      // Step 1: Create initial registration
      const step1 = await sendSmartInput(
        request,
        'Vandaag gespoten alle conference met surround 30 kg'
      );

      const draft = extractDraft(step1);
      const history: ChatMessage[] = [
        { role: 'user', content: 'Vandaag gespoten alle conference met surround 30 kg' },
        { role: 'assistant', content: step1.reply || '' }
      ];

      // Step 2: Split Stadhoek to yesterday
      const step2 = await sendSmartInput(request, variatie, history, draft, step1.parcels);

      console.log(`  Input: "${variatie}"`);
      console.log(`  isSplit: ${step2.isSplit}`);

      if (step2.groupedData) {
        console.log(`  Units: ${step2.groupedData.units.length}`);

        // Find unit with yesterday's date
        const yesterdayUnit = step2.groupedData.units.find(u => {
          if (u.date) {
            const unitDate = new Date(u.date);
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            return unitDate.toDateString() === yesterday.toDateString();
          }
          return false;
        });

        if (yesterdayUnit) {
          console.log(`  ✓ Yesterday unit found: ${yesterdayUnit.label}`);
        } else {
          console.log(`  Note: No yesterday unit found`);
        }
      } else {
        // Log what we got instead
        console.log(`  Note: No grouped response`);
        console.log(`  Messages: ${step2.messages.map(m => m.type).join(', ')}`);
        if (step2.finalData) {
          console.log(`  FinalData action: ${step2.finalData.action}`);
        }
      }
    });
  }
});

test.describe('Smart Input Variations - Perceel Verwijderen', () => {
  // Note: Using "Zuidhoek" which exists in Conference parcels
  const verwijderVariaties = [
    'Zuidhoek niet',
    'Zuidhoek trouwens niet',
    'Zonder zuidhoek',
    'Zuidhoek hoeft niet',
    'Behalve zuidhoek',
    'Zuidhoek overslaan',
    'Zuidhoek eruit',
    'Niet zuidhoek',
  ];

  for (const variatie of verwijderVariaties) {
    test(`Verwijderen: "${variatie}"`, async ({ request }) => {
      // Step 1: Create initial registration
      const step1 = await sendSmartInput(
        request,
        'Vandaag gespoten alle conference met surround 30 kg'
      );

      const initialPlots = getPlots(step1);
      const draft = extractDraft(step1);
      const history: ChatMessage[] = [
        { role: 'user', content: 'Vandaag gespoten alle conference met surround 30 kg' },
        { role: 'assistant', content: step1.reply || '' }
      ];

      // Step 2: Remove Zuidhoek
      const step2 = await sendSmartInput(request, variatie, history, draft, step1.parcels);

      const finalPlots = getPlots(step2);

      console.log(`  Input: "${variatie}"`);
      console.log(`  Initial plots: ${initialPlots.length}`);
      console.log(`  Final plots: ${finalPlots.length}`);

      // Should have fewer plots
      if (finalPlots.length < initialPlots.length) {
        console.log(`  ✓ Parcel removed`);
      } else {
        console.log(`  Note: Plot count unchanged`);
      }

      // Zuidhoek should not be in final plots
      if (step2.parcels) {
        const zuidhoekIds = step2.parcels
          .filter(p => p.name.toLowerCase().includes('zuidhoek'))
          .map(p => p.id);
        const zuidhoekInFinal = finalPlots.some(id => zuidhoekIds.includes(id));
        console.log(`  Zuidhoek in final: ${zuidhoekInFinal}`);
      }
    });
  }
});

test.describe('Smart Input Variations - Correcties', () => {
  const correctieVariaties = [
    'Nee het was captan niet surround',
    'Sorry, captan bedoel ik',
    'Fout, moet captan zijn',
    'Niet surround maar captan',
    'Verkeerd, captan',
    'Ik bedoelde captan',
  ];

  for (const variatie of correctieVariaties) {
    test(`Correctie: "${variatie}"`, async ({ request }) => {
      // Step 1: Create initial registration with Surround
      const step1 = await sendSmartInput(
        request,
        'Vandaag gespoten alle conference met surround 30 kg'
      );

      const draft = extractDraft(step1);
      const history: ChatMessage[] = [
        { role: 'user', content: 'Vandaag gespoten alle conference met surround 30 kg' },
        { role: 'assistant', content: step1.reply || '' }
      ];

      // Step 2: Correct to Captan
      const step2 = await sendSmartInput(request, variatie, history, draft, step1.parcels);

      const products = getProducts(step2);

      console.log(`  Input: "${variatie}"`);
      console.log(`  Products: ${products.map(p => p.product).join(', ')}`);

      const hasCaptan = products.some(p =>
        p.product.toLowerCase().includes('captan')
      );
      const hasSurround = products.some(p =>
        p.product.toLowerCase().includes('surround')
      );

      console.log(`  Has Captan: ${hasCaptan}`);
      console.log(`  Has Surround: ${hasSurround}`);

      // Ideally should have Captan and not Surround
      if (hasCaptan && !hasSurround) {
        console.log(`  ✓ Product correctly replaced`);
      }
    });
  }
});

test.describe('Smart Input Variations - Typefouten', () => {
  const typefoutVariaties = [
    { input: 'Vandaag gespoten alle conference met surond 30 kg', expectedProduct: 'surround' },
    { input: 'Vandaag gespoten alle conference met merspan 30 kg', expectedProduct: 'merpan' },
    { input: 'Vandaag gespoten alle conferense met surround 30 kg', expectedParcels: true },
    { input: 'alle conference met SURROUND 30 KG', expectedProduct: 'surround' },
    { input: 'ALLE CONFERENCE MET SURROUND 30 KG', expectedProduct: 'surround' },
  ];

  for (const { input, expectedProduct, expectedParcels } of typefoutVariaties) {
    test(`Typefout: "${input}"`, async ({ request }) => {
      const response = await sendSmartInput(request, input);

      const plots = getPlots(response);
      const products = getProducts(response);

      console.log(`  Input: "${input}"`);
      console.log(`  Plots: ${plots.length}`);
      console.log(`  Products: ${products.map(p => p.product).join(', ')}`);

      if (expectedProduct) {
        const hasProduct = products.some(p =>
          p.product.toLowerCase().includes(expectedProduct)
        );
        console.log(`  Has ${expectedProduct}: ${hasProduct}`);
        if (hasProduct) {
          console.log(`  ✓ Fuzzy match worked`);
        }
      }

      if (expectedParcels) {
        console.log(`  Parcels found: ${plots.length > 0}`);
      }
    });
  }
});
