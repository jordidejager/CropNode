import { parcels } from '@/lib/data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function PercelenPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mijn Percelen</CardTitle>
        <CardDescription>Totaal {parcels.length} percelen in beheer.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">ID</TableHead>
                <TableHead>Naam</TableHead>
                <TableHead>Gewas</TableHead>
                <TableHead>Ras</TableHead>
                <TableHead className="text-right">Oppervlakte (ha)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parcels.map((parcel) => (
                <TableRow key={parcel.id}>
                  <TableCell className="font-medium">{parcel.id}</TableCell>
                  <TableCell>{parcel.name}</TableCell>
                  <TableCell>{parcel.crop}</TableCell>
                  <TableCell>{parcel.variety}</TableCell>
                  <TableCell className="text-right">{parcel.area.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
