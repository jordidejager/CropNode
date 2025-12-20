'use client';

import React, { useEffect, useRef } from 'react';
import type { LatLngExpression, Map, Polygon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import type { Parcel } from '@/lib/types';

const mapCenter: LatLngExpression = [52.1326, 5.2913];

interface ParcelDrawingMapProps {
  parcel?: Parcel | null;
  onSave: (coordinates: { lat: number; lng: number }[]) => void;
}

export const ParcelDrawingMap: React.FC<ParcelDrawingMapProps> = ({ parcel, onSave }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);

  useEffect(() => {
    const L = require('leaflet');
    require('leaflet-draw');
    
    if (mapContainerRef.current && !mapRef.current) {
        const map = L.map(mapContainerRef.current).setView(mapCenter, 8);
        mapRef.current = map;

        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
        }).addTo(map);

        const drawnItems = new L.FeatureGroup();
        map.addLayer(drawnItems);
        
        if (parcel?.location && parcel.location.length > 0) {
            const latLngs = parcel.location.map(loc => [loc.lat, loc.lng]) as LatLngExpression[];
            const polygon: Polygon = L.polygon(latLngs, {
                color: 'hsl(var(--primary))',
                fillColor: 'hsl(var(--primary))',
                fillOpacity: 0.5,
            });
            drawnItems.addLayer(polygon);
            map.fitBounds(polygon.getBounds());
        }

        const drawControl = new L.Control.Draw({
            edit: {
                featureGroup: drawnItems
            },
            draw: {
                polygon: {
                    allowIntersection: false,
                    shapeOptions: {
                        color: 'hsl(var(--primary))'
                    }
                },
                rectangle: false,
                circle: false,
                circlemarker: false,
                marker: false,
                polyline: false,
            }
        });
        map.addControl(drawControl);

        map.on(L.Draw.Event.CREATED, (event: any) => {
            const layer = event.layer;
            drawnItems.clearLayers();
            drawnItems.addLayer(layer);
            onSave(layer.getLatLngs()[0]);
        });
        
        map.on(L.Draw.Event.EDITED, (event: any) => {
            const layers = event.layers.getLayers();
            if (layers.length > 0) {
              onSave(layers[0].getLatLngs()[0]);
            }
        });
        
        map.on(L.Draw.Event.DELETED, () => {
            onSave([]);
        });
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [parcel, onSave]);

  return <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }} />;
};
