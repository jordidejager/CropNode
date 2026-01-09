
'use server';

import { getAllCtgbProducts, getParcelHistoryEntries } from "@/lib/store";
import { initializeFirebase } from "@/firebase";
import { MiddelenOverzichtClientPage } from "./client-page";
import type { CtgbProduct } from "@/lib/types";

// Helper function to extract the highest dosage for relevant crops
const getMaxDosageForPomeFruit = (product: CtgbProduct): string => {
    if (!product.gebruiksvoorschriften || product.gebruiksvoorschriften.length === 0) {
        return '-';
    }

    // Only look at specific pome fruit crops, case-insensitive
    const relevantCrops = ['appel', 'peer', 'pitvruchten'];
    let maxDosage = 0;
    let unit = '';

    for (const gebruik of product.gebruiksvoorschriften) {
        const gewasLower = gebruik.gewas?.toLowerCase() || '';
        
        // Ensure the crop name is one of the relevant ones, and not part of a larger word
        const isRelevant = relevantCrops.some(crop => {
            const regex = new RegExp(`\\b${crop}\\b`);
            return regex.test(gewasLower);
        });
        
        if (isRelevant && gebruik.dosering) {
            // Match a number (integer or float with comma/dot) and optional unit
            const match = gebruik.dosering.match(/([0-9,.]+)\s*(.*)/);
            if (match) {
                const dosageValue = parseFloat(match[1].replace(',', '.'));
                if (!isNaN(dosageValue) && dosageValue > maxDosage) {
                    maxDosage = dosageValue;
                    unit = match[2] || '';
                }
            }
        }
    }

    return maxDosage > 0 ? `${maxDosage} ${unit}`.trim() : '-';
};


export default async function MiddelenOverzichtPage() {
    const { firestore } = initializeFirebase();
    const [allProducts, history] = await Promise.all([
        getAllCtgbProducts(firestore),
        getParcelHistoryEntries(firestore)
    ]);
    
    // Calculate popularity scores
    const popularity: Record<string, number> = {};
    for (const entry of history) {
        popularity[entry.product] = (popularity[entry.product] || 0) + 1;
    }

    const HARD_FRUIT_CROPS = ['appel', 'peer', 'pitvruchten', 'vruchtbomen'];

    const filteredProducts = allProducts
        .filter(product => 
            product.gebruiksvoorschriften?.some(gebruik => 
                HARD_FRUIT_CROPS.some(crop => 
                    gebruik.gewas?.toLowerCase().includes(crop)
                )
            )
        )
        .map(product => ({
            id: product.id,
            toelatingsnummer: product.toelatingsnummer,
            naam: product.naam,
            werkzameStoffen: product.werkzameStoffen,
            maxDosering: getMaxDosageForPomeFruit(product),
            status: product.status,
            popularity: popularity[product.naam] || 0
        }))
        .sort((a, b) => {
            // Sort by popularity descending, then by name ascending
            if (a.popularity !== b.popularity) {
                return b.popularity - a.popularity;
            }
            return a.naam.localeCompare(b.naam);
        });
    
    return <MiddelenOverzichtClientPage products={filteredProducts} />;
}
