'use client';

import React, { useState, useRef } from 'react';
import { MapContainer, TileLayer, FeatureGroup, useMap } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import type { LatLngExpression } from 'leaflet';
import type { Parcel } from '@/lib/types';

// Center of the Netherlands
const mapCenter: LatLngExpression = [52.1326, 5.2913];

interface ParcelDrawingMapProps {
  parcel?: Parcel | null;
  onSave: (coordinates: { lat: number; lng: number }[]) => void;
}

const DrawnShapeHandler = ({ onSave, initialLayer }: { onSave: (coords: any) => void; initialLayer: any }) => {
  const map = useMap();
  const layerRef = useRef<any>(null);

  React.useEffect(() => {
    if (initialLayer) {
        // A little hacky, but leaflet-draw doesn't expose a clean API for this
        // We add the layer to the feature group so it can be edited.
        setTimeout(() => {
            if (layerRef.current) {
                const layer = layerRef.current.leafletElement;
                if(layer){
                    layer.addLayer(initialLayer);
                    map.fitBounds(initialLayer.getBounds());
                }
            }
        }, 100);
    }
  }, [initialLayer, map]);

  const handleCreated = (e: any) => {
    onSave(e.layer.getLatLngs()[0]);
  };

  const handleEdited = (e: any) => {
    const layers = e.layers.getLayers();
    if (layers.length > 0) {
      onSave(layers[0].getLatLngs()[0]);
    }
  };

  const handleDeleted = () => {
    onSave([]);
  };

  return (
    <FeatureGroup ref={layerRef}>
      <EditControl
        position="topright"
        onCreated={handleCreated}
        onEdited={handleEdited}
        onDeleted={handleDeleted}
        draw={{
          rectangle: false,
          circle: false,
          circlemarker: false,
          marker: false,
          polyline: false,
          polygon: {
            allowIntersection: false,
            shapeOptions: {
              color: 'hsl(var(--primary))',
              fillColor: 'hsl(var(--primary))',
              fillOpacity: 0.5,
            },
          },
        }}
      />
    </FeatureGroup>
  );
};


export const ParcelDrawingMap: React.FC<ParcelDrawingMapProps> = ({ parcel, onSave }) => {
  const L = require('leaflet'); // Import dynamically on client

  const initialShapeLayer = React.useMemo(() => {
    if (parcel?.location && parcel.location.length > 0) {
      const latLngs = parcel.location.map(loc => [loc.lat, loc.lng]);
      return L.polygon(latLngs, {
          color: 'hsl(var(--primary))',
          fillColor: 'hsl(var(--primary))',
          fillOpacity: 0.5,
      });
    }
    return null;
  }, [parcel, L]);

  return (
    <MapContainer center={mapCenter} zoom={8} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <TileLayer
        url='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      />
      <DrawnShapeHandler onSave={onSave} initialLayer={initialShapeLayer} />
    </MapContainer>
  );
};
