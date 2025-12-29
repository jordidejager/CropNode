
'use server';

import type { CtgbMiddel } from './types';

// Corrected base URL for the CTGB public API
const CTGB_API_BASE_URL = "https://autorisaties.ctgb.nl/ords/ctgb_pub/toelating";

// Helper function to make API calls.
const fetchFromApi = async (url: string) => {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`CTGB API error for URL ${url}: ${response.status} ${response.statusText}`, errorText);
            throw new Error(`API returned status ${response.status} for ${url}`);
        }
        return response.json();
    } catch (error) {
        console.error(`Fetch failed for URL ${url}:`, error);
        throw error; // Re-throw to be handled by the caller
    }
};

// Gets all authorized products for a specific crop ("gewas")
const getMiddelenVoorGewas = async (gewas: string): Promise<any[]> => {
    const data = await fetchFromApi(`${CTGB_API_BASE_URL}/get_toep_gewas/${gewas}/`);
    return data.items || [];
};

// Gets the active substances for a specific authorization ID
const getWerkzameStoffen = async (toelatingId: number): Promise<string> => {
    if (!toelatingId) return "Niet beschikbaar";
    const data = await fetchFromApi(`${CTGB_API_BASE_URL}/get_werkzame_stof/${toelatingId}/`);
    if (data.items && data.items.length > 0) {
        return data.items.map((item: any) => `${item.werkzame_stof} (${item.gehalte})`).join(', ');
    }
    return "Niet gespecificeerd";
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
        
        try {
            const werkzameStoffen = await getWerkzameStoffen(middel.toelating_id);
            
            return {
                toelatingnummer: middel.toelatingsnummer,
                naam: middel.toelatingnaam,
                status: middel.toelatingstatus_oms,
                werkzameStoffen: werkzameStoffen
            };
        } catch (error) {
             console.error(`Kon werkzame stof voor ${middel.toelating_id} niet ophalen:`, error);
             return null; // Return null if substance fetch fails for one item
        }
    });

    // 4. Await all results and filter out any nulls
    const resultaat = (await Promise.all(resultPromises)).filter(Boolean) as CtgbMiddel[];

    // Sort by name
    return resultaat.sort((a, b) => a.naam.localeCompare(b.naam));
}
