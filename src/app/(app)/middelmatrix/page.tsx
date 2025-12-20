'use client';

import { useState, useMemo } from 'react';
import { middelMatrix } from '@/lib/data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

export default function MiddelMatrixPage() {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredMatrix = useMemo(() => {
        if (!searchTerm) {
            return middelMatrix;
        }
        return middelMatrix.filter(regel =>
            regel.product.toLowerCase().includes(searchTerm.toLowerCase()) ||
            regel.crop.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (regel.disease && regel.disease.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }, [searchTerm]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Middelen Database</CardTitle>
                <CardDescription>
                    Doorzoekbare database van toegelaten middelen voor pitfruit.
                    <span className="block text-xs mt-1 text-muted-foreground">Let op: De onderstaande data is een voorbeeld. Vul deze aan met de actuele CTGB-gegevens.</span>
                </CardDescription>
                <div className="relative mt-4">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Zoek op middel, gewas of ziekte..."
                        className="w-full rounded-lg bg-background pl-8"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Middel</TableHead>
                                <TableHead>Gewas</TableHead>
                                <TableHead>Ziekte/Plaag</TableHead>
                                <TableHead className="text-right">Max Dosis</TableHead>
                                <TableHead className="text-right">Interval (dgn)</TableHead>
                                <TableHead className="text-right">Max Toep./jr</TableHead>
                                <TableHead className="text-right">Max Dosis/jr</TableHead>
                                <TableHead className="text-right">Termijn (dgn)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredMatrix.length > 0 ? (
                                filteredMatrix.map((regel, index) => (
                                    <TableRow key={index}>
                                        <TableCell className="font-medium">{regel.product}</TableCell>
                                        <TableCell>{regel.crop}</TableCell>
                                        <TableCell>{regel.disease || '-'}</TableCell>
                                        <TableCell className="text-right">{`${regel.maxDosage.toFixed(2)} ${regel.unit}`}</TableCell>
                                        <TableCell className="text-right">{regel.minIntervalDays ?? '-'}</TableCell>
                                        <TableCell className="text-right">{regel.maxApplicationsPerYear ?? '-'}</TableCell>
                                        <TableCell className="text-right">{regel.maxDosePerYear ? `${regel.maxDosePerYear} ${regel.unit}` : '-'}</TableCell>
                                        <TableCell className="text-right">{regel.safetyPeriodDays ?? '-'}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={8} className="h-24 text-center">
                                        Geen middelen gevonden voor "{searchTerm}".
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}
