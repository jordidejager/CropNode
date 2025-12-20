"use client";

import { useEffect, useState, useRef } from "react";
import { useFirestore } from "@/firebase";
import { getParcels, addParcel, updateParcel, deleteParcel } from "@/lib/store";
import type { Parcel } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, PlusCircle, ChevronDown, ChevronRight } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ParcelFormDialog } from "@/components/parcel-form-dialog";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import L from 'leaflet';
import { cn } from "@/lib/utils";


// Fix for default icon issue with Leaflet in React
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
}

const MapView = ({ parcels }: { parcels: Parcel[] }) => {
    const mapRef = useRef<L.Map | null>(null);
    const mapContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!mapContainerRef.current) return;

        // Cleanup previous map instance if it exists
        if (mapRef.current) {
            mapRef.current.remove();
            mapRef.current = null;
        }

        // Initialize map
        const map = L.map(mapContainerRef.current);
        mapRef.current = map;

        L.tileLayer(
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            { attribution: "Tiles &copy; Esri" }
        ).addTo(map);

        const parcelsWithLocation = parcels.filter(p => p.location && p.location.length > 0);

        if (parcelsWithLocation.length > 0) {
            const allLatLngs = parcelsWithLocation.flatMap(parcel => 
                (parcel.location as { lat: number; lng: number }[]).map(loc => [loc.lat, loc.lng])
            ) as L.LatLngExpression[];

            if (allLatLngs.length > 0) {
                const bounds = L.latLngBounds(allLatLngs);
                map.fitBounds(bounds, { padding: [50, 50] });

                parcelsWithLocation.forEach(parcel => {
                    const polygon = L.polygon(parcel.location as L.LatLngExpression[], {
                        color: 'hsl(var(--primary))',
                        fillColor: 'hsl(var(--primary))',
                        fillOpacity: 0.4
                    }).addTo(map);
                    
                    polygon.bindTooltip(`
                        <div class="text-center">
                            <p class="font-bold">${parcel.name}</p>
                            <p>${parcel.variety}</p>
                            <p>${parcel.area} ha</p>
                        </div>
                    `);
                });
            }
        } else {
            // Default view if no parcels have locations
            map.setView([52.1326, 5.2913], 8);
        }

        // Cleanup function
        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };

    }, [parcels]);

    return (
        <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }}></div>
    );
};


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
  
  const groupedParcels = parcels.reduce((acc, parcel) => {
    (acc[parcel.name] = acc[parcel.name] || []).push(parcel);
    return acc;
  }, {} as Record<string, Parcel[]>);


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
                          Array.from({ length: 3 }).map((_, i) => (
                            <TableRow key={i}>
                              <TableCell colSpan={5}><Skeleton className="h-8 w-full" /></TableCell>
                            </TableRow>
                          ))
                        ) : Object.keys(groupedParcels).length > 0 ? (
                           Object.entries(groupedParcels).map(([name, subParcels]) => {
                                const totalArea = subParcels.reduce((sum, p) => sum + (p.area || 0), 0);
                                const isCollapsible = subParcels.length > 1;

                                if (!isCollapsible) {
                                    const parcel = subParcels[0];
                                    return (
                                        <TableRow key={parcel.id}>
                                            <TableCell className="font-medium">{parcel.name}</TableCell>
                                            <TableCell>{parcel.crop}</TableCell>
                                            <TableCell>{parcel.variety}</TableCell>
                                            <TableCell className="text-right">{parcel.area?.toFixed(2) || '0.00'}</TableCell>
                                            <TableCell>
                                                 <ActionsMenu parcel={parcel} onEdit={handleEdit} onDelete={handleDelete} />
                                            </TableCell>
                                        </TableRow>
                                    );
                                }

                                return (
                                    <Collapsible asChild key={name} defaultOpen={false}>
                                        <>
                                            <TableRow className="font-medium bg-muted/50">
                                                <TableCell>
                                                  <CollapsibleTrigger asChild>
                                                      <button className="flex items-center gap-2 w-full text-left">
                                                         <ChevronRight className="h-4 w-4 transition-transform data-[state=open]:rotate-90" />
                                                         {name}
                                                      </button>
                                                  </CollapsibleTrigger>
                                                </TableCell>
                                                <TableCell>{subParcels[0].crop}</TableCell>
                                                <TableCell>{subParcels.length} rassen</TableCell>
                                                <TableCell className="text-right">{totalArea.toFixed(2)}</TableCell>
                                                <TableCell></TableCell>
                                            </TableRow>
                                            <CollapsibleContent asChild>
                                                <>
                                                    {subParcels.map((parcel, index) => (
                                                        <TableRow key={parcel.id} className="bg-background hover:bg-muted/50">
                                                            <TableCell className="pl-12 text-muted-foreground"></TableCell>
                                                            <TableCell className="text-muted-foreground"></TableCell>
                                                            <TableCell className="text-muted-foreground">{parcel.variety}</TableCell>
                                                            <TableCell className="text-right text-muted-foreground">{parcel.area?.toFixed(2) || '0.00'}</TableCell>
                                                            <TableCell>
                                                                <ActionsMenu parcel={parcel} onEdit={handleEdit} onDelete={handleDelete} />
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </>
                                            </CollapsibleContent>
                                        </>
                                    </Collapsible>
                                );
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
        </TabsContent>
        <TabsContent value="map">
            <Card>
                <CardHeader>
                    <CardTitle>Kaartoverzicht</CardTitle>
                    <CardDescription>
                        {parcels.filter(p => p.location && p.location.length > 0).length} van de {parcels.length} percelen hebben een locatie en zijn zichtbaar.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-[600px] w-full rounded-md border overflow-hidden">
                       {activeTab === 'map' && <MapView parcels={parcels} />}
                    </div>
                </CardContent>
            </Card>
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
