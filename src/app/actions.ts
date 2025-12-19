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

async function getFinalParsedData(rawInput: string): Promise<ParsedSprayData> {
  const plotDataForPrompt = parcels.map(p => ({ id: p.id, name: p.name, crop: p.crop, variety: p.variety }));
  const parsedDataFromAI: ParsedSprayData = await parseSprayApplication({
    naturalLanguageInput: rawInput,
    plots: JSON.stringify(plotDataForPrompt),
  });

  const allProducts = getProducts();
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

    // 2. Validate
    let validationMessage = '';
    let isValid = true;

    const cropsInSelection = new Set(finalParsedData.plots.map(parcelId => {
        return parcels.find(p => p.id === parcelId)?.crop;
    }).filter(Boolean));

    for (const crop of cropsInSelection) {
      for (const productEntry of finalParsedData.products) {
        const rule = middelMatrix.find(m => 
          m.product.toLowerCase() === productEntry.product.toLowerCase() && 
          m.crop === crop
        );

        if (!rule) {
          isValid = false;
          validationMessage += `⚠️ ${productEntry.product} mag mogelijk niet gebruikt worden op het gewas '${crop}'. `;
        } else if (productEntry.dosage > rule.maxDosage) {
          isValid = false;
          validationMessage += `⚠️ Dosering ${productEntry.dosage.toFixed(2)} ${productEntry.unit} voor ${productEntry.product} op '${crop}' overschrijdt de maximale dosering van ${rule.maxDosage.toFixed(2)} ${rule.unit}. `;
        }
      }
      if (!isValid) break; 
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
    if (isValid && newEntry.parsedData) {
      const historyEntries: Omit<ParcelHistoryEntry, 'id'>[] = finalParsedData.plots.flatMap(parcelId => {
        const parcel = parcels.find(p => p.id === parcelId)!;
        return finalParsedData.products.map(productEntry => ({
            logId: newLogId,
            parcelId: parcel.id,
            parcelName: parcel.name,
            crop: parcel.crop,
            variety: parcel.variety,
            product: productEntry.product,
            dosage: productEntry.dosage,
            unit: productEntry.unit,
            date: new Date(),
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
