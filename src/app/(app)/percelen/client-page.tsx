
"use client";

import { useEffect, useState, useCallback } from "react";
import { useFirestore } from "@/firebase";
import { getParcels, addParcel, updateParcel, deleteParcel } from "@/lib/store";
import type { Parcel } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, PlusCircle, ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ParcelFormDialog } from "@/components/parcel-form-dialog";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export function PercelenClientPage() {
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingParcel, setEditingParcel] = useState<Parcel | null>(null);
  const [openStates, setOpenStates] = useState<Record<string, boolean>>({});
  
  const db = useFirestore();
  const { toast } = useToast();

  const loadParcels = useCallback(async () => {
    if (!db) return;
    setLoading(true);
    const fetchedParcels = await getParcels(db);
    setParcels(fetchedParcels);
    setLoading(false);
  }, [db]);

  useEffect(() => {
    loadParcels();
  }, [loadParcels]);

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
        const { id, ...addData } = parcelData;
        await addParcel(db, addData);
        toast({ title: 'Succesvol toegevoegd', description: 'Het nieuwe perceel is opgeslagen.' });
      }
      await loadParcels();
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Fout opgetreden', description: 'Er is een fout opgetreden bij het opslaan.' });
    }
  };
  
  const groupedParcels = parcels.reduce((acc, parcel) => {
    (acc[parcel.name] = acc[parcel.name] || []).push(parcel);
    return acc;
  }, {} as Record<string, Parcel[]>);
  
  const toggleOpen = (name: string) => {
    setOpenStates(prev => ({...prev, [name]: !prev[name]}));
  }

  return (
    <>
      <Card>
          <CardHeader>
              <div className="flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">{loading ? 'Laden...' : `Totaal ${parcels.length} percelen in beheer.`}</p>
                  <Button onClick={handleAdd}>
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Perceel Toevoegen
                  </Button>
              </div>
          </CardHeader>
          <CardContent>
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
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={5}><Skeleton className="h-8 w-full" /></TableCell>
                      </TableRow>
                    ))
                  ) : Object.keys(groupedParcels).length > 0 ? (
                     Object.entries(groupedParcels).flatMap(([name, subParcels]) => {
                          const totalArea = subParcels.reduce((sum, p) => sum + (p.area || 0), 0);
                          const isCollapsible = subParcels.length > 1;

                          if (!isCollapsible) {
                              const parcel = subParcels[0];
                              return (
                                  <TableRow key={parcel.id}>
                                      <TableCell className="font-medium">{parcel.name}</TableCell>
                                      <TableCell>{parcel.crop}</TableCell>
                                      <TableCell>{parcel.variety}</TableCell>
                                      <TableCell className="text-right">{parcel.area?.toFixed(4) || '0.0000'}</TableCell>
                                      <TableCell>
                                           <ActionsMenu parcel={parcel} onEdit={handleEdit} onDelete={handleDelete} />
                                      </TableCell>
                                  </TableRow>
                              );
                          }
                          
                          const isOpen = openStates[name] || false;

                          const triggerRow = (
                              <TableRow key={`${name}-trigger`} onClick={() => toggleOpen(name)} className="font-medium bg-muted/50 cursor-pointer">
                                  <TableCell>
                                      <div className="flex items-center gap-2 w-full text-left">
                                           <ChevronRight className={cn("h-4 w-4 transition-transform", isOpen && "rotate-90")} />
                                           {name}
                                      </div>
                                  </TableCell>
                                  <TableCell>{subParcels[0].crop}</TableCell>
                                  <TableCell>{subParcels.length} rassen</TableCell>
                                  <TableCell className="text-right">{totalArea.toFixed(4)}</TableCell>
                                  <TableCell></TableCell>
                              </TableRow>
                          );

                          const contentRows = isOpen ? subParcels.map((parcel) => (
                              <TableRow key={parcel.id} className="bg-background hover:bg-muted/50">
                                  <TableCell className="pl-12 text-muted-foreground"></TableCell>
                                  <TableCell className="text-muted-foreground"></TableCell>
                                  <TableCell className="text-muted-foreground">{parcel.variety}</TableCell>
                                  <TableCell className="text-right text-muted-foreground">{parcel.area?.toFixed(4) || '0.0000'}</TableCell>
                                  <TableCell>
                                      <ActionsMenu parcel={parcel} onEdit={handleEdit} onDelete={handleDelete} />
                                  </TableCell>
                              </TableRow>
                          )) : [];

                          return [triggerRow, ...contentRows];
                     })
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
      
      <ParcelFormDialog
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        parcel={editingParcel}
        onSubmit={handleFormSubmit}
      />
    </>
  );
}


function ActionsMenu({ parcel, onEdit, onDelete }: { parcel: Parcel, onEdit: (p: Parcel) => void, onDelete: (id: string) => void }) {
  return (
    <AlertDialog>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(parcel)}>Aanpassen</DropdownMenuItem>
          <DropdownMenuItem onSelect={(e) => e.preventDefault()} asChild>
              <AlertDialogTrigger className="w-full text-red-500 relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50">Verwijderen</AlertDialogTrigger>
          </DropdownMenuItem>
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
            <AlertDialogAction onClick={() => onDelete(parcel.id)} className="bg-destructive hover:bg-destructive/90">Verwijderen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
  );
}
