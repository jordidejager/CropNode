
'use server';

import { z } from 'zod';
import { addLogbookEntry, updateLogbookEntry, addParcelHistoryEntries, dbDeleteLogbookEntry, getLogbookEntry, getParcels, getUserPreferences, setUserPreference, dbDeleteLogbookEntries, addInventoryMovement, getAllCtgbProducts, addSpuitschriftEntry } from '@/lib/store';
import type { LogbookEntry, Parcel, ParsedSprayData, ProductEntry, InventoryMovement, LogStatus, SpuitschriftEntry } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { initializeFirebase } from '@/firebase';
import { Firestore, Timestamp } from 'firebase/firestore';
import { parseSprayApplication } from '@/ai/flows/parse-spray-application';


const formSchema = z.object({
  rawInput: z.string().min(10, 'Voer alsjeblieft een geldige bespuiting in.'),
});

export type InitialState = {
  message: string;
  errors?: {
    rawInput?: string[];
  };
};

async function validateSprayData(db: Firestore, parsedData: ParsedSprayData, parcels: Parcel[]): Promise<{ isValid: boolean, validationMessage: string | null, errorCount: number, warningCount: number, updatedProducts?: ProductEntry[] }> {
    const allCtgbProducts = await getAllCtgbProducts(db);
    const uniqueCrops = [...new Set(
        parsedData.plots.map(parcelId => parcels.find(p => p.id === parcelId)?.crop).filter(Boolean)
    )];
    
    const updatedProducts: ProductEntry[] = JSON.parse(JSON.stringify(parsedData.products));
    const validationMessages: string[] = [];
    let errorCount = 0;
    let warningCount = 0;

    for (let i = 0; i < updatedProducts.length; i++) {
        const productEntry = updatedProducts[i];
        
        const matchingRules = allCtgbProducts.filter(m => m.naam?.toLowerCase().includes(productEntry.product.toLowerCase()));

        if (matchingRules.length === 0) {
            validationMessages.push(`⚠️ Product "${productEntry.product}" niet gevonden in de MiddelMatrix.`);
            warningCount++;
            continue; 
        }

        let officialProductName: string;
        if (matchingRules.length > 1) {
            // Try a more exact match
            const exactMatch = matchingRules.find(m => m.naam?.toLowerCase() === productEntry.product.toLowerCase());
            if (exactMatch) {
              officialProductName = exactMatch.naam;
            } else {
              validationMessages.push(`⚠️ Meerdere producten gevonden voor "${productEntry.product}". Wees specifieker.`);
              warningCount++;
              continue;
            }
        } else {
            officialProductName = matchingRules[0]['naam'];
        }
        updatedProducts[i].product = officialProductName;
        
        const matchingProduct = allCtgbProducts.find(m => m.naam === officialProductName);
        if (!matchingProduct) {
          // This should not happen if logic above is correct
          continue;
        }

        let productAllowedOnAnySelectedCrop = false;
        for (const crop of uniqueCrops) {
            const ruleForCrop = matchingProduct.gebruiksvoorschriften?.some(g => g.gewas?.toLowerCase().includes(crop.toLowerCase()));
            if (ruleForCrop) {
                productAllowedOnAnySelectedCrop = true;
                const voorschrift = matchingProduct.gebruiksvoorschriften.find(g => g.gewas?.toLowerCase().includes(crop.toLowerCase()));
                const maxDosageString = voorschrift?.dosering;

                if (maxDosageString) {
                    const maxDosage = parseFloat(String(maxDosageString).replace(/,.*$/, '').replace(',', '.'));
                    if (!isNaN(maxDosage) && productEntry.dosage > maxDosage) {
                         const msg = `⚠️ Dosering voor ${officialProductName} op '${crop}' (${productEntry.dosage} ${productEntry.unit}) overschrijdt de maximale dosering van ${maxDosageString}.`;
                         if (!validationMessages.includes(msg)) {
                             validationMessages.push(msg);
                             warningCount++;
                         }
                    }
                }
            }
        }

        if (!productAllowedOnAnySelectedCrop && uniqueCrops.length > 0) {
            const msg = `⚠️ ${officialProductName} mag mogelijk niet gebruikt worden op de geselecteerde gewassen (${uniqueCrops.join(', ')}).`;
            if (!validationMessages.includes(msg)) {
                validationMessages.push(msg);
                warningCount++;
            }
        }
    }

    return {
        isValid: errorCount === 0,
        validationMessage: validationMessages.length > 0 ? validationMessages.join(' ') : null,
        errorCount,
        warningCount,
        updatedProducts,
    };
}

async function performAnalysis(db: Firestore, entry: LogbookEntry) {
    let finalStatus: LogStatus = 'Fout';
    let finalValidationMessage: string | undefined = 'Onbekende fout.';
    let finalParsedData: ParsedSprayData | undefined = undefined;

    try {
        const [allParcels, allProductNames] = await Promise.all([
          getParcels(db),
          getAllCtgbProducts(db).then(products => products.map(p => p.naam))
        ]);

        const llmResponse = await parseSprayApplication({
            naturalLanguageInput: entry.rawInput,
            plots: JSON.stringify(allParcels.map(p => ({ id: p.id, name: p.name, crop: p.crop, variety: p.variety }))),
            productNames: allProductNames
        });
        
        const cleanedOutput = llmResponse.plots ? llmResponse : JSON.parse(JSON.stringify(llmResponse).replace(/```json/g, '').replace(/```/g, ''));
        finalParsedData = {
            plots: cleanedOutput.plots || [],
            products: cleanedOutput.products || []
        };
        
        if (!finalParsedData || finalParsedData.plots.length === 0) {
            throw new Error("AI kon geen geldige percelen identificeren in de output.");
        }
        if (finalParsedData.products.length === 0) {
            throw new Error("AI kon geen geldige middelen identificeren in de output.");
        }
        
        const { isValid, validationMessage, errorCount, warningCount, updatedProducts } = await validateSprayData(db, finalParsedData, allParcels);

        if (updatedProducts) {
            finalParsedData.products = updatedProducts;
        }
        
        if (errorCount > 0) {
            finalStatus = 'Afgekeurd';
        } else if (warningCount > 0) {
            finalStatus = 'Waarschuwing';
        } else {
            finalStatus = 'Akkoord';
        }

        finalValidationMessage = validationMessage || '';

    } catch (error: any) {
        finalStatus = 'Fout';
        finalValidationMessage = error.message && error.message.includes("The model is overloaded")
            ? "De AI is momenteel overbelast. Probeer het later opnieuw."
            : `Analyse mislukt: ${error.message || 'Onbekende fout'}`;
        finalParsedData = undefined; // Clear parsed data on error
    }

    const updatedEntryData: Partial<LogbookEntry> = {
        ...entry,
        status: finalStatus,
        validationMessage: finalValidationMessage,
        parsedData: finalParsedData,
    };
    await updateLogbookEntry(db, updatedEntryData as LogbookEntry);
}


export async function createInitialSprayEntry(prevState: InitialState, formData: FormData): Promise<InitialState> {
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

  const initialEntryData: Omit<LogbookEntry, 'id'> = {
    rawInput,
    status: 'Analyseren...',
    date: newDate,
  };

  const newEntry = await addLogbookEntry(firestore, initialEntryData);

  // Perform analysis in the background. Don't await this.
  performAnalysis(firestore, newEntry).then(() => {
    revalidatePath('/');
    revalidatePath('/spuitschrift');
    revalidatePath('/voorraad');
  });

  revalidatePath('/');

  return {
    message: 'Invoer wordt verwerkt...',
  };
}

export async function retryAnalysis(entryId: string): Promise<{ success: boolean; message: string }> {
    const { firestore } = initializeFirebase();
    try {
        const entry = await getLogbookEntry(firestore, entryId);
        if (!entry) {
            return { success: false, message: "Logboekregel niet gevonden." };
        }

        // Set status to 'Analyseren...' before starting
        await updateLogbookEntry(firestore, { ...entry, status: 'Analyseren...' });
        revalidatePath('/');

        // Perform analysis in the background.
        performAnalysis(firestore, entry).then(() => {
            revalidatePath('/');
            revalidatePath('/spuitschrift');
            revalidatePath('/voorraad');
        });

        return { success: true, message: "Analyse opnieuw gestart." };
    } catch (error: any) {
        return { success: false, message: error.message || "Onbekende fout." };
    }
}


async function learnFromCorrection(db: Firestore, originalProduct: string, correctedProduct: string) {
    if (originalProduct.toLowerCase() === correctedProduct.toLowerCase()) {
        return;
    }
    const originalFirstWord = originalProduct.split(' ')[0].toLowerCase();
    const correctedFirstWord = correctedProduct.split(' ')[0].toLowerCase();
    
    if (originalFirstWord === correctedFirstWord) {
        await setUserPreference(db, { alias: originalFirstWord, preferred: correctedProduct });
    } else {
        await setUserPreference(db, { alias: originalProduct, preferred: correctedProduct });
    }
}

type FormState = {
  message: string;
  entry?: LogbookEntry;
};


export async function updateAndConfirmEntry(entry: LogbookEntry, originalProducts: ProductEntry[]): Promise<FormState> {
    const { firestore } = initializeFirebase();
    if (!entry.parsedData) {
        return { message: "Fout: Geen geparseerde data om op te slaan." };
    }
    
    const allParcels = await getParcels(firestore);
    const { isValid, validationMessage, updatedProducts, errorCount, warningCount } = await validateSprayData(firestore, entry.parsedData, allParcels);
    
    if (updatedProducts) {
        entry.parsedData.products = updatedProducts;
    }
    
    const updatedEntryData: Partial<LogbookEntry> = {
        ...entry,
    };

    if (errorCount > 0) {
        updatedEntryData.status = 'Afgekeurd';
        updatedEntryData.validationMessage = validationMessage || 'Validatie mislukt met fouten.';
         await updateLogbookEntry(firestore, updatedEntryData as LogbookEntry);
    } else {
        updatedEntryData.status = warningCount > 0 ? 'Waarschuwing' : 'Akkoord';
        updatedEntryData.validationMessage = validationMessage || '';
        await updateLogbookEntry(firestore, updatedEntryData as LogbookEntry);
    }

    // Learn from corrections
    if (entry.parsedData?.products) {
        for (let i = 0; i < entry.parsedData.products.length; i++) {
            const original = originalProducts[i];
            const corrected = entry.parsedData.products[i];
            if (original && corrected) {
               await learnFromCorrection(firestore, original.product, corrected.product);
            }
        }
    }

    revalidatePath('/');
    revalidatePath('/spuitschrift');
    revalidatePath('/voorraad');
    
    const dateToReturn = entry.date instanceof Timestamp 
      ? entry.date.toDate() 
      : new Date(entry.date);

    return {
        message: 'Wijzigingen opgeslagen.',
        entry: { ...entry, date: dateToReturn.toISOString() } as any, // HACK: for type compatibility with form state
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
        
        const { isValid, validationMessage, updatedProducts, errorCount, warningCount } = await validateSprayData(firestore, entry.parsedData, allParcels);
        
        if (updatedProducts) {
            entry.parsedData.products = updatedProducts;
        }

        if (errorCount > 0) {
            entry.status = 'Afgekeurd';
            entry.validationMessage = validationMessage || 'Kon niet bevestigen vanwege validatiefouten.';
            await updateLogbookEntry(firestore, entry);
            revalidatePath('/');
            return { success: false, message: `Kan niet bevestigen: ${validationMessage}` };
        }
        
        // Maak een nieuwe Spuitschrift entry
        const spuitschriftEntry: Omit<SpuitschriftEntry, 'id'> = {
            originalRawInput: entry.rawInput,
            date: entry.date,
            plots: entry.parsedData.plots,
            products: entry.parsedData.products,
            status: warningCount > 0 ? 'Waarschuwing' : 'Akkoord',
            ...(validationMessage && { validationMessage }),
        };
        await addSpuitschriftEntry(firestore, spuitschriftEntry);

        // Verwerk de voorraadmutaties
        await addParcelHistoryEntries(firestore, {
            logbookEntry: entry,
            parcels: allParcels,
            isConfirmation: true, // Geef aan dat dit een bevestiging is
        });
        
        // Verwijder de logboekregel
        await dbDeleteLogbookEntry(firestore, entryId);

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