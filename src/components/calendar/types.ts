import {
  Droplets,
  Apple,
  Users,
  AlertTriangle,
  Flower2,
  CloudLightning,
  StickyNote,
} from 'lucide-react';

// ============================================================================
// Calendar Event Types
// ============================================================================

export type CalendarEventType =
  | 'spray'
  | 'harvest'
  | 'task'
  | 'disease'
  | 'phenology'
  | 'weather_alert'
  | 'field_note';

export type CalendarEvent = {
  id: string;
  type: CalendarEventType;
  title: string;
  subtitle?: string;
  date: string; // ISO date string (YYYY-MM-DD)
  endDate?: string; // ISO date string for multi-day events (tasks)
  parcelIds: string[];
  parcelNames: string[];
  color: string; // hex color
  severity?: 'low' | 'medium' | 'high';
  status?: string;
  metadata: Record<string, unknown>;
};

export type CalendarView = 'month' | 'week' | 'day';

export type CalendarFilters = {
  types: Set<CalendarEventType>;
  parcelId: string | null; // null = alle percelen
};

// ============================================================================
// Weather Daily (background context for WeatherStrip)
// ============================================================================

export type WeatherDay = {
  date: string;
  tempMin: number | null;
  tempMax: number | null;
  precipitationSum: number | null;
  leafWetnessHours: number | null;
  isForecast?: boolean;
};

// ============================================================================
// Constants
// ============================================================================

export const EVENT_COLORS: Record<CalendarEventType, string> = {
  spray: '#3B82F6',
  harvest: '#F97316',
  task: '#14B8A6',
  disease: '#EF4444',
  phenology: '#EAB308',
  weather_alert: '#E11D48',
  field_note: '#10B981',
};

export const EVENT_LABELS: Record<CalendarEventType, string> = {
  spray: 'Bespuiting',
  harvest: 'Oogst',
  task: 'Taak',
  disease: 'Infectierisico',
  phenology: 'Groeifase',
  weather_alert: 'Weeralarm',
  field_note: 'Veldnotitie',
};

export const EVENT_ICONS: Record<CalendarEventType, typeof Droplets> = {
  spray: Droplets,
  harvest: Apple,
  task: Users,
  disease: AlertTriangle,
  phenology: Flower2,
  weather_alert: CloudLightning,
  field_note: StickyNote,
};

export const ALL_EVENT_TYPES: CalendarEventType[] = [
  'spray',
  'harvest',
  'task',
  'disease',
  'phenology',
  'weather_alert',
  'field_note',
];
