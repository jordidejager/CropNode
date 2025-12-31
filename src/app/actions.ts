
'use server';

import { z } from 'zod';
import { addLogbookEntry, updateLogbookEntry, addParcelHistoryEntries, getProducts, deleteLogbookEntry as dbDeleteLogbookEntry, getLogbookEntry, getParcels, addMiddelen, addUploadLog, deleteAllMiddelen as dbDeleteAllMiddelen, getMiddelen, getUserPreferences, setUserPreference } from '@/lib/store';
import type { LogbookEntry, Parcel, ParcelHistoryEntry, ParsedSprayData, UploadLog, Middel, ProductEntry } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { initializeFirebase } from '@/firebase';
import { Firestore, Timestamp } from 'firebase/firestore';
import * as xlsx from 'xlsx';
import { parseSprayApplication } from '@/ai/flows/parse-spray-application';


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

async function validateSprayData(db: Firestore, parsedData: ParsedSprayData, parcels: Parcel[]): Promise<{ isValid: boolean, validationMessage: string }> {
    const validationMessages: string[] = [];
    const uniqueCrops = [...new Set(
        parsedData.plots.map(parcelId => parcels.find(p => p.id === parcelId)?.crop).filter(Boolean)
    )];
    const middelMatrix = await getMiddelen(db);

    for (const productEntry of parsedData.products) {
        let hasRuleForCrop = false;
        for (const crop of uniqueCrops) {
             const rule = middelMatrix.find(m =>
                m['Middelnaam']?.toLowerCase() === productEntry.product.toLowerCase() &&
                String(m['Toepassingsgebied']).toLowerCase().includes(crop.toLowerCase())
            );

            if (rule) {
                hasRuleForCrop = true;
                const maxDosageString = rule['Maximum middeldosis'];
                const maxDosage = parseFloat(String(maxDosageString).replace(',', '.'));
                
                if (!isNaN(maxDosage) && productEntry.dosage > maxDosage) {
                     const msg = `⚠️ Dosering voor ${productEntry.product} op '${crop}' (${productEntry.dosage} ${productEntry.unit}) overschrijdt de maximale dosering van ${maxDosageString}.`;
                     if (!validationMessages.includes(msg)) {
                         validationMessages.push(msg);
                     }
                }
                break; 
            }
        }
         if (!hasRuleForCrop && uniqueCrops.length > 0) {
            const msg = `⚠️ ${productEntry.product} mag mogelijk niet gebruikt worden op de geselecteerde gewassen (${uniqueCrops.join(', ')}).`;
            if (!validationMessages.includes(msg)) {
                validationMessages.push(msg);
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


async function getFinalParsedData(rawInput: string): Promise<{ finalParsedData: ParsedSprayData, parcels: Parcel[]}> {
  const { firestore } = initializeFirebase();
  const [allProducts, allParcels, preferences] = await Promise.all([
    getProducts(firestore),
    getParcels(firestore),
    getUserPreferences(firestore)
  ]);

  const parsedDataFromAI: ParsedSprayData = await parseSprayApplication({
    naturalLanguageInput: rawInput,
    plots: JSON.stringify(allParcels.map(p => ({ id: p.id, name: p.name, crop: p.crop, variety: p.variety }))),
    products: JSON.stringify(allProducts),
    preferences: JSON.stringify(preferences),
  });

  return {
    finalParsedData: {
        plots: parsedDataFromAI.plots || [],
        products: parsedDataFromAI.products || []
    },
    parcels: allParcels
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
    const { finalParsedData, parcels } = await getFinalParsedData(rawInput);

    if (finalParsedData.plots.length === 0) {
        throw new Error("AI kon geen geldige percelen identificeren in de output.");
    }
     if (finalParsedData.products.length === 0) {
        throw new Error("AI kon geen geldige middelen identificeren in de output.");
    }
    
    const { isValid, validationMessage } = await validateSprayData(firestore, finalParsedData, parcels);

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
      const historyEntries: Omit<ParcelHistoryEntry, 'id'>[] = finalParsedData.plots.map(parcelId => {
        return finalParsedData.products.map(productEntry => ({
          logId: newEntry.id,
          parcelId: parcelId,
          product: productEntry.product,
          dosage: productEntry.dosage,
          unit: productEntry.unit,
          date: newDate,
          // These fields will be populated by addParcelHistoryEntries
          parcelName: '', 
          crop: '', 
          variety: ''
        }));
      }).flat();
      await addParcelHistoryEntries(firestore, historyEntries, parcels);
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

async function learnFromCorrection(db: Firestore, originalProduct: string, correctedProduct: string) {
    if (originalProduct.toLowerCase() === correctedProduct.toLowerCase()) {
        return;
    }

    // A simple way to find a common "alias" is to take the first word if it's the same.
    const originalFirstWord = originalProduct.split(' ')[0].toLowerCase();
    const correctedFirstWord = correctedProduct.split(' ')[0].toLowerCase();
    
    if (originalFirstWord === correctedFirstWord) {
        await setUserPreference(db, { alias: originalFirstWord, preferred: correctedProduct });
    }
}

export async function updateAndConfirmEntry(entry: LogbookEntry, originalProducts: ProductEntry[]): Promise<FormState> {
    const { firestore } = initializeFirebase();
    if (!entry.parsedData) {
        return { message: "Fout: Geen geparseerde data om op te slaan." };
    }
    
    const allParcels = await getParcels(firestore);
    const { isValid, validationMessage } = await validateSprayData(firestore, entry.parsedData, allParcels);
    
    const updatedEntryData: Partial<LogbookEntry> = {
        ...entry,
    };

    if (isValid) {
        updatedEntryData.status = 'Akkoord';
        delete updatedEntryData.validationMessage;
    } else {
        updatedEntryData.status = 'Te Controleren';
        updatedEntryData.validationMessage = validationMessage;
    }

    const updatedEntry = updatedEntryData as LogbookEntry;

    await updateLogbookEntry(firestore, updatedEntry);

    // Learn from corrections
    for (let i = 0; i < updatedEntry.parsedData.products.length; i++) {
        const original = originalProducts[i];
        const corrected = updatedEntry.parsedData.products[i];
        if (original && corrected) {
           await learnFromCorrection(firestore, original.product, corrected.product);
        }
    }


    if (updatedEntry.status === 'Akkoord' && updatedEntry.parsedData) {
        const historyEntries: Omit<ParcelHistoryEntry, 'id'>[] = updatedEntry.parsedData.plots.map(parcelId => {
            return updatedEntry.parsedData!.products.map(productEntry => ({
                logId: updatedEntry.id,
                parcelId: parcelId,
                product: productEntry.product,
                dosage: productEntry.dosage,
                unit: productEntry.unit,
                date: new Date(updatedEntry.date),
                // These fields will be populated by addParcelHistoryEntries
                parcelName: '', 
                crop: '', 
                variety: ''
            }));
        }).flat();
        await addParcelHistoryEntries(firestore, historyEntries, allParcels);
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
        const [entry, allParcels] = await Promise.all([
          getLogbookEntry(firestore, entryId),
          getParcels(firestore),
        ]);

        if (!entry) {
            return { success: false, message: 'Logboekregel niet gevonden.' };
        }
        if (!entry.parsedData) {
            return { success: false, message: 'Geen data om te bevestigen.' };
        }
        if (entry.validationMessage) {
            return { success: false, message: `Kan niet bevestigen. Los eerst de volgende waarschuwing op: ${entry.validationMessage}` };
        }

        const { isValid, validationMessage } = await validateSprayData(firestore, entry.parsedData, allParcels);
        if (!isValid) {
            // Update status to 'Te Controleren' and save validation message
            entry.status = 'Te Controleren';
            entry.validationMessage = validationMessage;
            await updateLogbookEntry(firestore, entry);
            revalidatePath('/logboek');
            return { success: false, message: `Kan niet bevestigen: ${validationMessage}` };
        }
        
        entry.status = 'Akkoord';
        delete entry.validationMessage;

        await updateLogbookEntry(firestore, entry);

        const historyEntries: Omit<ParcelHistoryEntry, 'id'>[] = entry.parsedData.plots.map(parcelId => {
            return entry.parsedData!.products.map(productEntry => ({
                logId: entry.id,
                parcelId: parcelId,
                product: productEntry.product,
                dosage: productEntry.dosage,
                unit: productEntry.unit,
                date: new Date(entry.date),
                // These fields will be populated by addParcelHistoryEntries
                parcelName: '', 
                crop: '', 
                variety: ''
            }));
        }).flat();
        await addParcelHistoryEntries(firestore, historyEntries, allParcels);

        revalidatePath('/logboek');
        revalidatePath('/perceelhistorie');

        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Onbekende fout.';
        return { success: false, message };
    }
}

const fileSchema = z.object({
    file: z.instanceof(File),
});

export async function parseCtgbFileAndImport(formData: FormData): Promise<{ success: boolean; message: string }> {
    const validatedFields = fileSchema.safeParse({ file: formData.get('file') });
    if (!validatedFields.success) {
        return { success: false, message: 'Geen geldig bestand ontvangen.' };
    }
    const { file } = validatedFields.data;
    const { firestore } = initializeFirebase();

    try {
        const buffer = await file.arrayBuffer();
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Convert sheet to JSON, using an array of arrays and raw values
        const jsonData: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false });
        
        if (jsonData.length < 2) {
            throw new Error("Het Excel-bestand is leeg of heeft geen kopteksten.");
        }

        const headers: string[] = jsonData[0];
        const rows = jsonData.slice(1);

        const middelen: Omit<Middel, 'id'>[] = rows.map(row => {
            const middel: Omit<Middel, 'id'> = {};
            headers.forEach((header, index) => {
                if (header) { // Only add if header is not empty
                    middel[header] = row[index] ?? ''; // Use empty string for undefined/null values
                }
            });
            return middel;
        }).filter(m => Object.keys(m).length > 0 && m['Middelnaam']); // Filter out completely empty rows and rows without a name
        
        if (middelen.length === 0) {
            throw new Error(`Kon geen geldige data extraheren uit ${file.name}. Controleer of het bestand correct is opgemaakt.`);
        }
        
        await addMiddelen(firestore, middelen);
        
        revalidatePath('/middelmatrix');
        return { success: true, message: `${middelen.length} regels succesvol geïmporteerd uit ${file.name}.` };

    } catch (error: any) {
        console.error(`Fout bij verwerken van CTGB bestand ${file.name}:`, error);
        // Re-throw the error with a more specific message to be caught by the client
        throw new Error(error.message || "Onbekende fout bij verwerken van bestand.");
    }
}


export async function deleteAllMiddelen(): Promise<{ success: boolean; message: string }> {
    const { firestore } = initializeFirebase();
    try {
        await dbDeleteAllMiddelen(firestore);
        revalidatePath('/middelmatrix');
        return { success: true, message: 'Alle middelen zijn succesvol verwijderd.' };
    } catch (error: any) {
        console.error('Fout bij het verwijderen van alle middelen:', error);
        return { success: false, message: error.message || 'Onbekende fout bij het verwijderen van de middelen.' };
    }
}
