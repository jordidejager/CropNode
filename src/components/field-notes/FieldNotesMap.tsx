'use client';

import { useRef, useEffect, useCallback } from 'react';
import type { FieldNote } from '@/hooks/use-field-notes';

// Tag → circleMarker color
const TAG_COLORS: Record<string, string> = {
  bespuiting: '#378ADD',
  bemesting: '#10b981',
  taak: '#EF9F27',
  waarneming: '#7F77DD',
  overig: '#888780',
};

const TAG_LABELS: Record<string, string> = {
  bespuiting: 'Bespuiting',
  bemesting: 'Bemesting',
  taak: 'Taak',
  waarneming: 'Waarneming',
  overig: 'Overig',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Zojuist';
  if (diffMin < 60) return `${diffMin} min geleden`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}u geleden`;
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

interface FieldNotesMapProps {
  notes: FieldNote[];
  onNoteClick?: (note: FieldNote) => void;
  onViewInList?: (noteId: string) => void;
}

export function FieldNotesMap({ notes, onNoteClick, onViewInList }: FieldNotesMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);
  const readyRef = useRef(false);

  // Only notes with GPS
  const geoNotes = notes.filter(n => n.latitude != null && n.longitude != null);

  // Stable refs for callbacks (avoid stale closures)
  const onNoteClickRef = useRef(onNoteClick);
  onNoteClickRef.current = onNoteClick;
  const onViewInListRef = useRef(onViewInList);
  onViewInListRef.current = onViewInList;

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const L = require('leaflet') as typeof import('leaflet');

    const map = L.map(containerRef.current, {
      center: [52.13, 5.29],
      zoom: 8,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer(
      'https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg',
      { maxZoom: 19 }
    ).addTo(map);

    mapRef.current = map;
    readyRef.current = true;

    return () => {
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
  }, []);

  // Render markers — runs when notes change OR map becomes ready
  const renderMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;

    const L = require('leaflet') as typeof import('leaflet');

    // Clear existing
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    if (geoNotes.length === 0) return;

    const bounds = L.latLngBounds([]);

    for (const note of geoNotes) {
      const lat = note.latitude!;
      const lng = note.longitude!;
      const color = TAG_COLORS[note.auto_tag ?? 'overig'] ?? TAG_COLORS.overig;
      const tagLabel = TAG_LABELS[note.auto_tag ?? 'overig'] ?? 'Overig';

      const marker = L.circleMarker([lat, lng], {
        radius: 10,
        fillColor: color,
        fillOpacity: 0.9,
        color: '#ffffff',
        weight: 2.5,
        opacity: 0.9,
      }).addTo(map);

      // Tooltip on hover
      const tooltipText = note.content.length > 60
        ? note.content.slice(0, 60) + '...'
        : note.content;
      marker.bindTooltip(
        `<div style="max-width:200px;font-size:12px;line-height:1.3">
          <div style="color:rgba(255,255,255,0.9)">${tooltipText}</div>
          <div style="color:rgba(255,255,255,0.4);font-size:10px;margin-top:2px">${tagLabel} · ${formatTime(note.created_at)}</div>
        </div>`,
        { direction: 'top', offset: [0, -12], className: 'field-note-tooltip' }
      );

      // Popup on click — with "Bekijk in lijst" link
      const photoHtml = note.photo_url
        ? `<img src="${note.photo_url}" style="width:100%;max-height:120px;object-fit:cover;border-radius:8px;margin-bottom:6px" loading="lazy" />`
        : '';
      const contentText = note.content.length > 80
        ? note.content.slice(0, 80) + '...'
        : note.content;
      const parcels = (note.sub_parcels ?? [])
        .slice(0, 3)
        .map(sp => sp.parcel_name || sp.name)
        .join(', ');
      const parcelHtml = parcels
        ? `<div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:3px">📍 ${parcels}</div>`
        : '';
      const obsHtml = note.observation_subject
        ? `<div style="font-size:10px;color:${color};margin-top:2px">${note.observation_subject}</div>`
        : '';
      const sourceIcon = note.source === 'whatsapp'
        ? '<span style="font-size:8px;margin-left:4px;background:#25D366;color:white;padding:1px 4px;border-radius:4px;font-weight:600">WA</span>'
        : '';

      const popupContent = `<div style="max-width:220px;font-size:12px;line-height:1.4" class="fn-popup-inner">
        ${photoHtml}
        <div style="color:rgba(255,255,255,0.85)">${contentText}</div>
        <div style="display:flex;gap:4px;align-items:center;margin-top:4px;flex-wrap:wrap">
          <span style="background:${color};color:white;font-size:9px;padding:1px 6px;border-radius:99px;font-weight:500">${tagLabel}</span>
          <span style="font-size:10px;color:rgba(255,255,255,0.3)">${formatTime(note.created_at)}${sourceIcon}</span>
        </div>
        ${parcelHtml}
        ${obsHtml}
        <div style="margin-top:6px;border-top:1px solid rgba(255,255,255,0.08);padding-top:6px">
          <a href="#" data-note-id="${note.id}" class="fn-view-in-list" style="font-size:11px;color:#10b981;text-decoration:none;font-weight:500">Bekijk in lijst →</a>
        </div>
      </div>`;

      // Wrap popup content with inline dark styles (styled-jsx can be unreliable)
      const styledContent = `<div style="background:rgba(24,24,27,0.97);color:white;border-radius:10px;padding:10px;margin:-12px;max-width:220px;font-size:12px;line-height:1.4">${photoHtml}<div style="color:rgba(255,255,255,0.85)">${contentText}</div><div style="display:flex;gap:4px;align-items:center;margin-top:4px;flex-wrap:wrap"><span style="background:${color};color:white;font-size:9px;padding:1px 6px;border-radius:99px;font-weight:500">${tagLabel}</span><span style="font-size:10px;color:rgba(255,255,255,0.3)">${formatTime(note.created_at)}${sourceIcon}</span></div>${parcelHtml}${obsHtml}<div style="margin-top:6px;border-top:1px solid rgba(255,255,255,0.08);padding-top:6px"><a href="#" data-note-id="${note.id}" class="fn-view-in-list" style="font-size:11px;color:#10b981;text-decoration:none;font-weight:500">Bekijk in lijst →</a></div></div>`;

      const popup = L.popup({
        className: 'field-note-popup',
        maxWidth: 260,
        closeButton: true,
      }).setContent(styledContent);

      marker.bindPopup(popup);

      // Handle "Bekijk in lijst" click via event delegation
      marker.on('popupopen', () => {
        setTimeout(() => {
          const link = document.querySelector(`.fn-view-in-list[data-note-id="${note.id}"]`);
          if (link) {
            link.addEventListener('click', (e) => {
              e.preventDefault();
              onViewInListRef.current?.(note.id);
            });
          }
        }, 50);
      });

      bounds.extend([lat, lng]);
      markersRef.current.push(marker);
    }

    // Fit bounds
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }, [geoNotes]);

  // Re-render markers when notes change
  useEffect(() => {
    renderMarkers();
  }, [renderMarkers]);

  // Also render after a short delay to handle the case where map init finishes after first render
  useEffect(() => {
    const timer = setTimeout(() => renderMarkers(), 200);
    return () => clearTimeout(timer);
  }, [renderMarkers]);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="h-[500px] md:h-[600px] rounded-2xl overflow-hidden border border-white/[0.06]"
      />
      <style jsx global>{`
        .leaflet-popup-pane {
          z-index: 800 !important;
        }
        .leaflet-popup {
          z-index: 800 !important;
        }
        .field-note-tooltip {
          background: rgba(24, 24, 27, 0.95) !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          border-radius: 10px !important;
          padding: 8px 12px !important;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4) !important;
        }
        .field-note-tooltip::before {
          border-top-color: rgba(24, 24, 27, 0.95) !important;
        }
        .field-note-popup .leaflet-popup-content-wrapper {
          background: rgba(24, 24, 27, 0.95) !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          border-radius: 12px !important;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5) !important;
          padding: 0 !important;
        }
        .field-note-popup .leaflet-popup-content {
          margin: 12px !important;
        }
        .field-note-popup .leaflet-popup-tip {
          background: rgba(24, 24, 27, 0.95) !important;
        }
        .field-note-popup .leaflet-popup-close-button {
          color: rgba(255, 255, 255, 0.4) !important;
          top: 6px !important;
          right: 8px !important;
        }
        .field-note-popup .leaflet-popup-close-button:hover {
          color: rgba(255, 255, 255, 0.8) !important;
        }
        .fn-view-in-list:hover {
          text-decoration: underline !important;
        }
      `}</style>
    </div>
  );
}
