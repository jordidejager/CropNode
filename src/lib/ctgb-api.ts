
'use server';

import type { CtgbMiddel } from './types';

// Deze functie haalt de gegevens op, filtert ze en transformeert ze naar het juiste formaat.
// Caching is ingeschakeld om het aantal API-verzoeken te beperken.
const getCtgbToelatingen = async (): Promise<any[]> => {
    const fetch = (await import('node-fetch')).default;
    try {
        const response = await fetch("https://autorisaties.ctgb.nl/ords/ctgb_pub/toelating/get/");
        if (!response.ok) {
            throw new Error(`Fout bij het ophalen van CTGB data: ${response.statusText}`);
        }
        const data = await response.json();
        return (data as any).items;
    } catch (error) {
        console.error("Fout bij het ophalen van CTGB-toelatingen:", error);
        return [];
    }
}

// Deze functie haalt de werkzame stoffen op voor een specifiek toelatingsnummer.
const getWerkzameStoffen = async (toelatingId: number): Promise<string> => {
    const fetch = (await import('node-fetch')).default;
    if (!toelatingId) return "Niet beschikbaar";
    try {
        const response = await fetch(`https://autorisaties.ctgb.nl/ords/ctgb_pub/toelating/get_werkzame_stof/${toelatingId}/`);
        if (!response.ok) {
            return "Niet beschikbaar";
        }
        const data = await response.json();
        const items = (data as any).items;
        if (items && items.length > 0) {
            return items.map((item: any) => `${item.werkzame_stof} (${item.gehalte})`).join(', ');
        }
        return "Niet gespecificeerd";
    } catch (error) {
        console.error(`Fout bij ophalen werkzame stoffen voor toelating ${toelatingId}:`, error);
        return "Fout bij ophalen";
    }
};

// Hoofdfunctie die wordt aangeroepen vanuit de pagina.
export async function getCtgbData(): Promise<CtgbMiddel[]> {
    const fetch = (await import('node-fetch')).default;
    const toelatingen = await getCtgbToelatingen();

    const pitfruitGewassen = ["Appel", "Peer"];
    const pitfruitMiddelen: any[] = [];

    for (const toelating of toelatingen) {
        // We controleren of er een 'W-codering' is, wat duidt op een landbouwtoepassing
        if (toelating.wtg_code_oms) {
             const toepassingenResponse = await fetch(`https://autorisaties.ctgb.nl/ords/ctgb_pub/toelating/get_toepassing/${toelating.toelating_id}/`);
             if(toepassingenResponse.ok){
                const toepassingenData = await toepassingenResponse.json();
                const items = (toepassingenData as any).items;
                const heeftPitfruitToepassing = items.some((toep: any) => 
                    pitfruitGewassen.includes(toep.gewas_oms)
                );

                if (heeftPitfruitToepassing) {
                    pitfruitMiddelen.push(toelating);
                }
             }
        }
    }

    const uniekeMiddelen = Array.from(new Map(pitfruitMiddelen.map(m => [m.toelating_id, m])).values());

    const resultaat = await Promise.all(
        uniekeMiddelen.map(async (middel) => {
            const werkzameStoffen = await getWerkzameStoffen(middel.toelating_id);
            return {
                toelatingnummer: middel.toelatingsnummer,
                naam: middel.toelatingnaam,
                status: middel.toelatingstatus_oms,
                werkzameStoffen: werkzameStoffen
            };
        })
    );

    return resultaat;
}
