import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { InvoerForm } from '@/components/invoer-form';
import { getLogbookEntries, getParcelHistoryEntries } from '@/lib/store';
import { parcels, middelMatrix } from '@/lib/data';
import { HistoryDashboard } from '@/components/history-dashboard';
import { LogbookTable } from '@/components/logbook-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const dynamic = 'force-dynamic';

function LogboekTabContent() {
  const entries = getLogbookEntries();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Volledig Logboek</CardTitle>
        <CardDescription>Alle {entries.length} regels, met de nieuwste bovenaan.</CardDescription>
      </CardHeader>
      <CardContent>
        <LogbookTable entries={entries} />
      </CardContent>
    </Card>
  );
}

function PerceelHistorieTabContent() {
  const historyEntries = getParcelHistoryEntries();
  const cropVarieties = [...new Set(parcels.map(p => p.variety))];
  const parcelNames = [...new Set(parcels.map(p => p.name))];

  return (
     <HistoryDashboard 
        entries={historyEntries}
        initialVarieties={cropVarieties}
        initialParcels={parcelNames}
      />
  );
}

function PercelenTabContent() {
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

function MiddelMatrixTabContent() {
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


export default function InvoerPage() {
  const recentEntries = getLogbookEntries().slice(0, 5);

  return (
    <Tabs defaultValue="invoer" className="h-full flex flex-col">
      <TabsList className="mx-auto">
        <TabsTrigger value="invoer">Slimme Invoer</TabsTrigger>
        <TabsTrigger value="logboek">Logboek</TabsTrigger>
        <TabsTrigger value="historie">Perceelhistorie</TabsTrigger>
        <TabsTrigger value="percelen">Percelen</TabsTrigger>
        <TabsTrigger value="matrix">MiddelMatrix</TabsTrigger>
      </TabsList>
      <TabsContent value="invoer" className="flex-grow flex flex-col p-0">
         <div className="flex-grow container mx-auto p-4 max-w-3xl flex flex-col h-full">
            <div className="flex-grow overflow-y-auto space-y-4 p-4 rounded-lg bg-card border">
                {/* Chat history will appear here */}
                <p className="text-center text-muted-foreground">Voer hieronder je bespuiting in.</p>
            </div>
            <div className="py-4">
                <InvoerForm />
            </div>
        </div>
      </TabsContent>
      <TabsContent value="logboek">
        <LogboekTabContent />
      </TabsContent>
       <TabsContent value="historie">
        <PerceelHistorieTabContent />
      </TabsContent>
       <TabsContent value="percelen">
        <PercelenTabContent />
      </TabsContent>
       <TabsContent value="matrix">
        <MiddelMatrixTabContent />
      </TabsContent>
    </Tabs>
  );
}
