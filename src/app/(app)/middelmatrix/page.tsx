import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { middelMatrix } from '@/lib/data';

export default function MiddelMatrixPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">MiddelMatrix</h1>
        <p className="text-muted-foreground">Overzicht van wettelijke gebruiksvoorschriften.</p>
      </div>
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
    </div>
  );
}
