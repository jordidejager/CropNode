
'use server';

import type { CtgbMiddel } from './types';

const REVALIDATE_TIME_SECONDS = 60 * 60 * 24 * 7; // 7 days
// Corrected base URL for the CTGB public API
const CTGB_API_BASE_URL = "https://autorisaties.ctgb.nl/ords/ctgb_pub/toelating";

// Helper function to make cached API calls
const fetchWithCache = async (url: string) => {
    try {
        const response = await fetch(url, {
            next: { revalidate: REVALIDATE_TIME_SECONDS }
        });
        if (!response.ok) {
            console.error(`CTGB API error for URL ${url}: ${response.statusText}`);
            return { items: [] };
        }
        return response.json();
    } catch (error) {
        console.error(`Fetch failed for URL ${url}:`, error);
        // Return a default structure to prevent crashes downstream
        return { items: [] };
    }
};

// Gets all authorized products for a specific crop ("gewas")
const getMiddelenVoorGewas = async (gewas: string): Promise<any[]> => {
    try {
        // Use the correct endpoint as per the documentation
        const data = await fetchWithCache(`${CTGB_API_BASE_URL}/get_toep_gewas/${gewas}/`);
        return data.items || [];
    } catch (error) {
        console.error(`Fout bij ophalen middelen voor gewas ${gewas}:`, error);
        return [];
    }
};

// Gets the active substances for a specific authorization ID
const getWerkzameStoffen = async (toelatingId: number): Promise<string> => {
    if (!toelatingId) return "Niet beschikbaar";
    try {
        // Use the correct endpoint as per the documentation
        const data = await fetchWithCache(`${CTGB_API_BASE_URL}/get_werkzame_stof/${toelatingId}/`);
        if (data.items && data.items.length > 0) {
            return data.items.map((item: any) => `${item.werkzame_stof} (${item.gehalte})`).join(', ');
        }
        return "Niet gespecificeerd";
    } catch (error) {
        console.error(`Fout bij ophalen werkzame stoffen voor toelating ${toelatingId}:`, error);
        return "Fout bij ophalen";
    }
};

// Main function called from the page to get all data for pit fruit
export async function getCtgbData(): Promise<CtgbMiddel[]> {
    const crops = ["Appel", "Peer"];
    
    // 1. Fetch all products for "Appel" and "Peer" in parallel
    const middelenPromises = crops.map(crop => getMiddelenVoorGewas(crop));
    
    let appelMiddelen: any[] = [];
    let peerMiddelen: any[] = [];

    try {
        [appelMiddelen, peerMiddelen] = await Promise.all(middelenPromises);
    } catch (error) {
        console.error("Error fetching middelen in parallel:", error);
        return []; // Return empty if the initial fetch fails
    }

    // 2. Combine and deduplicate the lists based on toelating_id
    const allMiddelen = [...appelMiddelen, ...peerMiddelen];
    const uniekeMiddelen = Array.from(new Map(allMiddelen.map(m => [m.toelating_id, m])).values());

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

    try {
        // 4. Await all results and filter out any nulls
        const resultaat = (await Promise.all(resultPromises)).filter(Boolean) as CtgbMiddel[];

        // Sort by name
        return resultaat.sort((a, b) => a.naam.localeCompare(b.naam));
    } catch (error) {
        console.error("Error processing result promises:", error);
        return [];
    }
}
