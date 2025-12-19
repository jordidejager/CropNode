import { middelMatrix } from '@/lib/data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function MiddelMatrixPage() {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Product Regels</CardTitle>
                <CardDescription>{middelMatrix.length} regels gedefinieerd.</CardDescription>
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
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {middelMatrix.map((regel, index) => (
                                <TableRow key={index}>
                                    <TableCell className="font-medium">{regel.product}</TableCell>
                                    <TableCell>{regel.crop}</TableCell>
                                    <TableCell>{regel.disease || '-'}</TableCell>
                                    <TableCell className="text-right">{`${regel.maxDosage.toFixed(2)} ${regel.unit}`}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}
