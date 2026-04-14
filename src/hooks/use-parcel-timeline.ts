import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';

export interface TimelineEvent {
  id: string;
  date: string; // ISO date string
  type: 'spray' | 'note' | 'task' | 'soil' | 'harvest' | 'infection';
  title: string;
  description?: string;
  meta?: Record<string, unknown>;
}

/**
 * Fetches all events for a parcel/sub-parcel and merges them into a sorted timeline.
 * Queries 5 tables in parallel for maximum speed.
 */
async function fetchTimeline(parcelId: string): Promise<TimelineEvent[]> {
  const events: TimelineEvent[] = [];

  const [sprays, notes, tasks, soil, harvests] = await Promise.all([
    // 1. Spray registrations
    supabase
      .from('parcel_history')
      .select('id, date, product, dosage, unit, parcel_name')
      .eq('parcel_id', parcelId)
      .order('date', { ascending: false })
      .limit(50),

    // 2. Field notes (parcel_ids is a TEXT[] array)
    supabase
      .from('field_notes')
      .select('id, created_at, content, auto_tag, observation_subject, observation_category, photo_url, status')
      .contains('parcel_ids', [parcelId])
      .order('created_at', { ascending: false })
      .limit(30),

    // 3. Task logs (hours)
    supabase
      .from('v_task_logs_enriched')
      .select('id, start_date, end_date, sub_parcel_name, task_type_name, total_hours, estimated_cost, notes')
      .eq('sub_parcel_id', parcelId)
      .order('start_date', { ascending: false })
      .limit(30),

    // 4. Soil analyses
    supabase
      .from('soil_analyses')
      .select('id, datum_monstername, lab, rapport_identificatie, grondsoort_rapport, organische_stof_pct, extractie_status')
      .or(`sub_parcel_id.eq.${parcelId},parcel_id.eq.${parcelId}`)
      .order('datum_monstername', { ascending: false })
      .limit(10),

    // 5. Harvest registrations
    supabase
      .from('harvest_registrations')
      .select('id, harvest_date, variety, total_crates, pick_number, quality_class, weight_per_crate, notes')
      .eq('sub_parcel_id', parcelId)
      .order('harvest_date', { ascending: false })
      .limit(20),
  ]);

  // Map sprays
  if (sprays.data) {
    for (const s of sprays.data) {
      events.push({
        id: `spray-${s.id}`,
        date: s.date,
        type: 'spray',
        title: s.product || 'Bespuiting',
        description: s.dosage ? `${s.dosage} ${s.unit || ''}`.trim() : undefined,
      });
    }
  }

  // Map field notes
  if (notes.data) {
    for (const n of notes.data) {
      const tagLabel = n.auto_tag === 'waarneming' ? 'Waarneming' :
        n.auto_tag === 'bespuiting' ? 'Bespuiting (notitie)' :
        n.auto_tag === 'bemesting' ? 'Bemesting' :
        n.auto_tag === 'taak' ? 'Taak' : 'Veldnotitie';
      events.push({
        id: `note-${n.id}`,
        date: n.created_at,
        type: 'note',
        title: tagLabel,
        description: n.content?.slice(0, 120) || undefined,
        meta: { photo: n.photo_url, subject: n.observation_subject, status: n.status },
      });
    }
  }

  // Map task logs
  if (tasks.data) {
    for (const t of tasks.data) {
      events.push({
        id: `task-${t.id}`,
        date: t.start_date,
        type: 'task',
        title: t.task_type_name || 'Werkzaamheden',
        description: `${t.total_hours || 0}u${t.estimated_cost ? ` · €${Math.round(t.estimated_cost)}` : ''}`,
        meta: { endDate: t.end_date, notes: t.notes },
      });
    }
  }

  // Map soil analyses
  if (soil.data) {
    for (const a of soil.data) {
      events.push({
        id: `soil-${a.id}`,
        date: a.datum_monstername,
        type: 'soil',
        title: `Grondmonster${a.lab ? ` (${a.lab})` : ''}`,
        description: a.rapport_identificatie || (a.grondsoort_rapport ? `Grondsoort: ${a.grondsoort_rapport}` : undefined),
        meta: { status: a.extractie_status, orgStof: a.organische_stof_pct },
      });
    }
  }

  // Map harvests
  if (harvests.data) {
    for (const h of harvests.data) {
      const kg = h.total_crates && h.weight_per_crate ? Math.round(h.total_crates * h.weight_per_crate) : null;
      events.push({
        id: `harvest-${h.id}`,
        date: h.harvest_date,
        type: 'harvest',
        title: `Oogst${h.pick_number ? ` (pluk ${h.pick_number})` : ''}`,
        description: [
          h.total_crates ? `${h.total_crates} kisten` : null,
          kg ? `${kg} kg` : null,
          h.variety,
        ].filter(Boolean).join(' · ') || undefined,
        meta: { quality: h.quality_class },
      });
    }
  }

  // Sort all events by date DESC
  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return events;
}

export function useParcelTimeline(parcelId: string | undefined) {
  return useQuery({
    queryKey: ['parcel-timeline', parcelId],
    queryFn: () => fetchTimeline(parcelId!),
    enabled: !!parcelId,
    staleTime: 2 * 60 * 1000, // 2 min
  });
}
