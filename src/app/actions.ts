'use server';

import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import {
    addLogbookEntry,
    updateLogbookEntry,
    addParcelHistoryEntries,
    dbDeleteLogbookEntry,
    getLogbookEntry,
    getLogbookEntries, // NEW import
    getParcels,
    getSprayableParcelsById,
    type SprayableParcel,
    getUserPreferences,
    setUserPreference,
    dbDeleteLogbookEntries,
    getTargetsForProduct,
    addInventoryMovement,
    getAllCtgbProducts,
    addSpuitschriftEntry,
    deleteSpuitschriftEntry as dbDeleteSpuitschriftEntry,
    getSpuitschriftEntry,
    getParcelHistoryEntries,
    // Field Signals
    getFieldSignals,
    addFieldSignal,
    addFieldSignalReaction,
    deleteFieldSignalReaction
} from '@/lib/supabase-store';
import {
    validateSprayApplication,
    type ValidationFlag,
    findGebruiksvoorschriftWithTarget,
    validateParsedSprayData
} from '@/lib/validation-service';
import {
    CtgbProduct,
    LogbookEntry,
    LogStatus,
    ParsedSprayData,
    Parcel,
    ProductEntry,
    InventoryMovement,
    SpuitschriftEntry,
    FieldSignal,
    SprayRegistrationUnit,
    SprayRegistrationGroup
} from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { parseSprayApplication } from '@/ai/flows/parse-spray-application';
import { parseSoilReport } from '@/ai/flows/parse-soil-report';
import { addSoilSample } from '@/lib/supabase-store';
import pdf from 'pdf-parse';


const formSchema = z.object({
    rawInput: z.string().min(10, 'Voer alsjeblieft een geldige bespuiting in.'),
});

export type InitialState = {
    message: string;
    errors?: {
        rawInput?: string[];
    };
};

async function validateSprayData(
    parsedData: ParsedSprayData,
    parcels: Parcel[],
    applicationDate?: Date
): Promise<{ isValid: boolean, validationMessage: string | null, errorCount: number, warningCount: number, infoCount: number, updatedProducts?: ProductEntry[], assumedTargets?: Record<string, string> }> {
    const [allCtgbProducts, allParcelHistory, sprayableParcels] = await Promise.all([
        getAllCtgbProducts(),
        getParcelHistoryEntries(),
        getSprayableParcelsById(parsedData.plots)
    ]);

    // Build lookup for sprayable parcels - history uses these IDs
    const sprayableParcelMap = new Map<string, SprayableParcel>(sprayableParcels.map(sp => [sp.id, sp]));

    // Try to find parcels in both legacy parcels and sprayable parcels
    // parsedData.plots can contain either type of ID
    const selectedParcels: Parcel[] = parsedData.plots
        .map(parcelId => {
            // First try legacy parcels
            const legacyParcel = parcels.find(p => p.id === parcelId);
            if (legacyParcel) return legacyParcel;

            // Then try sprayable parcels - convert to Parcel format
            const sprayable = sprayableParcelMap.get(parcelId);
            if (sprayable) {
                return {
                    id: sprayable.id, // Use sprayable parcel ID for history matching
                    name: sprayable.name,
                    area: sprayable.area,
                    crop: sprayable.crop,
                    variety: sprayable.variety,
                    location: sprayable.location || null,
                    geometry: sprayable.geometry,
                    source: sprayable.source,
                    rvoId: sprayable.rvoId,
                    subParcels: [{
                        id: sprayable.id,
                        crop: sprayable.crop,
                        variety: sprayable.variety,
                        area: sprayable.area,
                    }]
                } as Parcel;
            }

            return undefined;
        })
        .filter((p): p is Parcel => p !== undefined);

    const updatedProducts: ProductEntry[] = JSON.parse(JSON.stringify(parsedData.products));
    const validationMessages: string[] = [];
    const assumedTargets: Record<string, string> = {};
    let errorCount = 0;
    let warningCount = 0;
    let infoCount = 0;

    for (let i = 0; i < updatedProducts.length; i++) {
        const productEntry = updatedProducts[i];

        // Zoek CTGB product
        const matchingRules = allCtgbProducts.filter(m => m.naam?.toLowerCase().includes(productEntry.product.toLowerCase()));

        if (matchingRules.length === 0) {
            validationMessages.push(`⚠️ Product "${productEntry.product}" niet gevonden in de MiddelMatrix.`);
            warningCount++;
            continue;
        }

        let officialProductName: string;
        if (matchingRules.length > 1) {
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
        if (!matchingProduct) continue;

        // AUTO-FILL DOSERING: Als dosering 0 is, pak de hoogste toegestane dosering uit CTGB voor het gewas
        if (productEntry.dosage === 0 && selectedParcels.length > 0) {
            const firstParcel = selectedParcels[0];
            const crop = firstParcel.crop || firstParcel.subParcels?.[0]?.crop;

            if (crop && matchingProduct.gebruiksvoorschriften) {
                // Vind het voorschrift met de hoogste dosering voor dit gewas
                const voorschriftResult = findGebruiksvoorschriftWithTarget(matchingProduct, crop, productEntry.targetReason);

                if (voorschriftResult?.voorschrift?.dosering) {
                    const doseringStr = voorschriftResult.voorschrift.dosering;
                    // Parse dosering: "1,5 l/ha" of "0.5-1.0 l/ha" (neem max)
                    const rangeMatch = doseringStr.match(/(\d+[,.]?\d*)\s*[-–]\s*(\d+[,.]?\d*)\s*(l|kg|ml|g)/i);
                    const simpleMatch = doseringStr.match(/(\d+[,.]?\d*)\s*(l|kg|ml|g)/i);

                    if (rangeMatch) {
                        // Neem de MAX waarde van het range
                        updatedProducts[i].dosage = parseFloat(rangeMatch[2].replace(',', '.'));
                        updatedProducts[i].unit = rangeMatch[3].toLowerCase() === 'l' ? 'L/ha' : rangeMatch[3].toLowerCase() + '/ha';
                        validationMessages.push(`ℹ️ Dosering voor ${officialProductName} automatisch ingevuld: ${updatedProducts[i].dosage} ${updatedProducts[i].unit} (hoogste toegestane dosering voor ${crop})`);
                        infoCount++;
                    } else if (simpleMatch) {
                        updatedProducts[i].dosage = parseFloat(simpleMatch[1].replace(',', '.'));
                        updatedProducts[i].unit = simpleMatch[2].toLowerCase() === 'l' ? 'L/ha' : simpleMatch[2].toLowerCase() + '/ha';
                        validationMessages.push(`ℹ️ Dosering voor ${officialProductName} automatisch ingevuld: ${updatedProducts[i].dosage} ${updatedProducts[i].unit} (uit CTGB voor ${crop})`);
                        infoCount++;
                    }
                } else {
                    // Geen specifieke dosering gevonden, geef warning
                    validationMessages.push(`⚠️ Geen dosering gevonden voor ${officialProductName} op ${crop}. Vul dosering handmatig in.`);
                    warningCount++;
                }
            }
        }

        // Valideer elk product op elk geselecteerd perceel
        for (const parcel of selectedParcels) {
            // Filter history voor dit perceel
            const parcelHistory = allParcelHistory.filter(h => h.parcelId === parcel.id);

            // Voer volledige validatie uit met ValidationService
            const result = await validateSprayApplication(
                parcel,
                matchingProduct,
                productEntry.dosage,
                productEntry.unit,
                applicationDate || new Date(),
                parcelHistory,
                allCtgbProducts,
                undefined, // expectedHarvestDate
                productEntry.targetReason // Doelorganisme uit AI parsing
            );

            // Verwerk validatie resultaten
            for (const flag of result.flags) {
                const prefix = flag.type === 'error' ? '❌' : flag.type === 'warning' ? '⚠️' : 'ℹ️';
                const msg = `${prefix} ${flag.message}`;

                if (!validationMessages.includes(msg)) {
                    validationMessages.push(msg);
                    if (flag.type === 'error') errorCount++;
                    else if (flag.type === 'warning') warningCount++;
                    else infoCount++;
                }
            }

            // Sla assumed targets op
            if (result.matchedTargets) {
                result.matchedTargets.forEach((target, productName) => {
                    if (target.isAssumed) {
                        assumedTargets[productName] = target.targetOrganism;
                    }
                });
            }
        }
    }

    return {
        isValid: errorCount === 0,
        validationMessage: validationMessages.length > 0 ? validationMessages.join('\n') : null,
        errorCount,
        warningCount,
        infoCount,
        updatedProducts,
        assumedTargets,
    };
}


async function performAnalysis(entry: LogbookEntry) {
    let finalStatus: LogStatus = 'Fout';
    let finalValidationMessage: string | undefined = 'Onbekende fout.';
    let finalParsedData: ParsedSprayData | undefined = undefined;
    let finalDate = entry.date;
    let finalAssumedTargets: Record<string, string> | undefined = undefined;

    try {
        const [allParcels, allProducts, userPreferences, latestEntries] = await Promise.all([
            getParcels(),
            getAllCtgbProducts(),
            getUserPreferences(),
            getLogbookEntries()
        ]);

        const allProductNames = allProducts.map((p: CtgbProduct) => p.naam);

        // Find the most recent entry that is NOT this one and is a possible "draft"
        const lastEntry = latestEntries
            .filter((e: LogbookEntry) => e.id !== entry.id && e.parsedData)
            .sort((a: LogbookEntry, b: LogbookEntry) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

        let previousDraftContext;
        if (lastEntry && lastEntry.parsedData) {
            previousDraftContext = {
                plots: lastEntry.parsedData.plots,
                products: lastEntry.parsedData.products,
                date: lastEntry.date ? new Date(lastEntry.date).toISOString().split('T')[0] : undefined
            };
        }

        const llmResponse = await parseSprayApplication({
            naturalLanguageInput: entry.rawInput,
            plots: JSON.stringify(allParcels.map(p => ({
                id: p.id,
                name: p.name,
                crop: p.subParcels?.[0]?.crop || 'Onbekend',
                variety: p.subParcels?.[0]?.variety || 'Onbekend'
            }))),
            productNames: allProductNames,
            previousDraft: previousDraftContext,
            userPreferences: userPreferences.map(p => ({ alias: p.alias, preferred: p.preferred }))
        });

        const cleanedOutput = llmResponse.plots ? llmResponse : JSON.parse(JSON.stringify(llmResponse).replace(/```json/g, '').replace(/```/g, ''));
        finalParsedData = {
            plots: cleanedOutput.plots || [],
            products: cleanedOutput.products || []
        };

        if (cleanedOutput.date) {
            finalDate = new Date(cleanedOutput.date);
        }

        if (!finalParsedData || finalParsedData.plots.length === 0) {
            throw new Error("AI kon geen geldige percelen identificeren in de output.");
        }
        if (finalParsedData.products.length === 0) {
            throw new Error("AI kon geen geldige middelen identificeren in de output.");
        }

        const { isValid, validationMessage, errorCount, warningCount, updatedProducts, assumedTargets } = await validateSprayData(finalParsedData, allParcels, finalDate);
        finalAssumedTargets = assumedTargets;

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
        finalParsedData = undefined;
    }

    const cleanedParsedData = finalParsedData ? {
        ...finalParsedData,
        assumedTargets: finalAssumedTargets || {},
    } : undefined;

    const updatedEntryData: LogbookEntry = {
        id: entry.id,
        status: finalStatus,
        validationMessage: finalValidationMessage,
        parsedData: cleanedParsedData,
        rawInput: entry.rawInput,
        date: finalDate,
        createdAt: entry.createdAt,
    };

    await updateLogbookEntry(updatedEntryData);
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
    const now = new Date();

    const initialEntryData: Omit<LogbookEntry, 'id'> = {
        rawInput,
        status: 'Analyseren...',
        date: now,
        createdAt: now,
    };

    const newEntry = await addLogbookEntry(initialEntryData);

    // Perform analysis in the background
    performAnalysis(newEntry).catch(async (error) => {
        console.error("Background analysis failed:", error);
        try {
            await updateLogbookEntry({
                ...newEntry,
                status: 'Fout',
                validationMessage: `Interne fout tijdens analyse: ${error.message}`
            });
        } catch (updateError) {
            console.error("Failed to update entry status after analysis failure:", updateError);
        }
    });

    revalidatePath('/');
    revalidatePath('/');
    revalidatePath('/crop-care/logs');
    revalidatePath('/crop-care/inventory');

    return {
        message: 'Invoer wordt verwerkt...',
    };
}

export async function retryAnalysis(entryId: string): Promise<{ success: boolean; message: string }> {
    try {
        const entry = await getLogbookEntry(entryId);
        if (!entry) {
            return { success: false, message: "Logboekregel niet gevonden." };
        }

        // Set status to 'Analyseren...' before starting
        await updateLogbookEntry({ ...entry, status: 'Analyseren...' });
        revalidatePath('/');

        // Perform analysis in the background
        performAnalysis(entry).catch(async (error) => {
            console.error("Background analysis failed (retry):", error);
            try {
                await updateLogbookEntry({
                    ...entry,
                    status: 'Fout',
                    validationMessage: `Interne fout tijdens analyse: ${error.message}`
                });
            } catch (e) {
                console.error("Failed to update status", e);
            }
        });

        revalidatePath('/');
        return { success: true, message: "Analyse opnieuw gestart." };
    } catch (error: any) {
        return { success: false, message: error.message || "Onbekende fout." };
    }
}


async function learnFromCorrection(originalProduct: string, correctedProduct: string) {
    if (!originalProduct || !correctedProduct || originalProduct.toLowerCase() === correctedProduct.toLowerCase()) {
        return;
    }

    // Use the first word as an alias if it's reasonably specific
    const originalFirstWord = originalProduct.split(' ')[0].toLowerCase();

    // Don't use very short or generic aliases
    if (originalFirstWord.length < 3) return;

    // Save as a product preference with a prefix to distinguish from other preferences
    await setUserPreference({
        alias: `middel_${originalFirstWord}`,
        preferred: correctedProduct
    });
}

type FormState = {
    message: string;
    entry?: LogbookEntry;
};


export async function updateAndConfirmEntry(entry: LogbookEntry, originalProducts: ProductEntry[]): Promise<FormState> {
    if (!entry.parsedData) {
        return { message: "Fout: Geen geparseerde data om op te slaan." };
    }

    const allParcels = await getParcels();
    const entryDate = entry.date instanceof Date ? entry.date : new Date(entry.date);
    const { isValid, validationMessage, updatedProducts, errorCount, warningCount, assumedTargets } = await validateSprayData(entry.parsedData, allParcels, entryDate);

    if (updatedProducts) {
        entry.parsedData.products = updatedProducts;
    }

    entry.parsedData.assumedTargets = assumedTargets;

    const updatedEntryData: LogbookEntry = {
        id: entry.id,
        rawInput: entry.rawInput,
        date: entry.date,
        createdAt: entry.createdAt,
        parsedData: entry.parsedData,
        status: entry.status,
    };

    if (errorCount > 0) {
        updatedEntryData.status = 'Afgekeurd';
        updatedEntryData.validationMessage = validationMessage || 'Validatie mislukt met fouten.';
    } else {
        updatedEntryData.status = warningCount > 0 ? 'Waarschuwing' : 'Akkoord';
        updatedEntryData.validationMessage = validationMessage || '';
    }
    await updateLogbookEntry(updatedEntryData);


    // Learn from corrections
    if (entry.parsedData?.products) {
        for (let i = 0; i < entry.parsedData.products.length; i++) {
            const original = originalProducts[i];
            const corrected = entry.parsedData.products[i];
            if (original && corrected) {
                await learnFromCorrection(original.product, corrected.product);
            }
        }
    }

    revalidatePath('/');

    const dateToReturn = entry.date instanceof Date ? entry.date : new Date(entry.date);
    const createdAtToReturn = entry.createdAt instanceof Date ? entry.createdAt : new Date(entry.createdAt || entry.date);

    return {
        message: 'Wijzigingen opgeslagen.',
        entry: { ...entry, date: dateToReturn.toISOString(), createdAt: createdAtToReturn.toISOString() } as any,
    };
}


export async function deleteLogbookEntry(entryId: string) {
    await dbDeleteLogbookEntry(entryId);
    revalidatePath('/');
    revalidatePath('/');
    revalidatePath('/crop-care/logs');
    revalidatePath('/crop-care/inventory');
}

export async function deleteLogbookEntries(entryIds: string[]) {
    await dbDeleteLogbookEntries(entryIds);
    revalidatePath('/');
    revalidatePath('/');
    revalidatePath('/crop-care/logs');
    revalidatePath('/crop-care/inventory');
}


export async function confirmLogbookEntry(entryId: string): Promise<{ success: boolean; message?: string }> {
    try {
        const entry = await getLogbookEntry(entryId);

        if (!entry) {
            return { success: false, message: 'Logboekregel niet gevonden.' };
        }
        if (!entry.parsedData) {
            return { success: false, message: 'Geen data om te bevestigen.' };
        }

        // Fetch both legacy parcels (for validation) and sprayable parcels (for history)
        const [allParcels, sprayableParcels] = await Promise.all([
            getParcels(),
            getSprayableParcelsById(entry.parsedData.plots),
        ]);

        // Parse and validate date - default to today if invalid
        let entryDate: Date;
        if (entry.date instanceof Date && !isNaN(entry.date.getTime())) {
            entryDate = entry.date;
        } else if (typeof entry.date === 'string' && entry.date) {
            const parsed = new Date(entry.date);
            entryDate = isNaN(parsed.getTime()) ? new Date() : parsed;
        } else {
            entryDate = new Date();
        }

        const { isValid, validationMessage, updatedProducts, errorCount, warningCount, assumedTargets } = await validateSprayData(entry.parsedData, allParcels, entryDate);

        if (updatedProducts) {
            entry.parsedData.products = updatedProducts;
        }

        if (errorCount > 0) {
            entry.status = 'Afgekeurd';
            entry.validationMessage = validationMessage || 'Kon niet bevestigen vanwege validatiefouten.';
            await updateLogbookEntry(entry);
            revalidatePath('/');
            return { success: false, message: `Kan niet bevestigen: ${validationMessage}` };
        }

        // Maak een nieuwe Spuitschrift entry
        const spuitschriftEntry: Omit<SpuitschriftEntry, 'id' | 'spuitschriftId'> = {
            originalLogbookId: entry.id,
            originalRawInput: entry.rawInput,
            date: entry.date,
            plots: entry.parsedData.plots,
            products: entry.parsedData.products,
            status: warningCount > 0 ? 'Waarschuwing' : 'Akkoord',
            createdAt: entry.createdAt || new Date(),
            ...(validationMessage && { validationMessage: validationMessage }),
        };
        const newSpuitschriftEntry = await addSpuitschriftEntry(spuitschriftEntry);

        // Verwerk de voorraadmutaties - try sprayableParcels first, fallback to parcels
        await addParcelHistoryEntries({
            logbookEntry: entry,
            parcels: allParcels,
            sprayableParcels,
            isConfirmation: true,
            spuitschriftId: newSpuitschriftEntry.id,
        });

        // Verwijder de logboekregel
        await dbDeleteLogbookEntry(entryId);

        revalidatePath('/');
        revalidatePath('/crop-care/logs');
        revalidatePath('/crop-care/inventory');

        return { success: true };
    } catch (error) {
        console.error('[confirmLogbookEntry] Error:', error);
        let message = 'Onbekende fout bij bevestigen.';

        if (error instanceof Error) {
            const errorMsg = error.message.toLowerCase();
            if (errorMsg.includes('fetch failed') || errorMsg.includes('network') || errorMsg.includes('econnreset')) {
                message = 'Geen verbinding met de database. Controleer je internetverbinding en probeer het opnieuw.';
            } else if (errorMsg.includes('timeout')) {
                message = 'De verbinding duurde te lang. Probeer het opnieuw.';
            } else {
                message = error.message;
            }
        }

        return { success: false, message };
    }
}

/**
 * Bevestig een draft DIRECT naar spuitschrift (zonder tussenkomst van logbook).
 * Dit wordt gebruikt vanuit Smart Input wanneer de gebruiker op "Bevestigen" klikt.
 */
export async function confirmDraftDirectToSpuitschrift(draftData: {
    plots: string[];
    products: ProductEntry[];
    date: Date | string;
    rawInput?: string;
    validationMessage?: string | null;
}): Promise<{ success: boolean; message?: string; spuitschriftId?: string }> {
    try {
        if (!draftData.plots || draftData.plots.length === 0) {
            return { success: false, message: 'Geen percelen geselecteerd.' };
        }
        if (!draftData.products || draftData.products.length === 0) {
            return { success: false, message: 'Geen producten opgegeven.' };
        }

        // Fetch parcels for validation and history
        const [allParcels, sprayableParcels] = await Promise.all([
            getParcels(),
            getSprayableParcelsById(draftData.plots),
        ]);

        // Parse and validate date - default to today if invalid
        let entryDate: Date;
        if (draftData.date instanceof Date && !isNaN(draftData.date.getTime())) {
            entryDate = draftData.date;
        } else if (typeof draftData.date === 'string' && draftData.date) {
            const parsed = new Date(draftData.date);
            entryDate = isNaN(parsed.getTime()) ? new Date() : parsed;
        } else {
            entryDate = new Date(); // Default to today
        }
        console.log('[confirmDraftDirectToSpuitschrift] Using date:', entryDate.toISOString());

        // Valideer de spray data
        const parsedData: ParsedSprayData = {
            plots: draftData.plots,
            products: draftData.products,
        };
        const { isValid, validationMessage, updatedProducts, errorCount, warningCount } = await validateSprayData(parsedData, allParcels, entryDate);

        // Update products met genormaliseerde namen indien nodig
        const finalProducts = updatedProducts || draftData.products;

        // Bij errors: niet bevestigen
        if (errorCount > 0) {
            return {
                success: false,
                message: `Kan niet bevestigen: ${validationMessage || 'Validatiefouten gevonden.'}`
            };
        }

        // Maak een nieuwe Spuitschrift entry (direct, zonder logbook)
        const spuitschriftEntry: Omit<SpuitschriftEntry, 'id' | 'spuitschriftId'> = {
            originalLogbookId: null, // Geen logbook entry - direct bevestigd
            originalRawInput: draftData.rawInput || 'Direct bevestigde registratie',
            date: entryDate,
            plots: draftData.plots,
            products: finalProducts,
            status: warningCount > 0 ? 'Waarschuwing' : 'Akkoord',
            createdAt: new Date(),
            ...(validationMessage && { validationMessage }),
        };

        const newSpuitschriftEntry = await addSpuitschriftEntry(spuitschriftEntry);

        // Maak een dummy logbook entry voor de parcel history function
        const dummyLogbookEntry: LogbookEntry = {
            id: `direct-${Date.now()}`,
            rawInput: draftData.rawInput || 'Direct bevestigde registratie',
            status: 'Akkoord',
            date: entryDate,
            createdAt: new Date(),
            parsedData: {
                plots: draftData.plots,
                products: finalProducts,
            },
            validationMessage: validationMessage || null,
        };

        // Verwerk parcel history en inventory movements
        await addParcelHistoryEntries({
            logbookEntry: dummyLogbookEntry,
            parcels: allParcels,
            sprayableParcels,
            isConfirmation: true,
            spuitschriftId: newSpuitschriftEntry.id,
        });

        revalidatePath('/');
        revalidatePath('/crop-care/logs');
        revalidatePath('/crop-care/inventory');
        revalidatePath('/command-center/timeline');

        return {
            success: true,
            message: 'Registratie bevestigd en opgeslagen in spuitschrift.',
            spuitschriftId: newSpuitschriftEntry.id
        };
    } catch (error) {
        console.error('[confirmDraftDirectToSpuitschrift] Error:', error);
        let message = 'Onbekende fout bij bevestigen.';

        if (error instanceof Error) {
            const errorMsg = error.message.toLowerCase();
            if (errorMsg.includes('fetch failed') || errorMsg.includes('network') || errorMsg.includes('econnreset')) {
                message = 'Geen verbinding met de database. Controleer je internetverbinding en probeer het opnieuw.';
            } else if (errorMsg.includes('timeout')) {
                message = 'De verbinding duurde te lang. Probeer het opnieuw.';
            } else {
                message = error.message;
            }
        }

        return { success: false, message };
    }
}

// ============================================
// V2: Grouped Registration Functions
// ============================================

/**
 * Bevestig een enkele unit uit een groep naar spuitschrift.
 * Elke unit wordt als losse spuitschrift entry opgeslagen.
 */
export async function confirmSingleUnit(
    unit: SprayRegistrationUnit,
    date: Date,
    rawInput: string
): Promise<{ success: boolean; message?: string; spuitschriftId?: string }> {
    return confirmDraftDirectToSpuitschrift({
        plots: unit.plots,
        products: unit.products,
        date,
        rawInput: `${rawInput} [${unit.label || 'Unit'}]`,
    });
}

/**
 * Bevestig alle units in een groep naar spuitschrift.
 * Roept confirmSingleUnit aan voor elke pending unit.
 */
export async function confirmAllUnits(
    group: SprayRegistrationGroup
): Promise<{
    success: boolean;
    message?: string;
    results: Array<{ unitId: string; success: boolean; spuitschriftId?: string; error?: string }>;
}> {
    const results: Array<{ unitId: string; success: boolean; spuitschriftId?: string; error?: string }> = [];

    // Filter only pending units
    const pendingUnits = group.units.filter(u => u.status === 'pending');

    if (pendingUnits.length === 0) {
        return {
            success: false,
            message: 'Geen openstaande registraties om te bevestigen.',
            results: []
        };
    }

    // Confirm each unit
    for (const unit of pendingUnits) {
        const result = await confirmSingleUnit(unit, group.date, group.rawInput);
        results.push({
            unitId: unit.id,
            success: result.success,
            spuitschriftId: result.spuitschriftId,
            error: result.success ? undefined : result.message,
        });
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    if (failCount === 0) {
        return {
            success: true,
            message: `Alle ${successCount} registraties bevestigd.`,
            results
        };
    } else if (successCount === 0) {
        return {
            success: false,
            message: 'Geen registraties konden worden bevestigd.',
            results
        };
    } else {
        return {
            success: true,
            message: `${successCount} van ${pendingUnits.length} registraties bevestigd. ${failCount} mislukt.`,
            results
        };
    }
}

export async function deleteSpuitschriftEntry(entryId: string) {
    await dbDeleteSpuitschriftEntry(entryId);
    revalidatePath('/');
    revalidatePath('/crop-care/logs');
    revalidatePath('/crop-care/inventory');
}


export async function moveSpuitschriftEntryToLogbook(entryId: string): Promise<{ success: boolean; message?: string }> {
    try {
        const spuitschriftEntry = await getSpuitschriftEntry(entryId);
        if (!spuitschriftEntry) {
            return { success: false, message: 'Spuitschrift regel niet gevonden.' };
        }

        // Maak een nieuwe logboek regel
        const logbookEntryData: Omit<LogbookEntry, 'id'> = {
            rawInput: spuitschriftEntry.originalRawInput,
            status: 'Te Controleren',
            date: spuitschriftEntry.date,
            createdAt: spuitschriftEntry.createdAt,
            parsedData: {
                plots: spuitschriftEntry.plots,
                products: spuitschriftEntry.products,
            },
            validationMessage: spuitschriftEntry.validationMessage || '',
        };

        await addLogbookEntry(logbookEntryData);

        // Verwijder de spuitschrift regel en gerelateerde data
        await dbDeleteSpuitschriftEntry(entryId);

        revalidatePath('/');
        revalidatePath('/crop-care/logs');
        revalidatePath('/crop-care/inventory');

        return { success: true, message: 'Regel is teruggeplaatst in het logboek voor bewerking.' };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Onbekende fout.';
        return { success: false, message };
    }
}


export async function confirmLogbookEntries(entryIds: string[]): Promise<{ success: boolean; message?: string, count: number }> {
    let confirmedCount = 0;
    try {
        const allParcels = await getParcels();

        for (const entryId of entryIds) {
            const entry = await getLogbookEntry(entryId);
            if (!entry || !entry.parsedData) continue;

            const entryDate = entry.date instanceof Date ? entry.date : new Date(entry.date);
            const { isValid, updatedProducts } = await validateSprayData(entry.parsedData, allParcels, entryDate);
            if (updatedProducts) {
                entry.parsedData.products = updatedProducts;
            }

            if (!isValid) continue;

            entry.status = 'Akkoord';
            entry.validationMessage = '';
            await updateLogbookEntry(entry);

            // Fetch sprayable parcels for history (uses sub-parcel IDs)
            const sprayableParcels = await getSprayableParcelsById(entry.parsedData.plots);

            await addParcelHistoryEntries({
                logbookEntry: entry,
                parcels: allParcels,
                sprayableParcels
            });
            confirmedCount++;
        }

        if (confirmedCount > 0) {
            revalidatePath('/');
            revalidatePath('/crop-care/logs');
            revalidatePath('/crop-care/inventory');
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

    try {
        const newMovement: Omit<InventoryMovement, 'id'> = {
            productName,
            quantity,
            unit,
            type: 'addition',
            date: new Date(),
            description: 'Handmatige toevoeging (levering)',
        };
        await addInventoryMovement(newMovement);
        revalidatePath('/crop-care/inventory');
        return { success: true, message: `${quantity} ${unit} van ${productName} succesvol toegevoegd aan de voorraad.` };
    } catch (error: any) {
        console.error('Fout bij het toevoegen van voorraad:', error);
        return { success: false, message: error.message || 'Onbekende fout bij het toevoegen van voorraad.' };
    }
}

export async function getTargetsForProductAction(productName: string): Promise<string[]> {
    return await getTargetsForProduct(productName);
}

export async function saveProductPreferenceAction(alias: string, preferred: string) {
    try {
        await setUserPreference({ alias, preferred });
        return { success: true };
    } catch (error: any) {
        console.error('Fout bij het opslaan van voorkeur:', error);
        return { success: false };
    }
}

export async function validateAndSaveDraft(parsedData: any): Promise<{ id: string; status: LogStatus; validationMessage: string }> {
    const allParcels = await getParcels();
    const allProducts = await getAllCtgbProducts();
    const parcelHistory = await getParcelHistoryEntries();

    const { isValid, validationMessage, errorCount, warningCount } = await validateParsedSprayData(
        parsedData,
        allParcels,
        allProducts,
        parcelHistory
    );

    const status = errorCount > 0 ? 'Afgekeurd' : (warningCount > 0 ? 'Waarschuwing' : 'Akkoord');

    // Create the final logbook entry
    const entry: Omit<LogbookEntry, 'id'> = {
        rawInput: `AI Invoer: ${parsedData.products.map((p: any) => p.product).join(', ')}`,
        status: status,
        date: parsedData.date ? new Date(parsedData.date) : new Date(),
        createdAt: new Date(),
        parsedData: {
            plots: parsedData.plots,
            products: parsedData.products,
            assumedTargets: {}
        },
        validationMessage: validationMessage || ''
    };

    const newEntry = await addLogbookEntry(entry);
    revalidatePath('/');

    return {
        id: newEntry.id,
        status: status,
        validationMessage: validationMessage || ''
    };
}

export async function saveInlineEdit(id: string, parsedData: any, date: string): Promise<{ success: boolean; message?: string }> {
    try {
        const entry = await getLogbookEntry(id);
        if (!entry) return { success: false, message: "Regel niet gevonden." };

        const allParcels = await getParcels();
        const allProducts = await getAllCtgbProducts();
        const parcelHistory = await getParcelHistoryEntries();
        const entryDate = new Date(date);

        const { isValid, validationMessage, errorCount, warningCount } = await validateParsedSprayData(
            parsedData,
            allParcels,
            allProducts,
            parcelHistory
        );

        const updatedEntry: LogbookEntry = {
            ...entry,
            date: entryDate,
            parsedData: parsedData,
            validationMessage: validationMessage || '',
            status: errorCount > 0 ? 'Afgekeurd' : (warningCount > 0 ? 'Waarschuwing' : 'Akkoord'),
        };

        await updateLogbookEntry(updatedEntry);
        revalidatePath('/');
        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Onbekende fout.';
        return { success: false, message };
    }
}

/**
 * Save a draft that was created via streaming + async validation
 * This is the final step in the "Instant Feel" flow
 */
export async function saveStreamedDraft(data: {
    rawInput: string;
    parsedData: {
        plots: string[];
        products: any[];
        assumedTargets?: Record<string, string>;
    };
    date?: string;
    status: LogStatus;
    validationMessage: string | null;
}): Promise<LogbookEntry> {
    const entry: Omit<LogbookEntry, 'id'> = {
        rawInput: data.rawInput,
        status: data.status,
        date: data.date ? new Date(data.date) : new Date(),
        createdAt: new Date(),
        parsedData: data.parsedData,
        validationMessage: data.validationMessage || ''
    };

    const newEntry = await addLogbookEntry(entry);
    revalidatePath('/');
    revalidatePath('/');
    revalidatePath('/crop-care/logs');

    return newEntry;
}

/**
 * Update an existing logbook entry (used for multi-turn conversation updates)
 */
export async function updateLogbookEntryAction(id: string, data: {
    rawInput?: string;
    parsedData: {
        plots: string[];
        products: any[];
        assumedTargets?: Record<string, string>;
    };
    date?: string;
    status: LogStatus;
    validationMessage: string | null;
}): Promise<{ success: boolean; message?: string }> {
    try {
        const entry = await getLogbookEntry(id);
        if (!entry) {
            return { success: false, message: 'Logboekregel niet gevonden.' };
        }

        const updatedEntry: LogbookEntry = {
            ...entry,
            rawInput: data.rawInput || entry.rawInput,
            parsedData: data.parsedData,
            date: data.date ? new Date(data.date) : entry.date,
            status: data.status,
            validationMessage: data.validationMessage || '',
        };

        await updateLogbookEntry(updatedEntry);
        revalidatePath('/');
        revalidatePath('/');
        revalidatePath('/crop-care/logs');

        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Onbekende fout.';
        return { success: false, message };
    }
}

export async function uploadSoilReport(subParcelId: string, formData: FormData) {
    try {
        const file = formData.get('file') as File;
        if (!file) throw new Error("Geen bestand gevonden.");

        const buffer = Buffer.from(await file.arrayBuffer());
        const pdfData = await pdf(buffer);
        const text = pdfData.text;

        const extractedData = await parseSoilReport(text);

        if (!extractedData) throw new Error("AI kon geen bodemgegevens extraheren.");

        const sample = {
            subParcelId,
            sampleDate: extractedData.sampleDate ? new Date(extractedData.sampleDate) : new Date(),
            nTotal: extractedData.nTotal || 0,
            pAvailable: extractedData.pAvailable || 0,
            kValue: extractedData.kValue || 0,
            organicMatter: extractedData.organicMatter || 0,
            ph: extractedData.ph || 0,
        };

        await addSoilSample(sample);
        revalidatePath('/parcels/list');

        return { success: true, data: sample };
    } catch (error: any) {
        console.error("Fout bij verwerken bodemrapport:", error);
        return { success: false, message: error.message || "Fout bij verwerken PDF." };
    }
}

// ============================================
// Field Signals Actions
// ============================================

const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

// Helper to get current user ID from server-side auth
import { createClient as createServerClient } from '@/lib/supabase/server';

async function getCurrentUserId(): Promise<string | null> {
    try {
        const supabase = await createServerClient();
        const { data: { user } } = await supabase.auth.getUser();
        return user?.id || null;
    } catch {
        return null;
    }
}

export async function createFieldSignalAction(
    content: string,
    mediaUrl: string | undefined,
    tags: string[],
    visibility: 'public' | 'private',
    authorId: string
) {
    if (!supabaseAdmin) {
        throw new Error("Server configuration error: Write access not configured (missing SERVICE_ROLE_KEY)");
    }

    try {
        await addFieldSignal({
            content,
            mediaUrl: mediaUrl || undefined, // Ensure undefined if empty string
            tags,
            visibility,
            authorId,
            embedding: undefined // No embedding generation yet
        }, supabaseAdmin);

        revalidatePath('/research');
        return { success: true };
    } catch (error: any) {
        console.error('Error creating field signal:', error);
        return { success: false, error: error.message };
    }
}

export async function getFieldSignalsAction(currentUserId?: string) {
    try {
        // Use default client for reading (RLS Public)
        // Pass currentUserId for "liked by me" check
        return await getFieldSignals(currentUserId);
    } catch (error) {
        console.error('Error fetching field signals:', error);
        return [];
    }
}

export async function toggleFieldSignalLikeAction(signalId: string, userId: string, isLiked: boolean) {
    if (!supabaseAdmin) {
        throw new Error("Server configuration error: Write access not configured");
    }

    try {
        if (isLiked) {
            // User ALREADY likes it, so we want to UNLIKE (delete)
            await deleteFieldSignalReaction(signalId, userId, 'like', supabaseAdmin);
        } else {
            // User does NOT like it, so we want to LIKE (add)
            await addFieldSignalReaction({
                signalId,
                userId,
                type: 'like',
            }, supabaseAdmin);
        }
        revalidatePath('/research');
        return { success: true };
    } catch (error: any) {
        console.error('Error toggling like:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// Conversations Actions (Draft Sessions)
// ============================================

export interface ConversationData {
    id?: string;
    title: string;
    draftData: {
        plots: string[];
        products: Array<{
            product: string;
            dosage: number;
            unit: string;
            targetReason?: string;
        }>;
        date?: string;
    };
    chatHistory: Array<{
        role: string;
        content: string;
        timestamp: string;
        intent?: string;
    }>;
}

export interface ConversationListItem {
    id: string;
    title: string;
    status: 'draft' | 'active' | 'completed';
    last_updated: string;
    created_at: string;
    draft_data: {
        plots?: string[];
        products?: Array<{ product: string; dosage: number; unit: string }>;
        date?: string;
    };
}

export async function saveConversationAsDraft(data: ConversationData): Promise<{ success: boolean; id?: string; error?: string }> {
    if (!supabaseAdmin) {
        console.error('[saveConversationAsDraft] supabaseAdmin is not configured. Missing SUPABASE_SERVICE_ROLE_KEY?');
        console.error('[saveConversationAsDraft] SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING');
        console.error('[saveConversationAsDraft] SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING');
        return { success: false, error: "Server configuratie fout: Controleer SUPABASE_SERVICE_ROLE_KEY in .env.local" };
    }

    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return { success: false, error: "Not authenticated" };
        }

        const conversationData = {
            title: data.title,
            status: 'draft' as const,
            draft_data: data.draftData,
            chat_history: data.chatHistory,
            last_updated: new Date().toISOString()
        };

        if (data.id) {
            // Update existing conversation (only if owned by user)
            const { data: updated, error } = await supabaseAdmin
                .from('conversations')
                .update(conversationData)
                .eq('id', data.id)
                .eq('user_id', userId)
                .select('id')
                .single();

            if (error) throw error;
            revalidatePath('/command-center/timeline');
            return { success: true, id: updated.id };
        } else {
            // Create new conversation with user_id
            const { data: created, error } = await supabaseAdmin
                .from('conversations')
                .insert({
                    ...conversationData,
                    user_id: userId,
                    created_at: new Date().toISOString()
                })
                .select('id')
                .single();

            if (error) throw error;
            revalidatePath('/command-center/timeline');
            return { success: true, id: created.id };
        }
    } catch (error: any) {
        console.error('[saveConversationAsDraft] Error:', error);
        console.error('[saveConversationAsDraft] Error type:', error?.name);
        console.error('[saveConversationAsDraft] Error code:', error?.code);

        // Check voor specifieke Supabase/network errors
        if (error?.message?.includes('fetch failed') || error?.code === 'ECONNREFUSED') {
            return {
                success: false,
                error: 'Kan geen verbinding maken met database. Controleer je internet verbinding en Supabase configuratie.'
            };
        }

        return { success: false, error: error.message || 'Onbekende fout bij opslaan' };
    }
}

export async function loadConversation(id: string): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!supabaseAdmin) {
        return { success: false, error: "Server configuration error" };
    }

    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return { success: false, error: "Not authenticated" };
        }

        const { data, error } = await supabaseAdmin
            .from('conversations')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        console.error('Error loading conversation:', error);
        return { success: false, error: error.message };
    }
}

export async function getConversations(status?: 'draft' | 'active' | 'completed'): Promise<ConversationListItem[]> {
    if (!supabaseAdmin) {
        console.error("Server configuration error: supabaseAdmin not available");
        return [];
    }

    try {
        // Get current user ID for filtering
        const userId = await getCurrentUserId();
        if (!userId) {
            console.error('[getConversations] No authenticated user');
            return [];
        }

        let query = supabaseAdmin
            .from('conversations')
            .select('id, title, status, last_updated, created_at, draft_data')
            .eq('user_id', userId)
            .order('last_updated', { ascending: false });

        if (status) {
            query = query.eq('status', status);
        }

        const { data, error } = await query;

        if (error) throw error;
        return data || [];
    } catch (error: any) {
        console.error('Error fetching conversations:', error);
        return [];
    }
}

export async function updateConversationStatus(id: string, status: 'draft' | 'active' | 'completed'): Promise<{ success: boolean; error?: string }> {
    if (!supabaseAdmin) {
        return { success: false, error: "Server configuration error" };
    }

    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return { success: false, error: "Not authenticated" };
        }

        const { error } = await supabaseAdmin
            .from('conversations')
            .update({ status, last_updated: new Date().toISOString() })
            .eq('id', id)
            .eq('user_id', userId);

        if (error) throw error;
        revalidatePath('/command-center/timeline');
        return { success: true };
    } catch (error: any) {
        console.error('Error updating conversation status:', error);
        return { success: false, error: error.message };
    }
}

export async function deleteConversation(id: string): Promise<{ success: boolean; error?: string }> {
    if (!supabaseAdmin) {
        return { success: false, error: "Server configuration error" };
    }

    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return { success: false, error: "Not authenticated" };
        }

        const { error } = await supabaseAdmin
            .from('conversations')
            .delete()
            .eq('id', id)
            .eq('user_id', userId);

        if (error) throw error;
        revalidatePath('/command-center/timeline');
        return { success: true };
    } catch (error: any) {
        console.error('Error deleting conversation:', error);
        return { success: false, error: error.message };
    }
}
