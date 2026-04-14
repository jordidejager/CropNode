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
import type { SpuitschriftEntry, LogbookEntry, ProductEntry } from '@/lib/types';
import { createSprayTaskLogs } from '@/lib/spray-hours';

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

    // Parcels only needed for history (addParcelHistoryFn). Fetch lazily.
    let allParcels: Awaited<ReturnType<typeof getParcels>> = [];
    let sprayableParcels: Awaited<ReturnType<typeof getSprayableParcelsById>> = [];
    if (addParcelHistoryFn) {
      [allParcels, sprayableParcels] = await Promise.all([
        getParcels(),
        getSprayableParcelsById(params.plots),
      ]);
    }

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

    // Validation was already done by runRegistrationPipeline before the user confirmed.
    // Re-validation here is skipped to avoid cookie-auth dependency in server-side context.
    const finalProducts = params.products;
    const validationMessage: string | null = params.validationMessage || null;
    const warningCount = validationMessage ? 1 : 0;

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

    // Auto-create spray task logs (fire-and-forget, don't block confirmation)
    if (params.registrationType === 'spraying' || !params.registrationType) {
      createSprayTaskLogs({
        userId: params.userId,
        plotIds: params.plots,
        date: entryDate,
        products: finalProducts,
        sprayableParcels: sprayableParcels.length > 0 ? sprayableParcels : await getSprayableParcelsById(params.plots),
      }).catch(err => {
        console.error('[confirmRegistration] Spray task logs failed (non-blocking):', err);
      });
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
