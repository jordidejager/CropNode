'use server';

import { z } from 'zod';
import { parseSprayApplication } from '@/ai/flows/parse-spray-application';
import { parcels, middelMatrix } from '@/lib/data';
import { addLogbookEntry, addParcelHistoryEntries, getProducts, addProduct } from '@/lib/store';
import type { LogbookEntry, ParcelHistoryEntry, ParsedSprayData, ProductEntry } from '@/lib/types';
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

function validateSprayData(parsedData: ParsedSprayData): { isValid: boolean, validationMessage: string } {
    let isValid = true;
    const validationMessages: string[] = [];

    const cropsInSelection = [...new Set(parsedData.plots.map(parcelId => {
        return parcels.find(p => p.id === parcelId)?.crop;
    }).filter(Boolean))];

    for (const crop of cropsInSelection) {
      for (const productEntry of parsedData.products) {
        const rule = middelMatrix.find(m => 
          m.product.toLowerCase() === productEntry.product.toLowerCase() && 
          m.crop.toLowerCase() === crop.toLowerCase()
        );

        if (!rule) {
          isValid = false;
          const msg = `⚠️ ${productEntry.product} mag mogelijk niet gebruikt worden op het gewas '${crop}'.`;
          if (!validationMessages.includes(msg)) {
            validationMessages.push(msg);
          }
        } else if (productEntry.dosage > rule.maxDosage) {
          isValid = false;
          const msg = `⚠️ Dosering ${productEntry.dosage.toFixed(2)} ${productEntry.unit} voor ${productEntry.product} op '${crop}' overschrijdt de maximale dosering van ${rule.maxDosage.toFixed(2)} ${rule.unit}.`;
           if (!validationMessages.includes(msg)) {
            validationMessages.push(msg);
          }
        }
      }
    }
    
    return {
        isValid,
        validationMessage: validationMessages.join(' ')
    };
}


async function getFinalParsedData(rawInput: string): Promise<ParsedSprayData> {
  const plotDataForPrompt = parcels.map(p => ({ id: p.id, name: p.name, crop: p.crop, variety: p.variety }));
  const allProducts = getProducts();

  const parsedDataFromAI: ParsedSprayData = await parseSprayApplication({
    naturalLanguageInput: rawInput,
    plots: JSON.stringify(plotDataForPrompt),
    products: JSON.stringify(allProducts),
  });

  // Ensure newly parsed products are added to the list if they are not already there.
  // This can happen if the AI finds a product that is not in the initial list for some reason.
  parsedDataFromAI.products.forEach(p => {
    if (p.product && !allProducts.find(existing => existing.toLowerCase() === p.product.toLowerCase())) {
      addProduct(p.product);
    }
  });
  
  return {
    plots: parsedDataFromAI.plots || [],
    products: parsedDataFromAI.products || []
  };
}


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
    const finalParsedData = await getFinalParsedData(rawInput);

    if (finalParsedData.plots.length === 0) {
        throw new Error("AI kon geen geldige percelen identificeren in de output.");
    }
     if (finalParsedData.products.length === 0) {
        throw new Error("AI kon geen geldige middelen identificeren in de output.");
    }
    
    // Add new product to database if it's the first time being used
    finalParsedData.products.forEach(p => {
        if (!getProducts().find(existing => existing.toLowerCase() === p.product.toLowerCase())) {
            addProduct(p.product);
        }
    });

    const { isValid, validationMessage } = validateSprayData(finalParsedData);

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

export async function updateAndConfirmEntry(entry: LogbookEntry): Promise<FormState> {
    if (!entry.parsedData) {
        return { message: "Fout: Geen geparseerde data om op te slaan." };
    }
    
    // 1. Re-validate the (potentially edited) data
    const { isValid, validationMessage } = validateSprayData(entry.parsedData);
    
    const updatedEntry: LogbookEntry = {
        ...entry,
        status: isValid ? 'Akkoord' : 'Te Controleren',
        validationMessage: validationMessage.trim() || undefined,
    };

    // 2. Update the logbook entry
    addLogbookEntry(updatedEntry);

    // 3. Add to parcel history only if it's valid
    if (isValid && updatedEntry.parsedData) {
        const historyEntries: Omit<ParcelHistoryEntry, 'id'>[] = updatedEntry.parsedData.plots.flatMap(parcelId => {
            const parcel = parcels.find(p => p.id === parcelId)!;
            return updatedEntry.parsedData!.products.map(productEntry => ({
                logId: updatedEntry.id,
                parcelId: parcel.id,
                parcelName: parcel.name,
                crop: parcel.crop,
                variety: parcel.variety,
                product: productEntry.product,
                dosage: productEntry.dosage,
                unit: productEntry.unit,
                date: new Date(updatedEntry.timestamp),
            }));
        });
        addParcelHistoryEntries(historyEntries.flat());
    }

    revalidatePath('/');
    revalidatePath('/logboek');
    revalidatePath('/perceelhistorie');

    return {
        message: 'Bespuiting definitief opgeslagen.',
        entry: updatedEntry,
    };
}
