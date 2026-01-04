
'use client';

import React, { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import type { Parcel } from '@/lib/types';
import L from 'leaflet';
import 'leaflet-draw';

const defaultCenter: L.LatLngExpression = [52.1326, 5.2913];

// Fix for default icon issue with Leaflet in React
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
}

interface ParcelDrawingMapProps {
  parcel?: Partial<Parcel> | null;
  onSave: (coordinates: { lat: number; lng: number }[]) => void;
}

export const ParcelDrawingMap: React.FC<ParcelDrawingMapProps> = ({ parcel, onSave }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);

  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current) {
        const map = L.map(mapContainerRef.current);
        mapRef.current = map;

        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri'
        }).addTo(map);

        const drawnItems = new L.FeatureGroup();
        map.addLayer(drawnItems);
        drawnItemsRef.current = drawnItems;
        
        let initialBounds: L.LatLngBounds | null = null;

        if (parcel?.geometry) {
            const featureLayer = L.geoJSON(parcel.geometry, {
                style: {
                    color: 'hsl(var(--primary))',
                    fillColor: 'hsl(var(--primary))',
                    fillOpacity: 0.5,
                }
            });
            drawnItems.addLayer(featureLayer);
            initialBounds = featureLayer.getBounds();
        }


        if (initialBounds && initialBounds.isValid()) {
            map.fitBounds(initialBounds);
        } else {
            map.setView(defaultCenter, 8);
        }


        const drawControl = new L.Control.Draw({
            edit: {
                featureGroup: drawnItems,
                remove: true,
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
            const latLngs = layer.getLatLngs()[0].map((latlng: L.LatLng) => ({ lat: latlng.lat, lng: latlng.lng }));
            onSave(latLngs);
        });
        
        map.on(L.Draw.Event.EDITED, (event: any) => {
            const layers = event.layers.getLayers();
            if (layers.length > 0) {
              const latLngs = layers[0].getLatLngs()[0].map((latlng: L.LatLng) => ({ lat: latlng.lat, lng: latlng.lng }));
              onSave(latLngs);
            }
        });
        
        map.on(L.Draw.Event.DELETED, () => {
            onSave([]);
        });
    }

    // Cleanup function to remove the map instance
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [parcel, onSave]);

  return <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }} />;
};
