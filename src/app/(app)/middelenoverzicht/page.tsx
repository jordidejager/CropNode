
'use server';

import { getAllCtgbProducts, getParcelHistoryEntries } from "@/lib/store";
import { initializeFirebase } from "@/firebase";
import { MiddelenOverzichtClientPage } from "./client-page";
import type { CtgbProduct } from "@/lib/types";


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
            status: product.status,
            popularity: popularity[product.naam] || 0,
            gebruiksvoorschriften: product.gebruiksvoorschriften
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
