
'use server';

import type { CtgbMiddel } from './types';

// Corrected base URL for the CTGB public API
const CTGB_API_BASE_URL = "https://autorisaties.ctgb.nl/ords/ctgb_pub/toelating";

// Gets all authorized products for a specific crop ("gewas")
const getMiddelenVoorGewas = async (gewas: string): Promise<any[]> => {
    try {
        const response = await fetch(`${CTGB_API_BASE_URL}/get_toep_gewas/${gewas}/`);
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`CTGB API error for crop ${gewas}: ${response.status} ${response.statusText}`, errorText);
            throw new Error(`API returned status ${response.status} for ${gewas}`);
        }
        const data = await response.json();
        return data.items || [];
    } catch (error) {
        console.error(`Fetch failed for crop ${gewas}:`, error);
        throw error; // Re-throw to be handled by the caller
    }
};

// Gets the active substances for a specific authorization ID
const getWerkzameStoffen = async (toelatingId: number): Promise<string> => {
    if (!toelatingId) return "Niet beschikbaar";
    try {
        const response = await fetch(`${CTGB_API_BASE_URL}/get_werkzame_stof/${toelatingId}/`);
        if (!response.ok) {
            // It's possible a middel doesn't have substances, so we don't throw, just log.
            console.warn(`CTGB API warning for substance ${toelatingId}: ${response.status}`);
            return "Kon stoffen niet ophalen";
        }
        const data = await response.json();
        if (data.items && data.items.length > 0) {
            return data.items.map((item: any) => `${item.werkzame_stof} (${item.gehalte})`).join(', ');
        }
        return "Niet gespecificeerd";
    } catch (error) {
        console.error(`Fetch failed for substance ${toelatingId}:`, error);
        return "Fout bij ophalen stoffen";
    }
};

// Main function to be called by the server action to get all data for pit fruit
export async function getCtgbDataFromApi(): Promise<CtgbMiddel[]> {
    const crops = ["Appel", "Peer"];
    
    // 1. Fetch all products for "Appel" and "Peer" in parallel
    const middelenPromises = crops.map(crop => getMiddelenVoorGewas(crop));
    
    const [appelMiddelen, peerMiddelen] = await Promise.all(middelenPromises);

    // 2. Combine and deduplicate the lists based on toelating_id
    const allMiddelen = [...appelMiddelen, ...peerMiddelen];
    const uniekeMiddelenMap = new Map(allMiddelen.map(m => [m.toelating_id, m]));
    const uniekeMiddelen = Array.from(uniekeMiddelenMap.values());

    // 3. Fetch active substances for the unique list of products in parallel
    const resultPromises = uniekeMiddelen.map(async (middel) => {
        if (!middel || !middel.toelating_id) return null;
        
        const werkzameStoffen = await getWerkzameStoffen(middel.toelating_id);
        
        return {
            toelatingnummer: middel.toelatingsnummer,
            naam: middel.toelatingnaam,
            status: middel.toelatingstatus_oms,
            werkzameStoffen: werkzameStoffen
        };
    });

    // 4. Await all results and filter out any nulls
    const resultaat = (await Promise.all(resultPromises)).filter(Boolean) as CtgbMiddel[];

    // Sort by name
    return resultaat.sort((a, b) => a.naam.localeCompare(b.naam));
}
