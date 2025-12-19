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
  const validationMessages: string[] = [];
  const uniqueCrops = [...new Set(
    parsedData.plots.map(parcelId => parcels.find(p => p.id === parcelId)?.crop).filter(Boolean)
  )];

  for (const productEntry of parsedData.products) {
    for (const crop of uniqueCrops) {
      const rule = middelMatrix.find(m => 
        m.product.toLowerCase() === productEntry.product.toLowerCase() && 
        m.crop.toLowerCase() === crop.toLowerCase()
      );

      if (!rule) {
        const msg = `⚠️ ${productEntry.product} mag mogelijk niet gebruikt worden op het gewas '${crop}'.`;
        if (!validationMessages.includes(msg)) {
          validationMessages.push(msg);
        }
      } else if (productEntry.dosage > rule.maxDosage) {
        const msg = `⚠️ Dosering voor ${productEntry.product} op '${crop}' overschrijdt de maximale dosering van ${rule.maxDosage.toFixed(2)} ${rule.unit}.`;
        if (!validationMessages.includes(msg)) {
          validationMessages.push(msg);
        }
      }
    }
  }
    
  return {
    isValid: validationMessages.length === 0,
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
    
    const { isValid, validationMessage } = validateSprayData(finalParsedData);

    const newEntry: LogbookEntry = {
      id: newLogId,
      rawInput,
      status: isValid ? 'Akkoord' : 'Te Controleren',
      timestamp: new Date(),
      parsedData: finalParsedData,
      validationMessage: validationMessage.trim() || undefined,
    };

    addLogbookEntry(newEntry);

    // If valid, also add to parcel history immediately
    if (isValid) {
      const historyEntries: Omit<ParcelHistoryEntry, 'id'>[] = finalParsedData.plots.flatMap(parcelId => {
        const parcel = parcels.find(p => p.id === parcelId)!;
        return finalParsedData.products.map(productEntry => ({
          logId: newEntry.id,
          parcelId: parcel.id,
          parcelName: parcel.name,
          crop: parcel.crop,
          variety: parcel.variety,
          product: productEntry.product,
          dosage: productEntry.dosage,
          unit: productEntry.unit,
          date: new Date(newEntry.timestamp),
        }));
      });
      addParcelHistoryEntries(historyEntries.flat());
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

export async function updateAndConfirmEntry(entry: LogbookEntry): Promise<FormState> {
    if (!entry.parsedData) {
        return { message: "Fout: Geen geparseerde data om op te slaan." };
    }
    
    const { isValid, validationMessage } = validateSprayData(entry.parsedData);
    
    const updatedEntry: LogbookEntry = {
        ...entry,
        status: 'Akkoord', // If we confirm, it should be Akkoord
        validationMessage: validationMessage.trim() || undefined,
    };

    // If it becomes valid after editing, set status to Akkoord
    if (isValid) {
        updatedEntry.status = 'Akkoord';
        updatedEntry.validationMessage = undefined; // Clear warnings if it's now valid
    } else {
        // If still not valid, keep it as 'Te Controleren'
        updatedEntry.status = 'Te Controleren';
        updatedEntry.validationMessage = validationMessage.trim() || "Aangepaste data is nog steeds niet volledig valide.";
    }


    addLogbookEntry(updatedEntry);

    // Add to parcel history ONLY when status is 'Akkoord'
    if (updatedEntry.status === 'Akkoord' && updatedEntry.parsedData) {
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
        // This should probably remove old entries for this logId and add new ones, but for now we just add.
        // A more robust solution would handle updates.
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
