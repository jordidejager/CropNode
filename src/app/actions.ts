
'use server';

import { z } from 'zod';
import { addLogbookEntry, updateLogbookEntry, addParcelHistoryEntries, getProducts, dbDeleteLogbookEntry, getLogbookEntry, getParcels, addMiddelen, addUploadLog, deleteAllMiddelen as dbDeleteAllMiddelen, getMiddelen, getUserPreferences, setUserPreference, dbDeleteLogbookEntries, addInventoryMovement, getParcelHistoryEntries } from '@/lib/store';
import type { LogbookEntry, Parcel, ParcelHistoryEntry, ParsedSprayData, UploadLog, Middel, ProductEntry, InventoryMovement } from '@/lib/types';
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

async function validateSprayData(db: Firestore, parsedData: ParsedSprayData, parcels: Parcel[]): Promise<{ isValid: boolean, validationMessage: string, updatedProducts?: ProductEntry[] }> {
    const validationMessages: string[] = [];
    const uniqueCrops = [...new Set(
        parsedData.plots.map(parcelId => parcels.find(p => p.id === parcelId)?.crop).filter(Boolean)
    )];
    const middelMatrix = await getMiddelen(db);
    
    const updatedProducts: ProductEntry[] = JSON.parse(JSON.stringify(parsedData.products)); // Deep copy

    for (let i = 0; i < updatedProducts.length; i++) {
        const productEntry = updatedProducts[i];
        
        const matchingRules = middelMatrix.filter(m => m['Middelnaam']?.toLowerCase() === productEntry.product.toLowerCase());

        if (matchingRules.length === 0) {
            validationMessages.push(`⚠️ Product "${productEntry.product}" niet gevonden in de MiddelMatrix.`);
            continue; // Skip to next product
        }
        
        let productAllowedOnAnySelectedCrop = false;
        for (const crop of uniqueCrops) {
            const ruleForCrop = matchingRules.find(m => String(m['Toepassingsgebied']).toLowerCase().includes(crop.toLowerCase()));
            if (ruleForCrop) {
                productAllowedOnAnySelectedCrop = true;
                const maxDosageString = ruleForCrop['Maximum middeldosis'];
                if (maxDosageString) {
                    const maxDosage = parseFloat(String(maxDosageString).replace(',', '.'));
                    if (!isNaN(maxDosage) && productEntry.dosage > maxDosage) {
                         const msg = `⚠️ Dosering voor ${productEntry.product} op '${crop}' (${productEntry.dosage} ${productEntry.unit}) overschrijdt de maximale dosering van ${maxDosageString}.`;
                         if (!validationMessages.includes(msg)) validationMessages.push(msg);
                    }
                }
            }
        }

        if (!productAllowedOnAnySelectedCrop && uniqueCrops.length > 0) {
            const msg = `⚠️ ${productEntry.product} mag mogelijk niet gebruikt worden op de geselecteerde gewassen (${uniqueCrops.join(', ')}).`;
            if (!validationMessages.includes(msg)) validationMessages.push(msg);
        }
    }

    if (validationMessages.length > 0) {
        return {
            isValid: false,
            validationMessage: validationMessages.join(' '),
            updatedProducts: updatedProducts,
        };
    }

    return {
        isValid: true,
        validationMessage: '',
        updatedProducts: updatedProducts
    };
}


async function getFinalParsedData(rawInput: string): Promise<{ finalParsedData: ParsedSprayData, parcels: Parcel[]}> {
  const { firestore } = initializeFirebase();
  const [allParcels, allProductNames] = await Promise.all([
    getParcels(firestore),
    getProducts(firestore)
  ]);

  const llmResponse = await parseSprayApplication({
    naturalLanguageInput: rawInput,
    plots: JSON.stringify(allParcels.map(p => ({ id: p.id, name: p.name, crop: p.crop, variety: p.variety }))),
    productNames: allProductNames
  });
  
  // Clean potential markdown
  const cleanedOutput = llmResponse.plots ? llmResponse : JSON.parse(JSON.stringify(llmResponse).replace(/```json/g, '').replace(/```/g, ''));

  return {
    finalParsedData: {
        plots: cleanedOutput.plots || [],
        products: cleanedOutput.products || []
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
    let { finalParsedData, parcels } = await getFinalParsedData(rawInput);

    if (!finalParsedData || finalParsedData.plots.length === 0) {
        throw new Error("AI kon geen geldige percelen identificeren in de output.");
    }
     if (finalParsedData.products.length === 0) {
        throw new Error("AI kon geen geldige middelen identificeren in de output.");
    }
    
    const { isValid, validationMessage, updatedProducts } = await validateSprayData(firestore, finalParsedData, parcels);

    if (updatedProducts) {
        finalParsedData.products = updatedProducts;
    }

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
      await addParcelHistoryEntries(firestore, {
        logbookEntry: newEntry,
        parcels: parcels,
      });
    }
    
    revalidatePath('/');
    revalidatePath('/spuitschrift');
    revalidatePath('/voorraad');

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
    } else {
        // Also learn if the user typed an alias and it was corrected.
        await setUserPreference(db, { alias: originalProduct, preferred: correctedProduct });
    }
}

export async function updateAndConfirmEntry(entry: LogbookEntry, originalProducts: ProductEntry[]): Promise<FormState> {
    const { firestore } = initializeFirebase();
    if (!entry.parsedData) {
        return { message: "Fout: Geen geparseerde data om op te slaan." };
    }
    
    const allParcels = await getParcels(firestore);
    const { isValid, validationMessage, updatedProducts } = await validateSprayData(firestore, entry.parsedData, allParcels);
    
    if (updatedProducts) {
        entry.parsedData.products = updatedProducts;
    }
    
    const updatedEntryData: Partial<LogbookEntry> = {
        ...entry,
    };

    if (isValid) {
        updatedEntryData.status = 'Akkoord';
        updatedEntryData.validationMessage = ''; // Clear validation message
    } else {
        updatedEntryData.status = 'Te Controleren';
        updatedEntryData.validationMessage = validationMessage;
    }

    const updatedEntry = updatedEntryData as LogbookEntry;

    await updateLogbookEntry(firestore, updatedEntry);

    // Learn from corrections
    if (updatedEntry.parsedData?.products) {
        for (let i = 0; i < updatedEntry.parsedData.products.length; i++) {
            const original = originalProducts[i];
            const corrected = updatedEntry.parsedData.products[i];
            if (original && corrected) {
               await learnFromCorrection(firestore, original.product, corrected.product);
            }
        }
    }


    if (updatedEntry.status === 'Akkoord' && updatedEntry.parsedData) {
        await addParcelHistoryEntries(firestore, {
            logbookEntry: updatedEntry,
            parcels: allParcels,
        });
    }

    revalidatePath('/');
    revalidatePath('/spuitschrift');
    revalidatePath('/voorraad');

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
    revalidatePath('/');
    revalidatePath('/spuitschrift');
    revalidatePath('/voorraad');
}

export async function deleteLogbookEntries(entryIds: string[]) {
    const { firestore } = initializeFirebase();
    await dbDeleteLogbookEntries(firestore, entryIds);
    revalidatePath('/');
    revalidatePath('/spuitschrift');
    revalidatePath('/voorraad');
}


export async function confirmLogbookEntry(entryId: string): Promise<{ success: boolean; message?: string }> {
    const { firestore } = initializeFirebase();
    try {
        let [entry, allParcels] = await Promise.all([
          getLogbookEntry(firestore, entryId),
          getParcels(firestore),
        ]);

        if (!entry) {
            return { success: false, message: 'Logboekregel niet gevonden.' };
        }
        if (!entry.parsedData) {
            return { success: false, message: 'Geen data om te bevestigen.' };
        }
        
        // This validation is key. Even if the button is somehow enabled, the backend will check.
        const { isValid, validationMessage, updatedProducts } = await validateSprayData(firestore, entry.parsedData, allParcels);
        
        if (updatedProducts) {
            entry.parsedData.products = updatedProducts;
        }

        if (!isValid) {
            // Update status to 'Te Controleren' and save validation message just in case it wasn't there
            entry.status = 'Te Controleren';
            entry.validationMessage = validationMessage;
            await updateLogbookEntry(firestore, entry);
            revalidatePath('/');
            return { success: false, message: `Kan niet bevestigen: ${validationMessage}` };
        }
        
        entry.status = 'Akkoord';
        entry.validationMessage = ''; // Explicitly clear validation message on confirmation

        await updateLogbookEntry(firestore, entry);

        await addParcelHistoryEntries(firestore, {
            logbookEntry: entry,
            parcels: allParcels,
        });

        revalidatePath('/');
        revalidatePath('/spuitschrift');
        revalidatePath('/voorraad');

        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Onbekende fout.';
        return { success: false, message };
    }
}

export async function confirmLogbookEntries(entryIds: string[]): Promise<{ success: boolean; message?: string, count: number }> {
    const { firestore } = initializeFirebase();
    let confirmedCount = 0;
    try {
        const allParcels = await getParcels(firestore);
        
        for (const entryId of entryIds) {
            const entry = await getLogbookEntry(firestore, entryId);
            if (!entry || !entry.parsedData) continue;
            
            const { isValid, updatedProducts } = await validateSprayData(firestore, entry.parsedData, allParcels);
            if (updatedProducts) {
                entry.parsedData.products = updatedProducts;
            }
            
            if (!isValid) continue; // Skip entries that are not valid

            entry.status = 'Akkoord';
            entry.validationMessage = '';
            await updateLogbookEntry(firestore, entry);

            await addParcelHistoryEntries(firestore, {
                logbookEntry: entry,
                parcels: allParcels
            });
            confirmedCount++;
        }

        if (confirmedCount > 0) {
            revalidatePath('/');
            revalidatePath('/spuitschrift');
            revalidatePath('/voorraad');
        }

        return { success: true, count: confirmedCount };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Onbekende fout.';
        return { success: false, message, count: 0 };
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

const addStockSchema = z.object({
  productName: z.string().min(1, 'Productnaam is verplicht'),
  quantity: z.coerce.number().min(0.001, 'Hoeveelheid moet groter dan 0 zijn'),
  unit: z.string().min(1, 'Eenheid is verplicht'),
});

export async function addNewStock(formData: FormData): Promise<{ success: boolean; message: string }> {
  const validatedFields = addStockSchema.safeParse({
    productName: formData.get('productName'),
    quantity: formData.get('quantity'),
    unit: formData.get('unit'),
  });

  if (!validatedFields.success) {
    return { success: false, message: validatedFields.error.flatten().fieldErrors.productName?.[0] || validatedFields.error.flatten().fieldErrors.quantity?.[0] || 'Validatiefout.' };
  }

  const { productName, quantity, unit } = validatedFields.data;
  const { firestore } = initializeFirebase();

  try {
    const newMovement: Omit<InventoryMovement, 'id'> = {
      productName,
      quantity,
      unit,
      type: 'addition',
      date: new Date(),
      description: 'Handmatige toevoeging (levering)',
    };
    await addInventoryMovement(firestore, newMovement);
    revalidatePath('/voorraad');
    return { success: true, message: `${quantity} ${unit} van ${productName} succesvol toegevoegd aan de voorraad.` };
  } catch (error: any) {
    console.error('Fout bij het toevoegen van voorraad:', error);
    return { success: false, message: error.message || 'Onbekende fout bij het toevoegen van voorraad.' };
  }
}


    
