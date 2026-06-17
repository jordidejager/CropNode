/**
 * Types voor Perceeldiagnostiek (Analytics › Perceel)
 */

export type TimelineEventType =
  | 'spray'
  | 'fertilize-leaf'
  | 'fertilize-spread'
  | 'infection'
  | 'frost'
  | 'heatwave'
  | 'heavy-rain'
  | 'soil-sample';

export interface TimelineEvent {
  id: string;
  date: string; // ISO
  type: TimelineEventType;
  title: string;
  subtitle?: string;
  /** Vrije metadata: product + dosering, temperatuur, severity etc. */
  meta?: Record<string, any>;
  /** Optionele severity voor visuele weging */
  severity?: 'low' | 'medium' | 'high';
}

export interface ParcelDiagnosticsData {
  subParcel: {
    id: string;
    parcelId: string;
    parcelName: string;
    name: string;
    crop: string;
    variety: string;
    hectares: number;
  };
  profile: {
    plantjaar: number | null;
    onderstam: string | null;
    teeltsysteem: string | null;
    plantdichtheid: number | null;
    hagelnet: string | null;
    irrigatie: string | null;
    fertigatie: string | null;
    rijrichting: string | null;
    herinplant: string | null;
    grondsoort: string | null;
    bodem_ph: number | null;
  } | null;
  latestSoil: {
    datum: string | null;
    organische_stof_pct: number | null;
    n_leverend_vermogen_kg_ha: number | null;
    p_plantbeschikbaar_kg_ha: number | null;
    p_bodemvoorraad_p_al: number | null;
    klei_percentage: number | null;
    cn_ratio: number | null;
    source: 'own' | 'inherited';
  } | null;
  timeline: TimelineEvent[];
  summary: {
    thisYearTreatments: number;
    thisYearFertilizations: number;
    infectionEventsThisYear: number;
  };
  harvestYear: number;
  generatedAt: string;
}
