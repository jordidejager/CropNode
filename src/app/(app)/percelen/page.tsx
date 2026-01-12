
'use server';

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PercelenClientPage } from "./client-page";
import RvoKaartPage from "./kaart/page";

export default async function PercelenPage() {
    return (
        <Tabs defaultValue="list" className="h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <div>
                    <CardTitle>Mijn Percelen</CardTitle>
                    <CardDescription>Beheer uw percelen of importeer nieuwe percelen van de RVO kaart.</CardDescription>
                </div>
                <TabsList>
                    <TabsTrigger value="list">Mijn Percelen</TabsTrigger>
                    <TabsTrigger value="map">Kaart</TabsTrigger>
                </TabsList>
            </div>
            <TabsContent value="list" className="flex-grow">
                 <PercelenClientPage />
            </TabsContent>
            <TabsContent value="map" className="flex-grow h-[calc(100vh-14rem)]">
                <Card className="h-full">
                    <RvoKaartPage />
                </Card>
            </TabsContent>
        </Tabs>
    );
}
