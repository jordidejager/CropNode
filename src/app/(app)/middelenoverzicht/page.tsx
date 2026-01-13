
'use server';

import { getAllCtgbProducts, getParcelHistoryEntries, getFertilizers } from "@/lib/store";
import { initializeFirebase } from "@/firebase";
import { MiddelenOverzichtClientPage } from "./client-page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FertilizersClientPage } from "./fertilizers-client-page";

export default async function MiddelenOverzichtPage() {
    const { firestore } = initializeFirebase();
    
    // Fetch data for both tabs in parallel
    const [ctgbProducts, history, fertilizers] = await Promise.all([
        getAllCtgbProducts(firestore),
        getParcelHistoryEntries(firestore),
        getFertilizers(firestore),
    ]);
    
    // Process CTGB products
    const popularity: Record<string, number> = {};
    for (const entry of history) {
        popularity[entry.product] = (popularity[entry.product] || 0) + 1;
    }

    const HARD_FRUIT_CROPS = ['appel', 'peer', 'pitvruchten', 'vruchtbomen'];

    const filteredCtgbProducts = ctgbProducts
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
            if (a.popularity !== b.popularity) {
                return b.popularity - a.popularity;
            }
            return a.naam.localeCompare(b.naam);
        });
    
    return (
        <Tabs defaultValue="gewasbescherming" className="h-full flex flex-col">
             <div className="flex justify-between items-center mb-4">
                <div>
                    <CardTitle>Middelenoverzicht</CardTitle>
                    <CardDescription>Overzicht van gewasbescherming en meststoffen.</CardDescription>
                </div>
                <TabsList>
                    <TabsTrigger value="gewasbescherming">Gewasbescherming</TabsTrigger>
                    <TabsTrigger value="meststoffen">Meststoffen</TabsTrigger>
                </TabsList>
            </div>
            <TabsContent value="gewasbescherming" className="flex-grow">
                 <MiddelenOverzichtClientPage products={filteredCtgbProducts} />
            </TabsContent>
            <TabsContent value="meststoffen" className="flex-grow">
                <FertilizersClientPage fertilizers={fertilizers} />
            </TabsContent>
        </Tabs>
    );
}
