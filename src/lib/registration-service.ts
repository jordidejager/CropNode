/**
 * Shared registration confirmation service.
 * Used by BOTH the web app (server actions) and the WhatsApp handler.
 *
 * This extracts the core save logic from confirmDraftDirectToSpuitschrift()
 * and makes it callable with an explicit userId (no cookie auth needed).
 */

import {
  addSpuitschriftEntry,
  deleteSpuitschriftEntry as dbDeleteSpuitschriftEntry,
  getParcels,
  getSprayableParcelsById,
} from '@/lib/supabase-store';
import { validateSprayData } from '@/lib/validation-service';
import type { SpuitschriftEntry, LogbookEntry, ProductEntry, ParsedSprayData } from '@/lib/types';

// Import addParcelHistoryEntries dynamically to avoid circular dependency
// (it's defined in actions.ts which imports from this file)

export interface ConfirmRegistrationParams {
  userId: string;
  plots: string[];
  products: ProductEntry[];
  date: Date | string;
  rawInput?: string;
  validationMessage?: string | null;
  registrationType?: 'spraying' | 'spreading';
  registrationSource?: 'web' | 'whatsapp';
}

export interface ConfirmRegistrationResult {
  success: boolean;
  message?: string;
  spuitschriftId?: string;
}

/**
 * Confirm and save a registration to the spuitschrift.
 * Does: validate → save to spuitschrift → create parcel history → inventory movements.
 *
 * @param params Registration data with explicit userId
 * @param addParcelHistoryFn The addParcelHistoryEntries function (injected to avoid circular import)
 */
export async function confirmRegistration(
  params: ConfirmRegistrationParams,
  addParcelHistoryFn?: (args: {
    logbookEntry: LogbookEntry;
    parcels: any[];
    sprayableParcels: any[];
    isConfirmation: boolean;
    spuitschriftId: string;
  }) => Promise<void>
): Promise<ConfirmRegistrationResult> {
  try {
    if (!params.plots || params.plots.length === 0) {
      return { success: false, message: 'Geen percelen geselecteerd.' };
    }
    if (!params.products || params.products.length === 0) {
      return { success: false, message: 'Geen producten opgegeven.' };
    }

    // Fetch parcels for validation and history
    const [allParcels, sprayableParcels] = await Promise.all([
      getParcels(),
      getSprayableParcelsById(params.plots),
    ]);

    // Parse and validate date
    let entryDate: Date;
    if (params.date instanceof Date && !isNaN(params.date.getTime())) {
      entryDate = params.date;
    } else if (typeof params.date === 'string' && params.date) {
      const parsed = new Date(params.date);
      entryDate = isNaN(parsed.getTime()) ? new Date() : parsed;
    } else {
      entryDate = new Date();
    }
    console.log('[confirmRegistration] Using date:', entryDate.toISOString());

    // Validate (only CTGB products, not fertilizers)
    const ctgbOnlyProducts = params.products.filter(p => !p.source || p.source === 'ctgb');
    const parsedData: ParsedSprayData = {
      plots: params.plots,
      products: ctgbOnlyProducts,
    };

    let validationMessage: string | null = null;
    let updatedProducts: ProductEntry[] | undefined;
    let errorCount = 0;
    let warningCount = 0;

    if (ctgbOnlyProducts.length > 0) {
      const result = await validateSprayData(parsedData, allParcels, entryDate);
      validationMessage = result.validationMessage;
      updatedProducts = result.updatedProducts;
      errorCount = result.errorCount;
      warningCount = result.warningCount;
    }

    // Merge back validated CTGB products with fertilizer products
    const finalProducts = updatedProducts
      ? params.products.map(p => {
          if (p.source === 'fertilizer') return p;
          const updated = updatedProducts!.find(u => u.product === p.product);
          return updated || p;
        })
      : params.products;

    // Block on validation errors
    if (errorCount > 0) {
      return {
        success: false,
        message: `Kan niet bevestigen: ${validationMessage || 'Validatiefouten gevonden.'}`
      };
    }

    // Build spuitschrift entry
    const spuitschriftEntry: Omit<SpuitschriftEntry, 'id' | 'spuitschriftId'> & { registrationSource?: string } = {
      originalLogbookId: null,
      originalRawInput: params.rawInput || 'Direct bevestigde registratie',
      date: entryDate,
      plots: params.plots,
      products: finalProducts,
      registrationType: params.registrationType || 'spraying',
      status: warningCount > 0 ? 'Waarschuwing' : 'Akkoord',
      createdAt: new Date(),
      ...(validationMessage && { validationMessage }),
      ...(params.registrationSource && { registrationSource: params.registrationSource }),
    };

    const newSpuitschriftEntry = await addSpuitschriftEntry(spuitschriftEntry as any, params.userId);

    // Create parcel history (if function provided)
    if (addParcelHistoryFn) {
      const dummyLogbookEntry: LogbookEntry = {
        id: `direct-${Date.now()}`,
        rawInput: params.rawInput || 'Direct bevestigde registratie',
        status: 'Akkoord',
        date: entryDate,
        createdAt: new Date(),
        parsedData: {
          plots: params.plots,
          products: finalProducts,
        },
        registrationType: params.registrationType || 'spraying',
        validationMessage: validationMessage || undefined,
      };

      try {
        await addParcelHistoryFn({
          logbookEntry: dummyLogbookEntry,
          parcels: allParcels,
          sprayableParcels,
          isConfirmation: true,
          spuitschriftId: newSpuitschriftEntry.id,
        });
      } catch (historyError) {
        console.error('[confirmRegistration] Parcel history failed, rolling back spuitschrift:', historyError);
        await dbDeleteSpuitschriftEntry(newSpuitschriftEntry.id).catch(rollbackErr => {
          console.error('[confirmRegistration] CRITICAL: Rollback also failed:', rollbackErr);
        });
        throw historyError;
      }
    }

    return {
      success: true,
      message: 'Registratie bevestigd en opgeslagen in spuitschrift.',
      spuitschriftId: newSpuitschriftEntry.id,
    };
  } catch (error) {
    console.error('[confirmRegistration] Error:', error);
    let message = 'Onbekende fout bij bevestigen.';

    if (error instanceof Error) {
      const errorMsg = error.message.toLowerCase();
      if (errorMsg.includes('fetch failed') || errorMsg.includes('network') || errorMsg.includes('econnreset')) {
        message = 'Geen verbinding met de database. Controleer je internetverbinding en probeer het opnieuw.';
      } else if (errorMsg.includes('timeout')) {
        message = 'De verbinding duurde te lang. Probeer het opnieuw.';
      } else {
        message = error.message;
      }
    }

    return { success: false, message };
  }
}
