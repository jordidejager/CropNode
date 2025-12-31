
'use client';

import { useEffect, useState } from 'react';
import { useFirestore } from '@/firebase';
import { getMiddelenByName } from '@/lib/store';
import type { Middel } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

type GroupedApplication = {
    title: string;
    rules: Middel;
}

// Fields to compare for grouping 'Appel' and 'Peer'
const fieldsToCompare: (keyof Middel)[] = [
    'Max. dosering per toepassing',
    'Max. aantal toepassingen per 12 maanden',
    'Min. interval tussen toepassingen (dagen)',
    'Veiligheidstermijn (dagen)',
    'Opmerkingen',
    'Toepassingsstadium',
    'BBCH-code',
];

function groupApplications(middelen: Middel[]): GroupedApplication[] {
    const appleRule = middelen.find(m => String(m['Toepassingsgebied']).toLowerCase().includes('appel'));
    const pearRule = middelen.find(m => String(m['Toepassingsgebied']).toLowerCase().includes('peer'));

    let isIdentical = false;
    if (appleRule && pearRule) {
        isIdentical = fieldsToCompare.every(field => {
            const appleValue = appleRule[field] ?? '';
            const pearValue = pearRule[field] ?? '';
            return String(appleValue) === String(pearValue);
        });
    }

    if (isIdentical && appleRule && pearRule) {
        const otherRules = middelen.filter(m => m.id !== appleRule.id && m.id !== pearRule.id);
        return [
            { title: 'Pitvruchten (Appel & Peer)', rules: appleRule },
            ...otherRules.map(rules => ({ title: String(rules['Toepassingsgebied'] || 'Overig'), rules }))
        ];
    }

    return middelen.map(rules => ({
        title: String(rules['Toepassingsgebied'] || 'Toepassing'),
        rules
    }));
}


export default function MiddelDetailPage({ params }: { params: { id: string } }) {
    const [middelen, setMiddelen] = useState<Middel[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const db = useFirestore();
    const router = useRouter();

    // Decode the URL component which might contain special characters
    const middelnaam = decodeURIComponent(params.id);

    useEffect(() => {
        if (!db || !middelnaam) return;

        async function loadMiddelen() {
            setLoading(true);
            setError(null);
            try {
                const fetchedMiddelen = await getMiddelenByName(db, middelnaam);
                if (fetchedMiddelen.length > 0) {
                    setMiddelen(fetchedMiddelen);
                } else {
                    setError('Middel niet gevonden in de database.');
                }
            } catch (e: any) {
                setError(e.message || 'Fout bij het ophalen van de gegevens.');
            } finally {
                setLoading(false);
            }
        }
        loadMiddelen();
    }, [db, middelnaam]);
    
    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <Skeleton className="h-8 w-3/4" />
                    <Skeleton className="h-4 w-1/2 mt-2" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                </CardContent>
            </Card>
        );
    }

    if (error) {
        return (
             <Card className="w-full max-w-2xl mx-auto">
                 <CardHeader>
                     <Button variant="ghost" onClick={() => router.back()} className="mb-4 w-fit">
                         <ChevronLeft className="mr-2 h-4 w-4" />
                         Terug naar overzicht
                     </Button>
                     <Alert variant="destructive">
                         <AlertTriangle className="h-4 w-4" />
                         <AlertTitle>Fout</AlertTitle>
                         <AlertDescription>{error}</AlertDescription>
                     </Alert>
                 </CardHeader>
             </Card>
        );
    }

    if (middelen.length === 0) {
        return null;
    }
    
    const firstMiddel = middelen[0];
    const groupedData = groupApplications(middelen);
    const staticDetails = {
        'Toelatingsnummer': firstMiddel['Toelatingsnummer'],
        'Werkzame stof(fen)': firstMiddel['Werkzame stof(fen)'],
        'Formulering': firstMiddel['Formulering'],
        'Aard werking': firstMiddel['Aard werking'],
        'Status toelating': firstMiddel['Status toelating'],
    };


    return (
        <Card className="w-full max-w-4xl mx-auto">
            <CardHeader>
                 <Button variant="ghost" onClick={() => router.back()} className="mb-4 w-fit -ml-4">
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Terug naar overzicht
                </Button>
                <CardTitle>{firstMiddel['Middelnaam'] || 'Onbekend Middel'}</CardTitle>
                <CardDescription>Details en toepassingsvoorschriften.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                 <div>
                    <h3 className="font-semibold mb-4 text-lg">Algemene Informatie</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                        {Object.entries(staticDetails).map(([key, value]) => (
                            <div key={key} className="flex flex-col border-b pb-2">
                                <p className="font-semibold text-muted-foreground">{key}</p>
                                <p className="text-foreground mt-1">{String(value) || '-'}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <div>
                    <h3 className="font-semibold mb-4 text-lg">Toepassingen</h3>
                     <Accordion type="multiple" defaultValue={groupedData.length === 1 ? [groupedData[0].title] : []} className="w-full">
                        {groupedData.map(({ title, rules }) => (
                             <AccordionItem value={title} key={title}>
                                <AccordionTrigger className="font-medium text-base hover:no-underline">
                                  {title}
                                </AccordionTrigger>
                                <AccordionContent>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm pt-2">
                                         {fieldsToCompare.map((key) => (
                                             <div key={key} className="flex flex-col border-b pb-2">
                                                 <p className="font-semibold text-muted-foreground">{key}</p>
                                                 <p className="text-foreground mt-1">{String(rules[key]) || '-'}</p>
                                             </div>
                                         ))}
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </div>
            </CardContent>
        </Card>
    );
}

