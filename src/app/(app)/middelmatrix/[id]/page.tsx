
'use client';

import { useEffect, useState } from 'react';
import { useFirestore } from '@/firebase';
import { getMiddel } from '@/lib/store';
import type { Middel } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from '@/components/ui/separator';

function CollapsibleText({ text, label }: { text: string, label: string }) {
    const isLongText = text.length > 50;

    if (!isLongText) {
        return <p className="text-foreground mt-1">{text || '-'}</p>;
    }

    return (
        <Collapsible>
            <CollapsibleContent className="space-y-2">
                 <p className="text-foreground mt-1">{text}</p>
            </CollapsibleContent>
            <CollapsibleTrigger asChild>
                 <p className="text-foreground mt-1 data-[state=closed]:block data-[state=open]:hidden">
                    {`${text.substring(0, 50)}...`}
                    <Button variant="link" className="p-0 pl-1 text-xs h-auto">
                        meer
                    </Button>
                </p>
            </CollapsibleTrigger>
        </Collapsible>
    );
}

const DetailItem = ({ label, value }: { label: string; value: string }) => (
    <div className="flex flex-col border-b pb-2">
        <p className="font-semibold text-muted-foreground">{label}</p>
        <CollapsibleText text={value} label={label} />
    </div>
);

export default function MiddelDetailPage({ params }: { params: { id: string } }) {
    const [middel, setMiddel] = useState<Middel | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const db = useFirestore();
    const router = useRouter();

    useEffect(() => {
        if (!db || !params.id) return;

        async function loadMiddel() {
            setLoading(true);
            setError(null);
            try {
                const fetchedMiddel = await getMiddel(db, params.id);
                if (fetchedMiddel) {
                    setMiddel(fetchedMiddel);
                } else {
                    setError('Middel niet gevonden in de database.');
                }
            } catch (e: any) {
                setError(e.message || 'Fout bij het ophalen van de gegevens.');
            } finally {
                setLoading(false);
            }
        }
        loadMiddel();
    }, [db, params.id]);
    
    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <Skeleton className="h-8 w-3/4" />
                    <Skeleton className="h-4 w-1/2 mt-2" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-64 w-full" />
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

    if (!middel) {
        return null; // Should be handled by error state
    }
    
    const primaryKeys = ['Toelatingsnummer', 'Middelnaam', 'Werkzame stof(fen)'];
    const otherKeys = Object.keys(middel).filter(key => key !== 'id' && !primaryKeys.includes(key));

    return (
        <Card className="w-full max-w-4xl mx-auto">
            <CardHeader>
                 <Button variant="ghost" onClick={() => router.back()} className="mb-4 w-fit -ml-4">
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Terug naar overzicht
                </Button>
                <CardTitle>{middel['Middelnaam'] || 'Onbekend Middel'}</CardTitle>
                <CardDescription>Details voor toelatingsnummer {middel['Toelatingsnummer']}</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-4 text-sm">
                    <div className="space-y-4">
                       {primaryKeys.map(key => middel[key] && (
                         <div key={key}>
                             <p className="font-semibold text-muted-foreground">{key}</p>
                             <p className="text-base text-foreground">{String(middel[key])}</p>
                         </div>
                       ))}
                    </div>
                    
                    <Separator className="my-6" />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                        {otherKeys.map(key => (
                           <DetailItem key={key} label={key} value={String(middel[key] || '-')} />
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
