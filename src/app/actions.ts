
'use server';

import { z } from 'zod';
import { addLogbookEntry, updateLogbookEntry, addParcelHistoryEntries, getProducts, addProduct, deleteLogbookEntry as dbDeleteLogbookEntry, getLogbookEntry, getParcels, addMiddelen, addUploadLog, deleteAllMiddelen as dbDeleteAllMiddelen, getMiddelen } from '@/lib/store';
import type { LogbookEntry, Parcel, ParcelHistoryEntry, ParsedSprayData, UploadLog, Middel } from '@/lib/types';
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


async function getFinalParsedData(rawInput: string): Promise<{ finalParsedData: ParsedSprayData, parcels: Parcel[]}> {
  const { firestore } = initializeFirebase();
  const [allProducts, allParcels] = await Promise.all([
    getProducts(firestore),
    getParcels(firestore)
  ]);

  const parsedDataFromAI: ParsedSprayData = await parseSprayApplication({
    naturalLanguageInput: rawInput,
    plots: JSON.stringify(allParcels.map(p => ({ id: p.id, name: p.name, crop: p.crop, variety: p.variety }))),
    products: JSON.stringify(allProducts),
  });

  for (const p of parsedDataFromAI.products) {
      if (p.product) {
          if (!allProducts.find(existing => existing.toLowerCase() === p.product.toLowerCase())) {
              await addProduct(firestore, p.product);
          }
      }
  }
  
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

export async function updateAndConfirmEntry(entry: LogbookEntry): Promise<FormState> {
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
        
        const jsonData: any[] = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        const headers = jsonData[0];

        const headerMapping: { [key: string]: string } = {
            "toelatingnummer": "Toelatingnummer",
            "middelnaam": "Middelnaam",
            "werkzame stoffen": "Werkzame stoffen",
            "toepassingsgebied": "Toepassingsgebied",
            "max. dosering": "Max. dosering per toepassing",
            "veiligheidstermijn (dagen)": "Veiligheidstermijn in dagen voor de oogst (gewas)",
            "max. aantal toepassingen per jaar": "Max. aantal toepassingen per 12 maanden (gewas)",
            "max. totale dosering per jaar": "Max. totale dosering per 12 maanden (gewas)",
            "min. interval (dagen)": "Min. interval tussen toepassingen in dagen (gewas)",
        };
        
        const colIndices: { [key: string]: number } = {};
        Object.keys(headerMapping).forEach(key => {
            const index = headers.findIndex((h: string) => h && h.toLowerCase().trim() === headerMapping[key].toLowerCase());
            if (index !== -1) {
                colIndices[key] = index;
            }
        });

        const parseNumber = (value: any): number | undefined => {
            if (value === undefined || value === null || value === "") return undefined;
            const strValue = String(value).replace(',', '.');
            const num = parseFloat(strValue);
            return isNaN(num) ? undefined : num;
        };
        
        const parseUnit = (value: any): string => {
            if (typeof value !== 'string') return 'kg';
            if (value.toLowerCase().includes('l/ha') || value.toLowerCase().includes('liter/ha')) return 'l';
            if (value.toLowerCase().includes('kg/ha')) return 'kg';
            if (value.toLowerCase().includes('g/ha')) return 'g';
            return 'kg';
        }

        const middelen: Omit<Middel, 'id'>[] = [];

        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            
            const dosageString = row[colIndices["max. dosering"]];
            const maxDosage = parseNumber(dosageString);
            
            const baseMiddel = {
                product: row[colIndices["middelnaam"]],
                disease: row[colIndices["toepassingsgebied"]],
                maxDosage: maxDosage,
                unit: parseUnit(dosageString),
                safetyPeriodDays: parseNumber(row[colIndices["veiligheidstermijn (dagen)"]]),
                maxApplicationsPerYear: parseNumber(row[colIndices["max. aantal toepassingen per jaar"]]),
                maxDosePerYear: parseNumber(row[colIndices["max. totale dosering per jaar"]]),
                minIntervalDays: parseNumber(row[colIndices["min. interval (dagen)"]]),
            };

            if (!baseMiddel.product || baseMiddel.maxDosage === undefined || isNaN(baseMiddel.maxDosage) || baseMiddel.maxDosage < 0) {
                continue;
            }

            const toepassingsGebied = row[colIndices["toepassingsgebied"]]?.toLowerCase() || '';
            
            if (toepassingsGebied.includes('appel')) {
                middelen.push({ ...baseMiddel, crop: 'Appel' });
            }
            if (toepassingsGebied.includes('peer')) {
                middelen.push({ ...baseMiddel, crop: 'Peer' });
            }
        }
        
        if (middelen.length === 0) {
            throw new Error(`Kon geen geldige middelen voor 'Appel' of 'Peer' extraheren uit ${file.name}.`);
        }
        
        await addMiddelen(firestore, middelen);
        
        const newLogData: Partial<Omit<UploadLog, 'id'>> = {
            productName: "CTGB Bestand Import",
            uploadDate: new Date(),
            fileName: file.name,
            activeSubstances: `Bevat ${middelen.length} regels`,
        };

        await addUploadLog(firestore, newLogData as Omit<UploadLog, 'id'>);
        
        revalidatePath('/middelmatrix');
        return { success: true, message: `${middelen.length} middelregels succesvol geïmporteerd uit ${file.name}.` };
    } catch (error: any) {
        console.error(`Fout bij verwerken van CTGB bestand ${file.name}:`, error);
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
