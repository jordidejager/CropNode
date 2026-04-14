"use client";

import React, { useEffect, useRef, useCallback, useState } from "react";
import L from "leaflet";
import "leaflet-draw";
import type { RvoParcel, RvoApiResponse, Parcel } from "@/lib/types";
import { fetchRvoParcels, fetchRvoParcelAtLocation } from "@/lib/rvo-api";
import { RvoMapControls } from "./rvo-map-controls";
import { Loader2 } from "lucide-react";

// Style for user's own parcels (orange)
const USER_PARCEL_STYLE: L.PathOptions = {
  color: "#f97316",
  weight: 4,
  fillColor: "#f97316",
  fillOpacity: 0.3,
};

const APPEL_STYLE: L.PathOptions = {
  color: "#ef4444",
  weight: 4,
  fillColor: "#ef4444",
  fillOpacity: 0.3,
};

const PEER_STYLE: L.PathOptions = {
  color: "#22c55e",
  weight: 4,
  fillColor: "#22c55e",
  fillOpacity: 0.3,
};

const SELECTED_STYLE: L.PathOptions = {
  color: "#3b82f6",
  weight: 5,
  fillColor: "#3b82f6",
  fillOpacity: 0.5,
  dashArray: "5, 10"
};

const DEFAULT_CENTER: L.LatLngExpression = [52.1326, 5.2913];
const DEFAULT_ZOOM = 8;

const PDOK_LUCHTFOTO_URL =
  "https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg";

if (typeof window !== "undefined") {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

export type MapOverlayMode = 'standaard' | 'laatste_spray' | 'bodem_ph' | 'ziektedruk';
export type MapOverlayData = Record<string, { value: number | string | null; label?: string }>;

interface RvoMapProps {
  onParcelSelect: (parcel: RvoParcel | null) => void;
  selectedParcel: RvoParcel | null;
  selectedParcels?: RvoParcel[];
  onSelectionChange?: (parcels: RvoParcel[]) => void;
  selectionMode?: 'single' | 'multi';
  isDrawingEnabled?: boolean;
  onGeometryChange?: (geometry: any) => void;
  initialGeometry?: any;
  userParcels?: Parcel[];
  onUserParcelClick?: (parcel: Parcel) => void;
  overlayMode?: MapOverlayMode;
  overlayData?: MapOverlayData;
}

export function RvoMap({
  onParcelSelect,
  selectedParcel,
  selectedParcels = [],
  onSelectionChange,
  selectionMode = 'single',
  isDrawingEnabled = false,
  onGeometryChange,
  initialGeometry,
  userParcels = [],
  onUserParcelClick,
  overlayMode = 'standaard',
  overlayData = {},
}: RvoMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const userParcelsLayerRef = useRef<L.GeoJSON | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const drawControlRef = useRef<L.Control.Draw | null>(null);
  const mapClickHandlerRef = useRef<((e: L.LeafletMouseEvent) => void) | null>(null);

  const onParcelSelectRef = useRef(onParcelSelect);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onUserParcelClickRef = useRef(onUserParcelClick);
  const selectedParcelRef = useRef(selectedParcel);
  const selectedParcelsRef = useRef(selectedParcels);
  const selectionModeRef = useRef(selectionMode);
  const onGeometryChangeRef = useRef(onGeometryChange);
  const isDrawingEnabledRef = useRef(isDrawingEnabled);

  const [parcels, setParcels] = useState<RvoParcel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);

  useEffect(() => {
    onParcelSelectRef.current = onParcelSelect;
    onSelectionChangeRef.current = onSelectionChange;
    onUserParcelClickRef.current = onUserParcelClick;
    selectedParcelRef.current = selectedParcel;
    selectedParcelsRef.current = selectedParcels;
    selectionModeRef.current = selectionMode;
  }, [onParcelSelect, onSelectionChange, onUserParcelClick, selectedParcel, selectedParcels, selectionMode]);

  useEffect(() => {
    onGeometryChangeRef.current = onGeometryChange;
  }, [onGeometryChange]);

  useEffect(() => {
    isDrawingEnabledRef.current = isDrawingEnabled;
  }, [isDrawingEnabled]);

  const getStyle = useCallback(
    (feature?: GeoJSON.Feature): L.PathOptions => {
      const id = feature?.id;
      const isSelected = id && (
        (selectionModeRef.current === 'single' && selectedParcelRef.current?.id === id) ||
        (selectionModeRef.current === 'multi' && selectedParcelsRef.current.some(p => p.id === id))
      );

      return isSelected ? SELECTED_STYLE : {
        color: "#3b82f6",
        weight: 2,
        fillColor: "#3b82f6",
        fillOpacity: 0.2,
      };
    },
    []
  );

  // Initialize map ONCE (no isDrawingEnabled in deps)
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

      const geoJsonLayer = L.geoJSON(undefined, {
        style: getStyle,
        onEachFeature: (feature, layer) => {
          layer.on({
            click: (e) => {
              L.DomEvent.stopPropagation(e);
              const rvoParcel = feature as unknown as RvoParcel;

              if (selectionModeRef.current === 'multi') {
                const isAlreadySelected = selectedParcelsRef.current.some(p => p.id === rvoParcel.id);
                let newSelection: RvoParcel[];
                if (isAlreadySelected) {
                  newSelection = selectedParcelsRef.current.filter(p => p.id !== rvoParcel.id);
                } else {
                  newSelection = [...selectedParcelsRef.current, rvoParcel];
                }
                onSelectionChangeRef.current?.(newSelection);
              } else {
                onParcelSelectRef.current(rvoParcel);
              }
            },
            mouseover: (e) => e.target.setStyle({ fillOpacity: 0.4 }),
            mouseout: (e) => {
              const id = feature.id;
              const isSelected = id && (
                (selectionModeRef.current === 'single' && selectedParcelRef.current?.id === id) ||
                (selectionModeRef.current === 'multi' && selectedParcelsRef.current.some(p => p.id === id))
              );
              e.target.setStyle({ fillOpacity: isSelected ? 0.5 : 0.2 });
            },
          });
        },
      });
      geoJsonLayer.addTo(map);
      geoJsonLayerRef.current = geoJsonLayer;

      const userParcelsLayer = L.geoJSON(undefined, {
        style: (feature) => {
          const crop = feature?.properties?.crop?.toLowerCase();
          if (crop === 'appel') return APPEL_STYLE;
          if (crop === 'peer') return PEER_STYLE;
          return USER_PARCEL_STYLE;
        },
        onEachFeature: (feature, layer) => {
          layer.on({
            click: (e) => {
              L.DomEvent.stopPropagation(e);
              const originalParcel = userParcels.find(p => p.id === feature.properties.id);
              if (originalParcel && onUserParcelClickRef.current) {
                onUserParcelClickRef.current(originalParcel);
              }
            }
          });

          if (feature.properties?.name) {
            const label = `
              <div class="flex flex-col items-center pointer-events-none">
                <span class="bg-black/60 backdrop-blur-md text-white border border-white/20 px-2 py-0.5 rounded-full text-[10px] font-black uppercase shadow-xl">
                  ${feature.properties.name}
                </span>
                ${feature.properties.variety ? `
                  <span class="text-[8px] text-white/70 font-bold drop-shadow-md">
                    ${feature.properties.variety}
                  </span>
                ` : ''}
              </div>
            `;
            layer.bindTooltip(label, {
              permanent: true,
              direction: 'center',
              className: 'parcel-label-wrapper',
              opacity: 0.9
            });
          }
        },
      });
      userParcelsLayer.addTo(map);
      userParcelsLayerRef.current = userParcelsLayer;

      // Prepare drawn items layer (always present, draw control added/removed dynamically)
      const drawnItems = new L.FeatureGroup();
      map.addLayer(drawnItems);
      drawnItemsRef.current = drawnItems;

      const updateBounds = () => {
        setZoomLevel(map.getZoom());
      };

      map.on("moveend", updateBounds);
      map.on("zoomend", updateBounds);

      // Map click handler for RVO parcel lookup (will be disabled during drawing)
      const clickHandler = async (e: L.LeafletMouseEvent) => {
        // Skip if drawing mode is active
        if (isDrawingEnabledRef.current) return;

        setIsLoading(true);
        setError(null);
        try {
          const parcel = await fetchRvoParcelAtLocation(e.latlng.lat, e.latlng.lng);
          if (parcel) {
            setParcels(prev => {
              if (prev.some(p => p.id === parcel.id)) return prev;
              return [...prev, parcel];
            });

            if (selectionModeRef.current === 'multi') {
              const isAlreadySelected = selectedParcelsRef.current.some(p => p.id === parcel.id);
              if (!isAlreadySelected) {
                onSelectionChangeRef.current?.([...selectedParcelsRef.current, parcel]);
              }
            } else {
              onParcelSelectRef.current(parcel);
            }
          }
        } catch (err) {
          console.error("Error fetching parcel at location:", err);
        } finally {
          setIsLoading(false);
        }
      };

      map.on('click', clickHandler);
      mapClickHandlerRef.current = clickHandler;

      updateBounds();
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getStyle]);

  // Dynamic draw control: add/remove based on isDrawingEnabled
  useEffect(() => {
    const map = mapRef.current;
    const drawnItems = drawnItemsRef.current;
    if (!map || !drawnItems) return;

    if (isDrawingEnabled) {
      // Load initial geometry if provided
      if (initialGeometry) {
        drawnItems.clearLayers();
        const featureLayer = L.geoJSON(initialGeometry, {
          style: { color: 'hsl(var(--primary))', fillColor: 'hsl(var(--primary))', fillOpacity: 0.5 }
        });
        drawnItems.addLayer(featureLayer);
        const bounds = featureLayer.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds);
        }
      }

      // Add draw control
      const drawControl = new L.Control.Draw({
        edit: { featureGroup: drawnItems, remove: true },
        draw: {
          polygon: {
            allowIntersection: false,
            shapeOptions: { color: 'hsl(var(--primary))', fillColor: 'hsl(var(--primary))', fillOpacity: 0.4 },
          },
          rectangle: false,
          circle: false,
          circlemarker: false,
          marker: false,
          polyline: false,
        }
      });
      map.addControl(drawControl);
      drawControlRef.current = drawControl;

      const handleGeometryChange = (layer: L.Layer) => {
        if (layer instanceof L.Polygon) {
          onGeometryChangeRef.current?.(layer.toGeoJSON().geometry);
        }
      };

      const onCreated = (event: any) => {
        drawnItems.clearLayers();
        drawnItems.addLayer(event.layer);
        handleGeometryChange(event.layer);
      };

      const onEdited = (event: any) => {
        const layers = event.layers.getLayers();
        if (layers.length > 0) handleGeometryChange(layers[0]);
      };

      const onDeleted = () => {
        onGeometryChangeRef.current?.(null);
      };

      map.on(L.Draw.Event.CREATED, onCreated);
      map.on(L.Draw.Event.EDITED, onEdited);
      map.on(L.Draw.Event.DELETED, onDeleted);

      return () => {
        map.off(L.Draw.Event.CREATED, onCreated);
        map.off(L.Draw.Event.EDITED, onEdited);
        map.off(L.Draw.Event.DELETED, onDeleted);
        map.removeControl(drawControl);
        drawControlRef.current = null;
      };
    } else {
      // Clean up drawn items when leaving draw mode
      drawnItems.clearLayers();
      if (drawControlRef.current) {
        map.removeControl(drawControlRef.current);
        drawControlRef.current = null;
      }
    }
  }, [isDrawingEnabled, initialGeometry]);

  // Update drawn geometry when initialGeometry changes (for editing existing parcels)
  useEffect(() => {
    if (isDrawingEnabled && drawnItemsRef.current && mapRef.current) {
      drawnItemsRef.current.clearLayers();
      if (initialGeometry) {
        const featureLayer = L.geoJSON(initialGeometry, {
          style: { color: 'hsl(var(--primary))', fillColor: 'hsl(var(--primary))', fillOpacity: 0.5 }
        });
        drawnItemsRef.current.addLayer(featureLayer);
        const bounds = featureLayer.getBounds();
        if (bounds.isValid()) {
          mapRef.current.fitBounds(bounds);
        }
      }
    }
  }, [initialGeometry, isDrawingEnabled]);

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
  }, [parcels, selectedParcel, selectedParcels, getStyle]);

  useEffect(() => {
    if (userParcelsLayerRef.current && mapRef.current) {
      userParcelsLayerRef.current.clearLayers();

      // Validate that geometry is a valid GeoJSON geometry (has type and coordinates)
      const isValidGeometry = (geom: unknown): geom is GeoJSON.Geometry => {
        if (!geom || typeof geom !== 'object') return false;
        const g = geom as Record<string, unknown>;
        return typeof g.type === 'string' && Array.isArray(g.coordinates);
      };

      const features = userParcels
        .filter(p => isValidGeometry(p.geometry))
        .map(p => {
          const primarySub = p.subParcels?.[0];
          const overlay = overlayData[p.id];
          return {
            type: "Feature" as const,
            properties: {
              id: p.id,
              name: p.name,
              crop: primarySub?.crop || (p as any).crop,
              variety: primarySub?.variety || (p as any).variety,
              overlayValue: overlay?.value ?? null,
              overlayLabel: overlay?.label ?? null,
            },
            geometry: p.geometry,
          };
        });

      // Update style based on overlay mode
      userParcelsLayerRef.current.options.style = (feature: any) => {
        if (overlayMode === 'standaard') {
          const crop = feature?.properties?.crop?.toLowerCase();
          if (crop === 'appel') return APPEL_STYLE;
          if (crop === 'peer') return PEER_STYLE;
          return USER_PARCEL_STYLE;
        }
        // Overlay mode: color by value
        const val = feature?.properties?.overlayValue;
        if (val == null) return { ...USER_PARCEL_STYLE, fillColor: '#6b7280', color: '#6b7280', fillOpacity: 0.2 }; // gray for no data

        if (overlayMode === 'laatste_spray') {
          // Days since last spray: green=recent, red=long ago
          const days = typeof val === 'number' ? val : 999;
          if (days <= 7) return { ...USER_PARCEL_STYLE, fillColor: '#22c55e', color: '#22c55e', fillOpacity: 0.5 };
          if (days <= 14) return { ...USER_PARCEL_STYLE, fillColor: '#eab308', color: '#eab308', fillOpacity: 0.4 };
          if (days <= 30) return { ...USER_PARCEL_STYLE, fillColor: '#f97316', color: '#f97316', fillOpacity: 0.4 };
          return { ...USER_PARCEL_STYLE, fillColor: '#ef4444', color: '#ef4444', fillOpacity: 0.4 };
        }
        if (overlayMode === 'bodem_ph') {
          const ph = typeof val === 'number' ? val : 0;
          if (ph >= 5.5 && ph <= 6.5) return { ...USER_PARCEL_STYLE, fillColor: '#22c55e', color: '#22c55e', fillOpacity: 0.5 };
          if (ph >= 5.0 && ph <= 7.0) return { ...USER_PARCEL_STYLE, fillColor: '#eab308', color: '#eab308', fillOpacity: 0.4 };
          return { ...USER_PARCEL_STYLE, fillColor: '#ef4444', color: '#ef4444', fillOpacity: 0.4 };
        }
        if (overlayMode === 'ziektedruk') {
          const level = String(val);
          if (level === 'geen' || level === 'laag') return { ...USER_PARCEL_STYLE, fillColor: '#22c55e', color: '#22c55e', fillOpacity: 0.5 };
          if (level === 'gemiddeld') return { ...USER_PARCEL_STYLE, fillColor: '#eab308', color: '#eab308', fillOpacity: 0.4 };
          return { ...USER_PARCEL_STYLE, fillColor: '#ef4444', color: '#ef4444', fillOpacity: 0.5 };
        }
        return USER_PARCEL_STYLE;
      };

      if (features.length > 0) {
        userParcelsLayerRef.current.addData({
          type: "FeatureCollection",
          features,
        } as GeoJSON.FeatureCollection);

        const bounds = userParcelsLayerRef.current.getBounds();
        if (bounds.isValid() && zoomLevel === DEFAULT_ZOOM) {
          mapRef.current.fitBounds(bounds, { padding: [50, 50] });
        }
      }
    }
  }, [userParcels, zoomLevel, overlayMode, overlayData]);

  const handleLocationSelect = useCallback(
    (lat: number, lng: number) => {
      if (mapRef.current) {
        mapRef.current.setView([lat, lng], 16);
      }
    },
    []
  );

  return (
    <div className="relative h-full w-full z-0">
      <div ref={mapContainerRef} className="h-full w-full [&_.leaflet-pane]:z-auto [&_.leaflet-control]:z-auto" />
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
      {error && (
        <div className="absolute bottom-4 left-4 z-[1000] bg-destructive/90 text-destructive-foreground rounded-md px-4 py-2 shadow-md">
          <span className="text-sm">{error}</span>
        </div>
      )}
    </div>
  );
}
