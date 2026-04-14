import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';

export interface SeasonKPIs {
  sprayCount: number;
  sprayCost: number;
  totalHours: number;
  hoursCost: number;
  harvestKg: number;
  harvestCrates: number;
  noteCount: number;
  warningCount: number;
}

/**
 * Fetches season KPIs for a specific parcel/sub-parcel.
 * Season = current year (Jan 1 - Dec 31).
 */
async function fetchSeasonKPIs(parcelId: string): Promise<SeasonKPIs> {
  const year = new Date().getFullYear();
  const seasonStart = `${year}-01-01`;

  const [sprays, tasks, harvests, notes] = await Promise.all([
    // Spray count + cost
    supabase
      .from('parcel_history')
      .select('id, dosage, unit_price')
      .eq('parcel_id', parcelId)
      .gte('date', seasonStart),

    // Task hours + cost
    supabase
      .from('v_task_logs_enriched')
      .select('total_hours, estimated_cost')
      .eq('sub_parcel_id', parcelId)
      .gte('start_date', seasonStart),

    // Harvest
    supabase
      .from('harvest_registrations')
      .select('total_crates, weight_per_crate')
      .eq('sub_parcel_id', parcelId)
      .gte('harvest_date', seasonStart),

    // Field notes
    supabase
      .from('field_notes')
      .select('id, auto_tag, observation_category')
      .contains('parcel_ids', [parcelId])
      .gte('created_at', seasonStart),
  ]);

  const sprayCount = sprays.data?.length || 0;
  const sprayCost = (sprays.data || []).reduce((sum, s) => {
    return sum + (s.dosage && s.unit_price ? s.dosage * s.unit_price : 0);
  }, 0);

  const totalHours = (tasks.data || []).reduce((sum, t) => sum + (t.total_hours || 0), 0);
  const hoursCost = (tasks.data || []).reduce((sum, t) => sum + (t.estimated_cost || 0), 0);

  const harvestCrates = (harvests.data || []).reduce((sum, h) => sum + (h.total_crates || 0), 0);
  const harvestKg = (harvests.data || []).reduce((sum, h) => {
    return sum + ((h.total_crates || 0) * (h.weight_per_crate || 0));
  }, 0);

  const noteCount = notes.data?.length || 0;
  const warningCount = (notes.data || []).filter((n: any) =>
    n.observation_category === 'insect' || n.observation_category === 'schimmel' || n.observation_category === 'ziekte'
  ).length;

  return { sprayCount, sprayCost, totalHours, hoursCost, harvestKg, harvestCrates, noteCount, warningCount };
}

export function useParcelSeasonKPIs(parcelId: string | undefined) {
  return useQuery({
    queryKey: ['parcel-season-kpis', parcelId],
    queryFn: () => fetchSeasonKPIs(parcelId!),
    enabled: !!parcelId,
    staleTime: 5 * 60 * 1000,
  });
}
