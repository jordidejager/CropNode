
'use server';

import { z } from 'zod';
import { parseSprayApplication } from '@/ai/flows/parse-spray-application';
import { parcels, middelMatrix } from '@/lib/data';
import { addLogbookEntry, updateLogbookEntry, addParcelHistoryEntries, getProducts, addProduct, deleteLogbookEntry as dbDeleteLogbookEntry, getLogbookEntry } from '@/lib/store';
import type { LogbookEntry, ParcelHistoryEntry, ParsedSprayData } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { initializeFirebase } from '@/firebase';
import { Timestamp } from 'firebase/firestore';

const formSchema = z.object({
  rawInput: z.string().min(10, 'Voer alsjeblieft een geldige bespuiting in.'),
});

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

    if (validationMessages.length > 0) {
        return {
            isValid: false,
            validationMessage: validationMessages.join(' ')
        };
    }

    return {
        isValid: true,
        validationMessage: ''
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
  const newDate = new Date();

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
      date: newDate,
      parsedData: finalParsedData,
    };
    
    if (validationMessage) {
        newEntryData.validationMessage = validationMessage;
    }

    const newEntry = await addLogbookEntry(firestore, newEntryData);

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
          date: newDate,
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
    
    const errorEntryData: Omit<LogbookEntry, 'id'> = {
      rawInput,
      status: 'Fout',
      date: newDate,
      validationMessage: `Analyse mislukt: ${errorMessage}`,
    };

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

    if (isValid) {
        updatedEntryData.status = 'Akkoord';
        updatedEntryData.validationMessage = undefined;
    } else {
        updatedEntryData.status = 'Te Controleren';
        updatedEntryData.validationMessage = validationMessage || undefined;
    }

    const updatedEntry = updatedEntryData as LogbookEntry;

    await updateLogbookEntry(firestore, updatedEntry);

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


export async function confirmLogbookEntry(entryId: string): Promise<{ success: boolean; message?: string }> {
    const { firestore } = initializeFirebase();
    try {
        const entry = await getLogbookEntry(firestore, entryId);

        if (!entry) {
            return { success: false, message: 'Logboekregel niet gevonden.' };
        }
        if (!entry.parsedData) {
            return { success: false, message: 'Geen data om te bevestigen.' };
        }

        const { isValid, validationMessage } = validateSprayData(entry.parsedData);
        if (!isValid) {
            return { success: false, message: `Kan niet bevestigen: ${validationMessage}` };
        }
        
        entry.status = 'Akkoord';
        entry.validationMessage = undefined;

        await updateLogbookEntry(firestore, entry);

        const historyEntries: Omit<ParcelHistoryEntry, 'id'>[] = entry.parsedData.plots.flatMap(parcelId => {
            const parcel = parcels.find(p => p.id === parcelId)!;
            return entry.parsedData!.products.map(productEntry => ({
                logId: entry.id,
                parcelId: parcel.id,
                parcelName: parcel.name,
                crop: parcel.crop,
                variety: parcel.variety,
                product: productEntry.product,
                dosage: productEntry.dosage,
                unit: productEntry.unit,
                date: new Date(entry.date),
            }));
        });
        await addParcelHistoryEntries(firestore, historyEntries.flat());

        revalidatePath('/logboek');
        revalidatePath('/perceelhistorie');

        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Onbekende fout.';
        return { success: false, message };
    }
}