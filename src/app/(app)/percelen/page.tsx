

"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useFirestore } from "@/firebase";
import { getParcels, addParcel, updateParcel, deleteParcel } from "@/lib/store";
import type { Parcel } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, PlusCircle, ChevronRight } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ParcelFormDialog, type RvoData } from "@/components/parcel-form-dialog";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import L from 'leaflet';
import ReactDOMServer from 'react-dom/server';
import area from '@turf/area';

// Fix for default icon issue with Leaflet in React
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
}

const WMS_LAYER_NAME = 'brpgewaspercelen:brpgewaspercelen_concept_2024';
const WFS_TYPE_NAME = 'brpgewaspercelen:BrpGewas';
const JAAR = 2024;


const MapView = ({ parcels, onParcelClick }: { parcels: Parcel[], onParcelClick: (data: RvoData) => void }) => {
    const mapRef = useRef<L.Map | null>(null);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const drawnItemsRef = useRef<L.FeatureGroup>(new L.FeatureGroup());
    const selectionLayerRef = useRef<L.GeoJSON | null>(null);

    useEffect(() => {
        if (!mapContainerRef.current || mapRef.current) return;

        const map = L.map(mapContainerRef.current).setView([51.488, 3.955], 13); // Center on Kapelle
        mapRef.current = map;
        
        L.tileLayer(
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            { attribution: '&copy; OpenStreetMap contributors' }
        ).addTo(map);

        L.tileLayer.wms('https://service.pdok.nl/rvo/brpgewaspercelen/wms/v1_0', {
            layers: WMS_LAYER_NAME,
            format: 'image/png',
            transparent: true,
            version: '1.1.0',
            attribution: `BRP Gewaspercelen &copy; RVO ${JAAR}`
        }).addTo(map);
        
        map.addLayer(drawnItemsRef.current);
        
        const popup = L.popup();

        const handleAddParcel = (rvoData: RvoData) => {
          onParcelClick(rvoData);
        }

        (window as any).handleAddParcel = handleAddParcel;
        
        map.on('click', (e: L.LeafletMouseEvent) => {
            const mapInstance = mapRef.current;
            if (!mapInstance) return;
            
            const lat = e.latlng.lat;
            const lng = e.latlng.lng;
            
            const wfsUrl = new URL('https://service.pdok.nl/rvo/brpgewaspercelen/wfs/v1_0');
            wfsUrl.search = new URLSearchParams({
                service: 'WFS',
                version: '2.0.0',
                request: 'GetFeature',
                typeName: WFS_TYPE_NAME,
                outputFormat: 'application/json',
                srsName: 'EPSG:4326',
                count: '1',
                cql_filter: `INTERSECTS(geometrie, POINT(${lng} ${lat})) AND jaar = ${JAAR}`
            }).toString();

            console.log('Fetching for:', lat, lng, 'URL:', wfsUrl.toString());

            popup.setLatLng(e.latlng).setContent("Data ophalen...").openOn(mapInstance);

            fetch(wfsUrl.toString())
                .then(response => {
                    if (!response.ok) {
                        return response.text().then(text => {
                             console.error(`Server responded with ${response.status}: ${text}`);
                             throw new Error(`Server responded with ${response.status}`);
                        });
                    }
                    return response.json();
                })
                .then(data => {
                    if (data.features && data.features.length > 0) {
                        const feature = data.features[0];
                        if (selectionLayerRef.current) {
                          mapInstance.removeLayer(selectionLayerRef.current);
                        }
                        selectionLayerRef.current = L.geoJSON(feature, {style: {color: 'hsl(var(--primary))', weight: 3, fillOpacity: 0.2, interactive: false }}).addTo(mapInstance);

                        const properties = feature.properties;
                        
                        const calculatedAreaM2 = area(feature);
                        const calculatedAreaHa = calculatedAreaM2 / 10000;

                        const gewasNaam = properties.gewas || properties.omschrijving_gewas || 'Onbekend';
                        
                        const displayArea = `${calculatedAreaHa.toFixed(4)} ha`;

                        const rvoDataForPopup: RvoData = {
                            area: calculatedAreaHa,
                            location: { lat: e.latlng.lat, lng: e.latlng.lng },
                            geometry: feature.geometry,
                            name: gewasNaam,
                        };
                        
                        const popupContent = `
                            <div class="p-1">
                                <p class="font-semibold text-base">${gewasNaam}</p>
                                <p class="text-sm">Oppervlakte: ${displayArea}</p>
                                <button onclick="window.handleAddParcel(${JSON.stringify(rvoDataForPopup).replace(/"/g, '&quot;')})" class="mt-2 w-full text-center px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90">
                                    Voeg perceel toe
                                </button>
                            </div>
                        `;

                        popup.setContent(popupContent);
                    } else {
                         popup.setContent("Geen landbouwperceel gevonden op deze locatie.");
                    }
                })
                .catch(error => {
                    console.error("Error fetching WFS data:", error);
                    popup.setContent(`Fout bij ophalen van data: ${error instanceof Error ? error.message : 'Onbekende fout'}`);
                });
        });

        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
            delete (window as any).handleAddParcel;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const drawnItems = drawnItemsRef.current;
        if (!drawnItems) return;
        drawnItems.clearLayers();
        const parcelsWithGeometry = parcels.filter(p => p.geometry);

        if (parcelsWithGeometry.length > 0) {
            parcelsWithGeometry.forEach(parcel => {
                const geoJsonLayer = L.geoJSON(parcel.geometry, {
                    style: {
                        color: 'hsl(var(--destructive))',
                        weight: 3,
                        fillOpacity: 0.1,
                        interactive: false 
                    }
                }).addTo(drawnItems);
                
                geoJsonLayer.bindTooltip(`
                    <div class="text-center">
                        <p class="font-bold">${parcel.name}</p>
                        <p>${parcel.variety}</p>
                        <p>${parcel.area} ha</p>
                    </div>
                `);
            });
             const allBounds = parcelsWithGeometry.map(parcel => L.geoJSON(parcel.geometry).getBounds());

             if (allBounds.length > 0 && mapRef.current && !selectionLayerRef.current) {
                try {
                    const groupBounds = allBounds.reduce((bounds, b) => bounds.extend(b), allBounds[0]);
                    mapRef.current.fitBounds(groupBounds, { padding: [50, 50] });
                } catch (e) {
                    console.error("Could not set bounds:", e);
                }
            }
        }
    }, [parcels]);

    return (
        <div ref={mapContainerRef} style={{ height: '100%', width: '100%', cursor: 'crosshair' }}></div>
    );
};


export default function PercelenPage() {
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingParcel, setEditingParcel] = useState<Parcel | null>(null);
  const [rvoData, setRvoData] = useState<RvoData | null>(null);
  const [activeTab, setActiveTab] = useState('list');
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
    // Debug fetch to check the schema
    fetch('https://service.pdok.nl/rvo/brpgewaspercelen/wfs/v1_0?request=DescribeFeatureType&service=WFS&version=2.0.0&typeName=brpgewaspercelen:BrpGewas')
      .then(response => response.text())
      .then(textResponse => {
        console.log('SCHEMA CHECK:', textResponse);
      })
      .catch(error => console.error('Error fetching schema:', error));
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
  
  const toggleOpen = (name: string) => {
    setOpenStates(prev => ({...prev, [name]: !prev[name]}));
  }


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

    

    




    

