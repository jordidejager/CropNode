'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ---- Types ----

export interface PhysicalStation {
  id: string;
  device_id: string;
  dev_eui: string;
  application_id: string;
  label: string | null;
  hardware_model: string | null;
  firmware_version: string | null;
  parcel_id: string | null;
  latitude: number | null;
  longitude: number | null;
  elevation_m: number | null;
  active: boolean;
  installed_at: string | null;
  last_seen_at: string | null;
  last_frame_counter: number | null;
  created_at: string;
  updated_at: string;
  parcels?: { id: string; name: string } | null;
}

export interface Measurement {
  id: number;
  measured_at: string;
  frame_counter: number;
  temperature_c: number | null;
  humidity_pct: number | null;
  pressure_hpa: number | null;
  illuminance_lux: number | null;
  rain_counter: number | null;
  rainfall_mm: number | null;
  dew_point_c: number | null;
  wet_bulb_c: number | null;
  battery_v: number | null;
  battery_status: 'good' | 'low' | 'critical' | null;
  rssi_dbm: number | null;
  snr_db: number | null;
  gateway_count: number | null;
}

// ---- Queries ----

export function usePhysicalStations() {
  return useQuery({
    queryKey: ['physical-stations'],
    queryFn: async (): Promise<PhysicalStation[]> => {
      const res = await fetch('/api/physical-stations');
      if (!res.ok) throw new Error('Stations ophalen mislukt');
      const json = await res.json();
      return json.data as PhysicalStation[];
    },
    staleTime: 60 * 1000,
  });
}

export function useStationMeasurements(
  stationId: string | null,
  range: '24h' | '7d' | '30d' | '90d' = '7d'
) {
  return useQuery({
    queryKey: ['physical-stations', stationId, 'measurements', range],
    queryFn: async (): Promise<Measurement[]> => {
      const res = await fetch(
        `/api/physical-stations/${stationId}/measurements?range=${range}`
      );
      if (!res.ok) throw new Error('Metingen ophalen mislukt');
      const json = await res.json();
      return json.data as Measurement[];
    },
    enabled: !!stationId,
    // Stations push every 20 minutes — refresh every 2 minutes to keep fresh
    refetchInterval: 2 * 60 * 1000,
    staleTime: 60 * 1000,
  });
}

// ---- Mutations ----

export interface RegisterStationPayload {
  deviceId: string;
  devEui: string;
  applicationId: string;
  label?: string;
  parcelId?: string | null;
  hardwareModel?: string;
  firmwareVersion?: string;
}

export function useRegisterStation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: RegisterStationPayload): Promise<PhysicalStation> => {
      const res = await fetch('/api/physical-stations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Registreren mislukt');
      }
      const json = await res.json();
      return json.data as PhysicalStation;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['physical-stations'] });
    },
  });
}

export interface UpdateStationPayload {
  label?: string | null;
  parcelId?: string | null;
  active?: boolean;
  firmwareVersion?: string | null;
}

export function useUpdateStation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: UpdateStationPayload;
    }): Promise<PhysicalStation> => {
      const res = await fetch(`/api/physical-stations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Bijwerken mislukt');
      }
      const json = await res.json();
      return json.data as PhysicalStation;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['physical-stations'] });
    },
  });
}

export function useDeleteStation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/physical-stations/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Verwijderen mislukt');
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['physical-stations'] });
    },
  });
}
