'use client';

import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

import { MapContainer, TileLayer, Polygon, Tooltip } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import type { Parcel } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

interface ParcelMapViewProps {
    parcels: Parcel[];
}

// Center of the Netherlands
const mapCenter: LatLngExpression = [52.1326, 5.2913]; 

export function ParcelMapView({ parcels }: ParcelMapViewProps) {
    const parcelsWithLocation = parcels.filter(p => p.location && p.location.length > 0);

    return (
        <Card>
             <CardHeader>
                <CardTitle>Kaartoverzicht</CardTitle>
                <CardDescription>
                    {parcelsWithLocation.length} van de {parcels.length} percelen hebben een locatie en zijn zichtbaar op de kaart.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="h-[600px] w-full rounded-md border overflow-hidden">
                    <MapContainer center={mapCenter} zoom={8} style={{ height: '100%', width: '100%' }}>
                        <TileLayer
                            url="https://{s}.tile.openstreetmap.org/{z}/{y}.png"
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        />
                         <TileLayer
                            url='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                            attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                        />
                        {parcelsWithLocation.map(parcel => (
                            <Polygon 
                                key={parcel.id} 
                                positions={parcel.location as LatLngExpression[]}
                                pathOptions={{ color: 'hsl(var(--primary))', fillColor: 'hsl(var(--primary))', fillOpacity: 0.4 }}
                            >
                                <Tooltip>
                                    <div className="text-center">
                                        <p className="font-bold">{parcel.name}</p>
                                        <p>{parcel.variety}</p>
                                        <p>{parcel.area} ha</p>
                                    </div>
                                </Tooltip>
                            </Polygon>
                        ))}
                    </MapContainer>
                </div>
            </CardContent>
        </Card>
    );
}
