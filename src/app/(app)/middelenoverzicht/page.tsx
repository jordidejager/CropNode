'use server';

import { getAllCtgbProducts } from "@/lib/store";
import { initializeFirebase } from "@/firebase";
import { MiddelenOverzichtClientPage } from "./client-page";
import type { CtgbProduct } from "@/lib/types";

// Helper function to extract the highest dosage for relevant crops
const getMaxDosageForPomeFruit = (product: CtgbProduct): string => {
    if (!product.gebruiksvoorschriften || product.gebruiksvoorschriften.length === 0) {
        return '-';
    }

    const relevantCrops = ['appel', 'peer', 'pitvruchten', 'vruchtbomen'];
    let maxDosage = 0;
    let unit = '';

    for (const gebruik of product.gebruiksvoorschriften) {
        const gewasLower = gebruik.gewas?.toLowerCase() || '';
        const isRelevant = relevantCrops.some(crop => gewasLower.includes(crop));
        
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
    const allProducts = await getAllCtgbProducts(firestore);

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
            status: product.status
        }));
    
    return <MiddelenOverzichtClientPage products={filteredProducts} />;
}
