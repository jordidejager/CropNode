
"use client";

import React, { useEffect, useRef, useCallback, useState } from "react";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import L from "leaflet";
import "leaflet-draw";
import type { RvoParcel, RvoApiResponse } from "@/lib/types";
import { fetchRvoParcels } from "@/lib/rvo-api";
import { useDebounce } from "@/hooks/use-debounce";
import { RvoMapControls } from "./rvo-map-controls";
import { Loader2 } from "lucide-react";

const DEFAULT_CENTER: L.LatLngExpression = [52.1326, 5.2913];
const DEFAULT_ZOOM = 8;
const MIN_ZOOM_FOR_PARCELS = 14;

// PDOK Luchtfoto tile layer
const PDOK_LUCHTFOTO_URL =
  "https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg";

// Fix for default icon issue with Leaflet in React
if (typeof window !== "undefined") {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl:
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

interface RvoMapProps {
  onParcelSelect: (parcel: RvoParcel | null) => void;
  selectedParcel: RvoParcel | null;
  isDrawingEnabled?: boolean;
  onGeometryChange?: (geometry: any) => void;
  initialGeometry?: any;
}

export function RvoMap({
  onParcelSelect,
  selectedParcel,
  isDrawingEnabled = false,
  onGeometryChange,
  initialGeometry,
}: RvoMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const onParcelSelectRef = useRef(onParcelSelect);
  const selectedParcelRef = useRef(selectedParcel);

  const [bounds, setBounds] = useState<L.LatLngBounds | null>(null);
  const [parcels, setParcels] = useState<RvoParcel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);

  // Keep refs in sync with props
  useEffect(() => {
    onParcelSelectRef.current = onParcelSelect;
  }, [onParcelSelect]);

  useEffect(() => {
    selectedParcelRef.current = selectedParcel;
  }, [selectedParcel]);

  const debouncedBounds = useDebounce(bounds, 400);

  // Style functions
  const getStyle = useCallback(
    (feature?: GeoJSON.Feature): L.PathOptions => {
      const isSelected =
        feature && selectedParcel && feature.id === selectedParcel.id;
      return {
        color: isSelected ? "#22c55e" : "#3b82f6",
        weight: isSelected ? 3 : 2,
        fillColor: isSelected ? "#22c55e" : "#3b82f6",
        fillOpacity: isSelected ? 0.4 : 0.2,
      };
    },
    [selectedParcel]
  );

  // Initialize map
  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
      });
      mapRef.current = map;

      L.tileLayer(PDOK_LUCHTFOTO_URL, {
        attribution: "Luchtfoto &copy; PDOK",
        maxZoom: 19,
      }).addTo(map);

      // Add GeoJSON layer for RVO parcels
      const geoJsonLayer = L.geoJSON(undefined, {
        style: getStyle,
        onEachFeature: (feature, layer) => {
          if (!isDrawingEnabled) {
            layer.on({
              click: () => onParcelSelectRef.current(feature as unknown as RvoParcel),
              mouseover: (e) => e.target.setStyle({ fillOpacity: 0.4 }),
              mouseout: (e) => {
                const isSelected = selectedParcelRef.current && feature.id === selectedParcelRef.current.id;
                e.target.setStyle({ fillOpacity: isSelected ? 0.4 : 0.2 });
              },
            });
          }
        },
      });
      geoJsonLayer.addTo(map);
      geoJsonLayerRef.current = geoJsonLayer;

      // Setup for drawing if enabled
      if (isDrawingEnabled) {
        const drawnItems = new L.FeatureGroup();
        map.addLayer(drawnItems);
        drawnItemsRef.current = drawnItems;

        let initialBounds: L.LatLngBounds | null = null;
        if (initialGeometry) {
            const featureLayer = L.geoJSON(initialGeometry, {
                style: { color: 'hsl(var(--primary))', fillColor: 'hsl(var(--primary))', fillOpacity: 0.5 }
            });
            drawnItems.addLayer(featureLayer);
            initialBounds = featureLayer.getBounds();
        }

        if (initialBounds && initialBounds.isValid()) {
            map.fitBounds(initialBounds);
        }

        const drawControl = new L.Control.Draw({
            edit: { featureGroup: drawnItems, remove: true },
            draw: {
                polygon: { allowIntersection: false, shapeOptions: { color: 'hsl(var(--primary))' } },
                rectangle: false, circle: false, circlemarker: false, marker: false, polyline: false,
            }
        });
        map.addControl(drawControl);

        const handleGeometryChange = (layer: L.Layer) => {
          if (layer instanceof L.Polygon) {
            onGeometryChange?.(layer.toGeoJSON().geometry);
          }
        };

        map.on(L.Draw.Event.CREATED, (event: any) => {
            drawnItems.clearLayers();
            drawnItems.addLayer(event.layer);
            handleGeometryChange(event.layer);
        });
        
        map.on(L.Draw.Event.EDITED, (event: any) => {
            const layers = event.layers.getLayers();
            if (layers.length > 0) handleGeometryChange(layers[0]);
        });
        
        map.on(L.Draw.Event.DELETED, () => {
            onGeometryChange?.(null);
        });
      }


      const updateBounds = () => {
        setBounds(map.getBounds());
        setZoomLevel(map.getZoom());
      };

      map.on("moveend", updateBounds);
      map.on("zoomend", updateBounds);

      updateBounds();
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [isDrawingEnabled, initialGeometry, onGeometryChange, getStyle]);

  // Update GeoJSON layer when parcels or selection changes
  useEffect(() => {
    if (geoJsonLayerRef.current) {
      geoJsonLayerRef.current.clearLayers();
      if (parcels.length > 0) {
        geoJsonLayerRef.current.addData({
          type: "FeatureCollection",
          features: parcels,
        } as GeoJSON.FeatureCollection);
      }
      geoJsonLayerRef.current.setStyle(getStyle);
    }
  }, [parcels, selectedParcel, getStyle]);

  // Fetch parcels when bounds change
  useEffect(() => {
    if (!debouncedBounds || zoomLevel < MIN_ZOOM_FOR_PARCELS) {
      setParcels([]);
      return;
    }

    const fetchParcels = async () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      setIsLoading(true);
      setError(null);

      try {
        const sw = debouncedBounds.getSouthWest();
        const ne = debouncedBounds.getNorthEast();
        const bbox: [number, number, number, number] = [ sw.lng, sw.lat, ne.lng, ne.lat ];
        const response: RvoApiResponse = await fetchRvoParcels({
          bbox, limit: 100, signal: abortControllerRef.current.signal,
        });
        setParcels(response.features);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        console.error("Error fetching RVO parcels:", err);
        setError("Kan RVO percelen niet laden");
      } finally {
        setIsLoading(false);
      }
    };

    fetchParcels();
  }, [debouncedBounds, zoomLevel]);

  // Handle location navigation from search
  const handleLocationSelect = useCallback(
    (lat: number, lng: number) => {
      if (mapRef.current) {
        mapRef.current.setView([lat, lng], 16);
      }
    },
    []
  );

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainerRef} className="h-full w-full" />
      
      <div className="absolute top-4 left-4 right-4 z-[1000] pointer-events-none">
        <div className="pointer-events-auto max-w-md">
          <RvoMapControls onLocationSelect={handleLocationSelect} />
        </div>
      </div>

      {isLoading && (
        <div className="absolute bottom-4 left-4 z-[1000] bg-background/90 rounded-md px-3 py-2 flex items-center gap-2 shadow-md">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Percelen laden...</span>
        </div>
      )}

      {zoomLevel < MIN_ZOOM_FOR_PARCELS && !isDrawingEnabled && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-background/90 rounded-md px-4 py-2 shadow-md">
          <span className="text-sm text-muted-foreground">
            Zoom in om percelen te zien
          </span>
        </div>
      )}

      {error && (
        <div className="absolute bottom-4 left-4 z-[1000] bg-destructive/90 text-destructive-foreground rounded-md px-4 py-2 shadow-md">
          <span className="text-sm">{error}</span>
        </div>
      )}

      {parcels.length > 0 && !isLoading && !isDrawingEnabled && (
        <div className="absolute bottom-4 right-4 z-[1000] bg-background/90 rounded-md px-3 py-2 shadow-md">
          <span className="text-sm">{parcels.length} percelen gevonden</span>
        </div>
      )}
    </div>
  );
}
