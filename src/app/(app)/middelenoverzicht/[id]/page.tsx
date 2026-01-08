'use server';

import React from 'react';
import { initializeFirebase } from '@/firebase';
import { getCtgbProductByNumber } from '@/lib/store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, ChevronLeft, Sprout, TestTube, Info, ShieldCheck, Factory } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';


const DetailItem = ({ label, children, icon: Icon }: { label: string; children: React.ReactNode, icon?: React.ElementType }) => (
    <div className="space-y-1">
        <div className="flex items-center gap-2">
            {Icon && <Icon className="size-4 text-muted-foreground" />}
            <p className="font-semibold text-muted-foreground">{label}</p>
        </div>
        <div className="pl-6 text-foreground">{children}</div>
    </div>
);


export default async function MiddelDetailPage({ params }: { params: { id: string } }) {
    const { firestore } = initializeFirebase();
    const middel = await getCtgbProductByNumber(firestore, params.id);
    
    if (!middel) {
        return (
             <Card className="w-full max-w-4xl mx-auto">
                 <CardHeader>
                    <Button asChild variant="ghost" className="mb-4 w-fit -ml-4">
                        <Link href="/middelenoverzicht">
                            <ChevronLeft className="mr-2 h-4 w-4" />
                            Terug naar overzicht
                        </Link>
                    </Button>
                     <Alert variant="destructive">
                         <AlertTriangle className="h-4 w-4" />
                         <AlertTitle>Fout</AlertTitle>
                         <AlertDescription>Middel met toelatingsnummer {params.id} niet gevonden in de database.</AlertDescription>
                     </Alert>
                 </CardHeader>
             </Card>
        );
    }

    return (
        <Card className="w-full max-w-5xl mx-auto">
            <CardHeader>
                 <Button asChild variant="ghost" className="mb-4 w-fit -ml-4">
                    <Link href="/middelenoverzicht">
                        <ChevronLeft className="mr-2 h-4 w-4" />
                        Terug naar overzicht
                    </Link>
                </Button>
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle className="text-3xl">{middel.naam}</CardTitle>
                        <CardDescription>Details voor toelatingsnummer {middel.toelatingsnummer}</CardDescription>
                    </div>
                     <Badge variant={middel.status === 'Valid' ? 'default' : 'destructive'} className={cn("text-base", middel.status === 'Valid' && 'bg-green-600')}>{middel.status}</Badge>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-6 text-sm">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <DetailItem label="Toelatingshouder" icon={Factory}>
                           <p>{middel.toelatingshouder || '-'}</p>
                        </DetailItem>
                        <DetailItem label="Vervaldatum" icon={Info}>
                           <p>{middel.vervaldatum ? new Date(middel.vervaldatum).toLocaleDateString('nl-NL') : '-'}</p>
                        </DetailItem>
                         <DetailItem label="Werkzame stoffen" icon={ShieldCheck}>
                           <div className="flex flex-wrap gap-1">
                                {middel.werkzameStoffen.map(stof => <Badge variant="secondary" key={stof}>{stof}</Badge>)}
                            </div>
                        </DetailItem>
                    </div>
                    
                    <Separator className="my-6" />

                    <div>
                        <h3 className="text-xl font-semibold mb-4">Gebruiksvoorschriften</h3>
                        <ScrollArea className="h-[500px] w-full rounded-md border">
                            <Table>
                                 <TableHeader className="sticky top-0 bg-muted">
                                    <TableRow>
                                        <TableHead><div className="flex items-center gap-2"><Sprout /> Gewas</div></TableHead>
                                        <TableHead><div className="flex items-center gap-2"><TestTube /> Ziekte/Plaag</div></TableHead>
                                        <TableHead className="whitespace-nowrap">Max. Toep.</TableHead>
                                        <TableHead>Interval</TableHead>
                                        <TableHead>Veiligheidstermijn</TableHead>
                                        <TableHead>Dosering</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {middel.gebruiksvoorschriften.map((gebruik, index) => (
                                        <TableRow key={index}>
                                            <TableCell className="font-medium max-w-xs">{gebruik.gewas || '-'}</TableCell>
                                            <TableCell className="max-w-xs">{gebruik.doelorganisme || '-'}</TableCell>
                                            <TableCell className="text-center">{gebruik.maxToepassingen || '-'}</TableCell>
                                            <TableCell>{gebruik.interval || '-'}</TableCell>
                                            <TableCell>{gebruik.veiligheidstermijn || '-'}</TableCell>
                                            <TableCell className="font-semibold text-primary whitespace-nowrap">{gebruik.dosering || '-'}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}