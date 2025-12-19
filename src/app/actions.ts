'use server';

import { z } from 'zod';
import { parseSprayApplication } from '@/ai/flows/parse-spray-application';
import { parcels, middelMatrix, products } from '@/lib/data';
import { addLogbookEntry, addParcelHistoryEntries, addProduct } from '@/lib/store';
import type { LogbookEntry, ParcelHistoryEntry, ParsedSprayData } from '@/lib/types';
import { revalidatePath } from 'next/cache';

const formSchema = z.object({
  rawInput: z.string().min(10, 'Voer alsjeblieft een geldige bespuiting in.'),
});

export type FormState = {
  message: string;
  entry?: LogbookEntry;
  errors?: {
    rawInput?: string[];
  };
};

export async function processSprayEntry(
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validatedFields = formSchema.safeParse({
    rawInput: formData.get('rawInput'),
  });

  if (!validatedFields.success) {
    return {
      message: 'Validatiefout.',
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }
  
  const { rawInput } = validatedFields.data;
  const newLogId = Date.now();

  try {
    // 1. Parse with AI
    const plotDataForPrompt = parcels.map(p => ({ id: p.id, name: p.name, crop: p.crop, variety: p.variety }));
    const parsedData: ParsedSprayData = await parseSprayApplication({
      naturalLanguageInput: rawInput,
      plots: JSON.stringify(plotDataForPrompt),
    });

    const resolvedPlotIds = parsedData.plots;

    if (resolvedPlotIds.length === 0) {
        throw new Error("AI kon geen geldige percelen identificeren in de output.");
    }
    
    // Add new product to database if it's the first time being used
    if (!products.find(p => p.toLowerCase() === parsedData.product.toLowerCase())) {
        addProduct(parsedData.product);
    }

    const finalParsedData = { ...parsedData, plots: resolvedPlotIds };

    // 2. Validate
    let validationMessage = '';
    let isValid = true;
    let dosageWarningShown = false;

    const cropsInSelection = new Set(finalParsedData.plots.map(parcelId => {
      return parcels.find(p => p.id === parcelId)?.crop;
    }).filter(Boolean));

    for (const crop of cropsInSelection) {
      const rule = middelMatrix.find(
        m => m.product.toLowerCase() === finalParsedData.product.toLowerCase() && m.crop === crop
      );

      if (!rule) {
        isValid = false;
        validationMessage += `⚠️ ${finalParsedData.product} mag mogelijk niet gebruikt worden op het gewas '${crop}'. `;
        break; // Stop after first invalid crop
      } else if (finalParsedData.dosage > rule.maxDosage && !dosageWarningShown) {
        isValid = false;
        validationMessage += `⚠️ Dosering ${finalParsedData.dosage} ${finalParsedData.unit} voor ${finalParsedData.product} overschrijdt de maximale dosering van ${rule.maxDosage} ${rule.unit} voor het gewas '${crop}'. `;
        dosageWarningShown = true;
      }
    }


    // 3. Create Logbook and History entries
    const newEntry: LogbookEntry = {
      id: newLogId,
      rawInput,
      status: isValid ? 'Akkoord' : 'Te Controleren',
      timestamp: new Date(),
      parsedData: finalParsedData,
      validationMessage: validationMessage.trim() || undefined,
    };

    addLogbookEntry(newEntry);

    // Only add to history if fully valid
    if (isValid && newEntry.parsedData && 'product' in newEntry.parsedData) {
      const historyEntries: Omit<ParcelHistoryEntry, 'id'>[] = finalParsedData.plots.flatMap(parcelId => {
        const parcel = parcels.find(p => p.id === parcelId)!;
        return {
            logId: newLogId,
            parcelId: parcel.id,
            parcelName: parcel.name,
            crop: parcel.crop,
            variety: parcel.variety,
            product: finalParsedData.product,
            dosage: finalParsedData.dosage,
            unit: finalParsedData.unit,
            date: new Date(),
        }
      });
      addParcelHistoryEntries(historyEntries);
    }
    
    revalidatePath('/');
    revalidatePath('/logboek');
    revalidatePath('/perceelhistorie');

    return {
      message: 'Invoer succesvol verwerkt.',
      entry: newEntry,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Onbekende fout van AI.';
    const errorEntry: LogbookEntry = {
      id: newLogId,
      rawInput,
      status: 'Fout',
      timestamp: new Date(),
      validationMessage: `Analyse mislukt: ${errorMessage}`,
    };
    addLogbookEntry(errorEntry);
    revalidatePath('/');
    revalidatePath('/logboek');

    return {
      message: `Fout bij verwerken: ${errorMessage}`,
      entry: errorEntry,
    };
  }
}
