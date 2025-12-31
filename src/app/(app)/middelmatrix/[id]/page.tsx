
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
                <CardContent className="space-y-4">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
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
        return null; 
    }

    const { id, ...details } = middel;

    return (
        <Card className="w-full max-w-4xl mx-auto">
            <CardHeader>
                 <Button variant="ghost" onClick={() => router.back()} className="mb-4 w-fit -ml-4">
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Terug naar overzicht
                </Button>
                <CardTitle>{details['Middelnaam'] || 'Onbekend Middel'}</CardTitle>
                <CardDescription>Toelatingsnummer: {details['Toelatingsnummer'] || '-'}</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                    {Object.entries(details).map(([key, value]) => (
                        <div key={key} className="flex flex-col border-b pb-2">
                            <p className="font-semibold text-muted-foreground">{key}</p>
                            <p className="text-foreground mt-1">{String(value) || '-'}</p>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
