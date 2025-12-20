'use client';

import { useEffect, useState } from 'react';
import { useFirestore } from '@/firebase';
import { getParcels, addParcel, updateParcel, deleteParcel } from '@/lib/store';
import type { Parcel } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, PlusCircle } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ParcelFormDialog } from '@/components/parcel-form-dialog';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import dynamic from 'next/dynamic';

const ParcelMapView = dynamic(() => import('@/components/parcel-map-view').then(m => m.ParcelMapView), {
  ssr: false,
  loading: () => <Skeleton className="h-[600px] w-full" />,
});


export default function PercelenPage() {
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingParcel, setEditingParcel] = useState<Parcel | null>(null);
  const [activeTab, setActiveTab] = useState('list');
  
  const db = useFirestore();
  const { toast } = useToast();

  async function loadParcels() {
    if (!db) return;
    setLoading(true);
    const fetchedParcels = await getParcels(db);
    setParcels(fetchedParcels);
    setLoading(false);
  }

  useEffect(() => {
    if(db) {
      loadParcels();
    }
  }, [db]);

  const handleAdd = () => {
    setEditingParcel(null);
    setIsFormOpen(true);
  };

  const handleEdit = (parcel: Parcel) => {
    setEditingParcel(parcel);
    setIsFormOpen(true);
  };

  const handleDelete = async (parcelId: string) => {
    if (!db) return;
    await deleteParcel(db, parcelId);
    toast({ title: 'Succesvol verwijderd', description: 'Het perceel is uit de database verwijderd.' });
    loadParcels();
  };

  const handleFormSubmit = async (values: Omit<Parcel, 'id'> & { id?: string }) => {
    if (!db) return;

    const parcelData = { ...values };

    try {
      if (parcelData.id) {
        await updateParcel(db, parcelData as Parcel);
        toast({ title: 'Succesvol bijgewerkt', description: 'De perceelgegevens zijn opgeslagen.' });
      } else {
        const { id, ...addData } = parcelData; // remove id for add operation
        await addParcel(db, addData);
        toast({ title: 'Succesvol toegevoegd', description: 'Het nieuwe perceel is opgeslagen.' });
      }
      loadParcels();
      return true; // Indicate success
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Fout opgetreden', description: 'Er is een fout opgetreden bij het opslaan.' });
      return false; // Indicate failure
    }
  };

  return (
    <>
      <Tabs defaultValue="list" value={activeTab} onValueChange={setActiveTab}>
        <div className="flex justify-between items-center mb-4">
            <div>
                <CardTitle>Mijn Percelen</CardTitle>
                <CardDescription>{loading ? 'Laden...' : `Totaal ${parcels.length} percelen in beheer.`}</CardDescription>
            </div>
            <div className="flex items-center gap-4">
               <TabsList>
                  <TabsTrigger value="list">Lijst</TabsTrigger>
                  <TabsTrigger value="map">Kaart</TabsTrigger>
                </TabsList>
                <Button onClick={handleAdd}>
                    <PlusCircle className="mr-2" />
                    Perceel Toevoegen
                </Button>
            </div>
        </div>

        <TabsContent value="list">
            <Card>
                <CardContent className="pt-6">
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Naam</TableHead>
                          <TableHead>Gewas</TableHead>
                          <TableHead>Ras</TableHead>
                          <TableHead className="text-right">Oppervlakte (ha)</TableHead>
                          <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loading ? (
                          Array.from({ length: 5 }).map((_, i) => (
                            <TableRow key={i}>
                              <TableCell colSpan={5}><Skeleton className="h-6 w-full" /></TableCell>
                            </TableRow>
                          ))
                        ) : parcels.length > 0 ? (
                          parcels.map((parcel) => (
                            <TableRow key={parcel.id}>
                              <TableCell className="font-medium">{parcel.name}</TableCell>
                              <TableCell>{parcel.crop}</TableCell>
                              <TableCell>{parcel.variety}</TableCell>
                              <TableCell className="text-right">{parcel.area?.toFixed(2) || '0.00'}</TableCell>
                              <TableCell>
                                <AlertDialog>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" className="h-8 w-8 p-0">
                                        <span className="sr-only">Open menu</span>
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => handleEdit(parcel)}>Aanpassen</DropdownMenuItem>
                                      <AlertDialogTrigger asChild>
                                        <DropdownMenuItem className="text-red-500">Verwijderen</DropdownMenuItem>
                                      </AlertDialogTrigger>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                   <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Weet je het zeker?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Deze actie kan niet ongedaan worden gemaakt. Dit zal het perceel permanent verwijderen.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Annuleren</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDelete(parcel.id)} className="bg-destructive hover:bg-destructive/90">Verwijderen</AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center h-24">
                              Geen percelen gevonden. Voeg je eerste perceel toe om te beginnen.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
            </Card>
        </TabsContent>
        <TabsContent value="map" forceMount={false} className="data-[state=inactive]:hidden">
             {activeTab === 'map' && <ParcelMapView parcels={parcels} />}
        </TabsContent>
      </Tabs>

      <ParcelFormDialog
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        parcel={editingParcel}
        onSubmit={handleFormSubmit}
      />
    </>
  );
}
