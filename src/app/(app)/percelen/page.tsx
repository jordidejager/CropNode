"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useFirestore } from "@/firebase";
import { getParcels, addParcel, updateParcel, deleteParcel } from "@/lib/store";
import type { Parcel } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, PlusCircle, ChevronDown, ChevronRight } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ParcelFormDialog, type RvoData } from "@/components/parcel-form-dialog";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import L from 'leaflet';

// Fix for default icon issue with Leaflet in React
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
}

const MapView = ({ parcels, onParcelClick }: { parcels: Parcel[], onParcelClick: (data: RvoData) => void }) => {
    const mapRef = useRef<L.Map | null>(null);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const drawnItemsRef = useRef<L.FeatureGroup>(new L.FeatureGroup());
    const wmsLayerRef = useRef<L.TileLayer.WMS | null>(null);

    useEffect(() => {
        if (!mapContainerRef.current) return;
        if (mapRef.current) return; // Initialize map only once

        const map = L.map(mapContainerRef.current);
        mapRef.current = map;
        
        map.setView([52.1326, 5.2913], 8); // Center of NL

        L.tileLayer(
            "https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png",
            { attribution: 'Kaartgegevens &copy; <a href="https://www.pdok.nl/" target="_blank">PDOK</a>' }
        ).addTo(map);

        wmsLayerRef.current = L.tileLayer.wms('/pdok-wms', {
            layers: 'brpgewaspercelen',
            format: 'image/png',
            transparent: true,
            attribution: 'BRP Gewaspercelen &copy; RVO'
        }).addTo(map);

        map.addLayer(drawnItemsRef.current);

        map.on('click', async (e) => {
            if (!mapRef.current || !wmsLayerRef.current) return;
            const map = mapRef.current;
            const point = map.latLngToContainerPoint(e.latlng);
            const size = map.getSize();
            const bounds = map.getBounds();
            
            const params = {
                request: 'GetFeatureInfo',
                service: 'WMS',
                version: wmsLayerRef.current.wmsParams.version || '1.1.1',
                layers: wmsLayerRef.current.wmsParams.layers,
                styles: '',
                bbox: bounds.toBBoxString(),
                width: size.x,
                height: size.y,
                query_layers: wmsLayerRef.current.wmsParams.layers,
                info_format: 'application/json',
                srs: 'EPSG:4326',
                x: Math.round(point.x),
                y: Math.round(point.y),
            };

            const url = `/pdok-wms?${new URLSearchParams(params as any).toString()}`;
            
            try {
                const response = await fetch(url);
                const data = await response.json();

                if (data.features && data.features.length > 0) {
                    const feature = data.features[0];
                    const areaHectares = feature.properties.OPPERVLAKTE / 10000;
                    const location = L.GeoJSON.geometryToLayer(feature.geometry).getLatLngs()[0].map((ll: L.LatLng) => ({ lat: ll.lat, lng: ll.lng }));
                    
                    onParcelClick({
                        area: parseFloat(areaHectares.toFixed(4)),
                        location: location,
                    });
                }
            } catch (error) {
                console.error("Error fetching feature info:", error);
            }
        });

        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, [onParcelClick]);

    useEffect(() => {
        // Update user-drawn parcels on the map
        const drawnItems = drawnItemsRef.current;
        drawnItems.clearLayers();
        const parcelsWithLocation = parcels.filter(p => p.location && p.location.length > 0);

        if (parcelsWithLocation.length > 0) {
            parcelsWithLocation.forEach(parcel => {
                const polygon = L.polygon(parcel.location as L.LatLngExpression[], {
                    color: 'hsl(var(--destructive))',
                    fillColor: 'hsl(var(--destructive))',
                    fillOpacity: 0.4
                }).addTo(drawnItems);
                
                polygon.bindTooltip(`
                    <div class="text-center">
                        <p class="font-bold">${parcel.name}</p>
                        <p>${parcel.variety}</p>
                        <p>${parcel.area} ha</p>
                    </div>
                `);
            });
             const allLatLngs = parcelsWithLocation.flatMap(parcel => 
                (parcel.location as { lat: number; lng: number }[]).map(loc => [loc.lat, loc.lng])
            ) as L.LatLngExpression[];
            if (allLatLngs.length > 0 && mapRef.current) {
                const bounds = L.latLngBounds(allLatLngs);
                mapRef.current.fitBounds(bounds, { padding: [50, 50] });
            }
        }
    }, [parcels]);

    return (
        <div ref={mapContainerRef} style={{ height: '100%', width: '100%', cursor: 'pointer' }}></div>
    );
};


export default function PercelenPage() {
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingParcel, setEditingParcel] = useState<Parcel | null>(null);
  const [rvoData, setRvoData] = useState<RvoData | null>(null);
  const [activeTab, setActiveTab] = useState('list');
  
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
    setRvoData(null);
    setIsFormOpen(true);
  };
  
  const handleParcelClick = (data: RvoData) => {
    setRvoData(data);
    setEditingParcel(null);
    setIsFormOpen(true);
  };

  const handleEdit = (parcel: Parcel) => {
    setEditingParcel(parcel);
    setRvoData(null);
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
                        Klik op een perceel op de kaart om deze toe te voegen aan uw lijst. Uw eigen percelen worden in rood weergegeven.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-[600px] w-full rounded-md border overflow-hidden">
                       {activeTab === 'map' && <MapView parcels={parcels} onParcelClick={handleParcelClick} />}
                    </div>
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
      
      <ParcelFormDialog
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        parcel={editingParcel}
        rvoData={rvoData}
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
