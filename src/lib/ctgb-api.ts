




'use server';

import type { CtgbMiddel } from './types';

const REVALIDATE_TIME_SECONDS = 60 * 60 * 24; // 1 day

const CTGB_API_BASE_URL = "https://toelatingen.ctgb.nl/ords/ctgb_pub/toelating";

const fetchWithCache = async (url: string): Promise<any> => {
    try {
        const response = await fetch(url, {
            next: { revalidate: REVALIDATE_TIME_SECONDS }
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`CTGB API error for ${url}: ${response.status} ${response.statusText}`, errorText);
            throw new Error(`API returned status ${response.status}: ${errorText}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Fetch failed for ${url}:`, error);
        throw error;
    }
};

const getMiddelenVoorGewas = async (gewas: string): Promise<any[]> => {
    try {
        const data = await fetchWithCache(`${CTGB_API_BASE_URL}/get_toep_gewas/${gewas}/`);
        return data.items || [];
    } catch (error) {
        console.error(`Fout bij ophalen middelen voor gewas ${gewas}:`, error);
        return [];
    }
};

const getWerkzameStoffen = async (toelatingId: number): Promise<string> => {
    if (!toelatingId) return "Niet beschikbaar";
    try {
        const data = await fetchWithCache(`${CTGB_API_BASE_URL}/get_werkzame_stof/${toelatingId}/`);
        if (data.items && data.items.length > 0) {
            return data.items.map((item: any) => `${item.werkzame_stof} (${item.gehalte})`).join(', ');
        }
        return "Niet gespecificeerd";
    } catch (error) {
        console.warn(`Kon werkzame stoffen voor toelatingId ${toelatingId} niet ophalen.`, error);
        return "Kon stoffen niet ophalen";
    }
};

export async function getCtgbDataFromApi(): Promise<CtgbMiddel[]> {
    const crops = ["Appel", "Peer"];
    
    const middelenPromises = crops.map(crop => getMiddelenVoorGewas(crop));
    
    const [appelMiddelen, peerMiddelen] = await Promise.all(middelenPromises);

    const allMiddelen = [...appelMiddelen, ...peerMiddelen];
    const uniekeMiddelenMap = new Map<number, any>();
    allMiddelen.forEach(m => {
        if (m && m.toelating_id) {
            uniekeMiddelenMap.set(m.toelating_id, m);
        }
    });
    
    const uniekeMiddelen = Array.from(uniekeMiddelenMap.values());

    const resultPromises = uniekeMiddelen.map(async (middel) => {
        if (!middel || !middel.toelating_id) return null;
        
        const werkzameStoffen = await getWerkzameStoffen(middel.toelating_id);
        
        return {
            toelatingsnummer: middel.toelatingsnummer,
            naam: middel.toelatingnaam,
            status: middel.toelatingstatus_oms,
            werkzameStoffen: werkzameStoffen
        } as CtgbMiddel;
    });

    const resultaat = (await Promise.all(resultPromises)).filter(Boolean) as CtgbMiddel[];

    return resultaat.sort((a, b) => a.naam.localeCompare(b.naam));
}


