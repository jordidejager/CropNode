
'use server';

import { z } from 'zod';
import { parseSprayApplication } from '@/ai/flows/parse-spray-application';
import { parcels, middelMatrix } from '@/lib/data';
import { addLogbookEntry, updateLogbookEntry, addParcelHistoryEntries, getProducts, addProduct, deleteLogbookEntry as dbDeleteLogbookEntry } from '@/lib/store';
import type { LogbookEntry, ParcelHistoryEntry, ParsedSprayData } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { initializeFirebase } from '@/firebase';
import { Timestamp } from 'firebase/firestore';

const formSchema = z.object({
  rawInput: z.string().min(10, 'Voer alsjeblieft een geldige bespuiting in.'),
});

// We need to return a serializable version of the entry from the server action
type SerializableLogbookEntry = Omit<LogbookEntry, 'date'> & { date: string };

export type FormState = {
  message: string;
  entry?: SerializableLogbookEntry;
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
  const { firestore } = initializeFirebase();
  const allProducts = await getProducts(firestore);

  const parsedDataFromAI: ParsedSprayData = await parseSprayApplication({
    naturalLanguageInput: rawInput,
    plots: JSON.stringify(parcels.map(p => ({ id: p.id, name: p.name, crop: p.crop, variety: p.variety }))),
    products: JSON.stringify(allProducts),
  });

  // Ensure newly parsed products are added to the list if they are not already there.
  for (const p of parsedDataFromAI.products) {
      if (p.product) {
          const products = await getProducts(firestore);
          if (!products.find(existing => existing.toLowerCase() === p.product.toLowerCase())) {
              await addProduct(firestore, p.product);
          }
      }
  }
  
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
  const { firestore } = initializeFirebase();

  try {
    const finalParsedData = await getFinalParsedData(rawInput);

    if (finalParsedData.plots.length === 0) {
        throw new Error("AI kon geen geldige percelen identificeren in de output.");
    }
     if (finalParsedData.products.length === 0) {
        throw new Error("AI kon geen geldige middelen identificeren in de output.");
    }
    
    const { isValid, validationMessage } = validateSprayData(finalParsedData);

    const newEntryData: Omit<LogbookEntry, 'id'> = {
      rawInput,
      status: isValid ? 'Akkoord' : 'Te Controleren',
      date: new Date(),
      parsedData: finalParsedData,
    };
    
    if (validationMessage) {
        newEntryData.validationMessage = validationMessage.trim();
    }

    const newEntry = await addLogbookEntry(firestore, newEntryData);

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
          date: new Date(newEntry.date),
        }));
      });
      await addParcelHistoryEntries(firestore, historyEntries.flat());
    }
    
    revalidatePath('/');
    revalidatePath('/logboek');
    revalidatePath('/perceelhistorie');

    return {
      message: 'Invoer succesvol verwerkt.',
      entry: { ...newEntry, date: newEntry.date.toISOString() },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Onbekende fout van AI.';
    const newDate = new Date();
    const errorEntryData: Omit<LogbookEntry, 'id'> = {
      rawInput,
      status: 'Fout',
      date: newDate,
    };
     if (errorMessage) {
        errorEntryData.validationMessage = `Analyse mislukt: ${errorMessage}`;
    }

    const errorEntry = await addLogbookEntry(firestore, errorEntryData);
    revalidatePath('/');
    revalidatePath('/logboek');

    return {
      message: `Fout bij verwerken: ${errorMessage}`,
      entry: { ...errorEntry, date: newDate.toISOString() },
    };
  }
}

export async function updateAndConfirmEntry(entry: LogbookEntry): Promise<FormState> {
    const { firestore } = initializeFirebase();
    if (!entry.parsedData) {
        return { message: "Fout: Geen geparseerde data om op te slaan." };
    }
    
    const { isValid, validationMessage } = validateSprayData(entry.parsedData);
    
    const updatedEntryData: Partial<LogbookEntry> = {
        ...entry,
    };

    // If it becomes valid after editing, set status to Akkoord
    if (isValid) {
        updatedEntryData.status = 'Akkoord';
        delete updatedEntryData.validationMessage; // Clear warnings if it's now valid
    } else {
        // If still not valid, keep it as 'Te Controleren'
        updatedEntryData.status = 'Te Controleren';
        if (validationMessage) {
            updatedEntryData.validationMessage = validationMessage.trim();
        } else {
            delete updatedEntryData.validationMessage;
        }
    }

    const updatedEntry = updatedEntryData as LogbookEntry;

    await updateLogbookEntry(firestore, updatedEntry);

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
                date: new Date(updatedEntry.date),
            }));
        });
        // This should probably remove old entries for this logId and add new ones, but for now we just add.
        // A more robust solution would handle updates. For now we assume this is the final state.
        await addParcelHistoryEntries(firestore, historyEntries.flat());
    }

    revalidatePath('/');
    revalidatePath('/logboek');
    revalidatePath('/perceelhistorie');

    const dateToReturn = updatedEntry.date instanceof Timestamp 
      ? updatedEntry.date.toDate() 
      : new Date(updatedEntry.date);

    return {
        message: 'Bespuiting definitief opgeslagen.',
        entry: { ...updatedEntry, date: dateToReturn.toISOString() },
    };
}


export async function deleteLogbookEntry(entryId: string) {
    const { firestore } = initializeFirebase();
    await dbDeleteLogbookEntry(firestore, entryId);
    revalidatePath('/logboek');
    revalidatePath('/perceelhistorie');
}
