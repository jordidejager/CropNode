/**
 * CropNode Aandachtspunten — Signal Types
 *
 * Een Signal is een concrete, actionable aandachtspunt voor de teler.
 * Gegenereerd door deterministische regel-gebaseerde detectors
 * (geen AI correlation mining). AI wordt alleen gebruikt voor
 * tekst-formulering en ranking, niet voor detectie.
 */

export type SignalSeverity = 'urgent' | 'attention' | 'explore';

export type SignalCategory =
  | 'disease'       // Ziektedruk, infectierisico, resistentie
  | 'soil'          // Bodem trends, nutriëntenbalans
  | 'quality'       // Oogst-kwaliteit verschuivingen
  | 'cost'          // Kosten-anomalieën, inefficiënties
  | 'compliance'    // CTGB/RVO/certificering
  | 'benchmark'     // Sector-vergelijking
  | 'production'    // Opbrengst trends, onderperformance
  | 'weather';      // Weer-gerelateerde risico's

export interface SignalAction {
  /** Kort label voor de actieknop, bijv. "Plan preventiespuit zondag" */
  label: string;
  /** Optionele interne link (bijv. "/analytics/perceel?id=X") */
  href?: string;
  /** Optionele actie-identifier voor client-side handler */
  actionId?: string;
}

export interface SignalMetric {
  /** Hoofdwaarde van het signaal */
  value: number;
  /** Vorige periode (vergelijking) */
  prevValue?: number;
  /** Sector/doelbenchmark */
  benchmark?: number;
  /** Doelwaarde (target) */
  target?: number;
  /** Eenheid, bijv. "€/ha", "%", "kg/ha", "#spuiten" */
  unit: string;
  /** Richting waarin hoger = beter. Als false, lager = beter (kosten) */
  higherIsBetter?: boolean;
}

export interface Signal {
  /** Stabiel ID (hash van type + entity + periode) voor deduplicate + archivering */
  id: string;
  /** Welke detector heeft dit gegenereerd */
  mechanism: string;
  /** Urgentie-niveau */
  severity: SignalSeverity;
  /** Categorie voor kleuring/filtering */
  category: SignalCategory;
  /** Korte titel (max ~80 chars) — wordt bold in UI */
  title: string;
  /** 2-3 zinnen met concrete cijfers, onderbouwing */
  body: string;
  /** Perceel- of subperceel-namen waarop dit betrekking heeft */
  affectedParcels: string[];
  /** Optionele actie-knop */
  action?: SignalAction;
  /** Optioneel hoofdgetal (voor visualisatie/badge) */
  metric?: SignalMetric;
  /** Interne prioriteitsscore (0-100), hoger = urgenter. Voor ranking. */
  priority: number;
  /** ISO tijdstip van generatie */
  generatedAt: string;
}

export interface SignalDetectorContext {
  /** User ID */
  userId: string;
  /** Admin client voor database queries (bypass RLS, pre-filtered op user_id) */
  admin: any; // SupabaseClient
  /** Huidig oogstjaar (zomerhelft = current year, winter = next year) */
  harvestYear: number;
  /** Huidige datum */
  now: Date;
  /** Alle subpercelen (voor naam-lookup etc.) */
  subParcels: Array<{
    id: string;
    parcel_id: string;
    name: string;
    crop: string;
    variety: string;
    area: number;
  }>;
  /** Alle hoofdpercelen */
  parcels: Array<{ id: string; name: string; area: number }>;
}

/** Detector signature — retourneert array van kandidaat-signalen */
export type SignalDetector = (
  ctx: SignalDetectorContext
) => Promise<Signal[]>;

/**
 * Benchmark-data voor de "hoe sta ik ervoor"-widget.
 * Ook gebruikt door detectors om anomalieën t.o.v. sector te identificeren.
 */
export interface BenchmarkSnapshot {
  /** KPI-label, bijv. "Kosten/ha" */
  label: string;
  /** Huidige waarde van teler */
  current: number | null;
  /** Waarde vorige oogstjaar */
  previous: number | null;
  /** Sector-benchmark (indicatief, niet definitief) */
  sectorAverage: number | null;
  /** Eenheid */
  unit: string;
  /** Richting waarin hoger = beter */
  higherIsBetter: boolean;
  /** Korte categorie tag, bijv. "kosten" of "productie" */
  tag: string;
}
