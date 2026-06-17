import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase-client';
import { resolveUser } from '@/lib/analytics/auth-helper';
import type { ParcelDiagnosticsData, TimelineEvent } from '@/lib/analytics/perceel/types';

function deriveHarvestYear(now: Date): number {
  const month = now.getMonth() + 1;
  return month >= 11 ? now.getFullYear() + 1 : now.getFullYear();
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const supabase = await createServerClient();
    const user = await resolveUser(supabase);
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const admin = getSupabaseAdmin();
    const now = new Date();
    const harvestYear = deriveHarvestYear(now);

    // 1. Sub-parcel + hoofdperceel + profile
    const { data: sub } = await admin
      .from('sub_parcels')
      .select('id, parcel_id, name, crop, variety, area')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (!sub) return NextResponse.json({ error: 'Perceel niet gevonden' }, { status: 404 });

    const { data: hoofd } = await admin
      .from('parcels')
      .select('id, name, area')
      .eq('id', sub.parcel_id)
      .single();

    const { data: profileData } = await admin
      .from('parcel_profiles')
      .select('*')
      .or(`sub_parcel_id.eq.${id},parcel_id.eq.${sub.parcel_id}`)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // 2. Grondmonster (eerst eigen sub_parcel, anders hoofdperceel)
    const [ownSoilRes, hoofdSoilRes] = await Promise.all([
      admin
        .from('soil_analyses')
        .select('datum_monstername, organische_stof_pct, n_leverend_vermogen_kg_ha, p_plantbeschikbaar_kg_ha, p_bodemvoorraad_p_al, klei_percentage, cn_ratio')
        .eq('sub_parcel_id', id)
        .eq('user_id', user.id)
        .order('datum_monstername', { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from('soil_analyses')
        .select('datum_monstername, organische_stof_pct, n_leverend_vermogen_kg_ha, p_plantbeschikbaar_kg_ha, p_bodemvoorraad_p_al, klei_percentage, cn_ratio')
        .eq('parcel_id', sub.parcel_id)
        .eq('user_id', user.id)
        .order('datum_monstername', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const latestSoil = ownSoilRes.data
      ? { ...ownSoilRes.data, source: 'own' as const, datum: ownSoilRes.data.datum_monstername }
      : hoofdSoilRes.data
        ? { ...hoofdSoilRes.data, source: 'inherited' as const, datum: hoofdSoilRes.data.datum_monstername }
        : null;

    // 3. Spuit + bemesting uit spuitschrift (perceelnaam in plots array)
    const { data: spuitRows } = await admin
      .from('spuitschrift')
      .select('id, date, plots, products, registration_type, harvest_year')
      .eq('user_id', user.id)
      .in('harvest_year', [harvestYear, harvestYear - 1, harvestYear - 2])
      .order('date', { ascending: true });

    const relevantSpuit = (spuitRows || []).filter(
      (r: any) => Array.isArray(r.plots) && r.plots.includes(sub.name)
    );

    // 4. Infectie-events uit ziektedruk model (als geconfigureerd voor dit perceel)
    const { data: diseaseConfig } = await admin
      .from('disease_model_config')
      .select('id')
      .eq('user_id', user.id)
      .eq('parcel_id', sub.parcel_id)
      .eq('harvest_year', harvestYear)
      .maybeSingle();

    let infectionRows: any[] = [];
    if (diseaseConfig) {
      const { data } = await admin
        .from('disease_infection_periods')
        .select('wet_period_start, wet_period_end, severity, avg_temperature, wet_duration_hours')
        .eq('config_id', diseaseConfig.id)
        .order('wet_period_start', { ascending: true });
      infectionRows = data || [];
    }

    // 5. Weer-extremen (vorst / zware regen / hitte) dichtstbijzijnde station
    const { data: stations } = await admin
      .from('weather_stations')
      .select('id')
      .eq('user_id', user.id)
      .limit(1);

    let weatherExtremes: any[] = [];
    if (stations?.length) {
      const stationId = stations[0].id;
      const seasonStart = `${harvestYear - 1}-11-01`;
      const seasonEnd = `${harvestYear}-10-31`;
      const { data: daily } = await admin
        .from('weather_data_daily')
        .select('date, temp_min_c, temp_max_c, precipitation_sum, frost_hours')
        .eq('station_id', stationId)
        .eq('is_forecast', false)
        .gte('date', seasonStart)
        .lte('date', seasonEnd)
        .order('date', { ascending: true });

      (daily || []).forEach((d: any) => {
        const dDate = new Date(d.date);
        const month = dDate.getMonth() + 1;
        // Nachtvorst tijdens bloei (apr-mei)
        if ((month === 4 || month === 5) && d.temp_min_c != null && d.temp_min_c < 0) {
          weatherExtremes.push({
            type: 'frost',
            date: d.date,
            temp_min: d.temp_min_c,
            frost_hours: d.frost_hours,
          });
        }
        // Hitte (> 32°C)
        if (d.temp_max_c != null && d.temp_max_c >= 32) {
          weatherExtremes.push({
            type: 'heatwave',
            date: d.date,
            temp_max: d.temp_max_c,
          });
        }
        // Zware regen (> 20mm op één dag)
        if (d.precipitation_sum != null && d.precipitation_sum >= 20) {
          weatherExtremes.push({
            type: 'heavy-rain',
            date: d.date,
            mm: d.precipitation_sum,
          });
        }
      });
    }

    // --- BUILD TIMELINE EVENTS ---
    const timeline: TimelineEvent[] = [];

    // Spuit / bemesting
    relevantSpuit.forEach((r: any) => {
      const products = Array.isArray(r.products) ? r.products : [];
      const productNames = products.map((p: any) => p.product).filter(Boolean);
      const title = productNames.slice(0, 2).join(' + ') + (productNames.length > 2 ? ` +${productNames.length - 2}` : '');
      const isFertSpray = r.registration_type === 'spraying' && products.some((p: any) => p.source === 'fertilizer');
      const isSpread = r.registration_type === 'spreading';
      timeline.push({
        id: `spray-${r.id}`,
        date: r.date,
        type: isSpread ? 'fertilize-spread' : isFertSpray ? 'fertilize-leaf' : 'spray',
        title: title || 'Registratie',
        subtitle: `${products.length} product${products.length === 1 ? '' : 'en'}`,
        meta: { products, harvestYear: r.harvest_year },
      });
    });

    // Infectie
    infectionRows.forEach((i: any) => {
      timeline.push({
        id: `infection-${i.wet_period_start}`,
        date: i.wet_period_start,
        type: 'infection',
        title: `Schurft-infectierisico: ${i.severity || 'matig'}`,
        subtitle: `${i.wet_duration_hours || '?'}u nat bij ${i.avg_temperature?.toFixed(1) || '?'}°C`,
        severity: i.severity === 'Very Severe' ? 'high' : i.severity === 'Severe' ? 'high' : i.severity === 'Moderate' ? 'medium' : 'low',
        meta: i,
      });
    });

    // Weer-extremen
    weatherExtremes.forEach((w: any, idx: number) => {
      if (w.type === 'frost') {
        timeline.push({
          id: `frost-${w.date}`,
          date: w.date,
          type: 'frost',
          title: `Nachtvorst ${w.temp_min.toFixed(1)}°C`,
          subtitle: w.frost_hours ? `${w.frost_hours}u onder 0°C` : undefined,
          severity: w.temp_min < -2 ? 'high' : 'medium',
          meta: w,
        });
      } else if (w.type === 'heatwave') {
        timeline.push({
          id: `heat-${w.date}-${idx}`,
          date: w.date,
          type: 'heatwave',
          title: `Hittedag ${w.temp_max.toFixed(0)}°C`,
          severity: w.temp_max >= 35 ? 'high' : 'medium',
          meta: w,
        });
      } else if (w.type === 'heavy-rain') {
        timeline.push({
          id: `rain-${w.date}-${idx}`,
          date: w.date,
          type: 'heavy-rain',
          title: `Zware regen ${w.mm.toFixed(0)} mm`,
          severity: w.mm >= 40 ? 'high' : 'medium',
          meta: w,
        });
      }
    });

    // Grondmonster event
    if (latestSoil && latestSoil.datum) {
      timeline.push({
        id: `soil-${latestSoil.datum}`,
        date: latestSoil.datum,
        type: 'soil-sample',
        title: 'Grondmonster',
        subtitle: `OS ${latestSoil.organische_stof_pct?.toFixed(1) || '?'}% · N-lev ${latestSoil.n_leverend_vermogen_kg_ha?.toFixed(0) || '?'} kg/ha`,
        meta: latestSoil,
      });
    }

    // Sorteer chronologisch
    timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // --- SUMMARY ---
    const thisYearSpuit = relevantSpuit.filter((r: any) => r.harvest_year === harvestYear);
    const thisYearTreatments = thisYearSpuit.filter((r: any) => r.registration_type === 'spraying').length;
    const thisYearFertilizations = thisYearSpuit.filter(
      (r: any) => r.registration_type === 'spreading' || (Array.isArray(r.products) && r.products.some((p: any) => p.source === 'fertilizer'))
    ).length;

    const infectionEventsThisYear = infectionRows.length;

    const result: ParcelDiagnosticsData = {
      subParcel: {
        id: sub.id,
        parcelId: sub.parcel_id,
        parcelName: hoofd?.name || 'Onbekend',
        name: sub.name,
        crop: sub.crop,
        variety: sub.variety,
        hectares: sub.area || 0,
      },
      profile: profileData
        ? {
            plantjaar: profileData.plantjaar,
            onderstam: profileData.onderstam,
            teeltsysteem: profileData.teeltsysteem,
            plantdichtheid: profileData.plantdichtheid_per_ha,
            hagelnet: profileData.hagelnet,
            irrigatie: profileData.irrigatiesysteem,
            fertigatie: profileData.fertigatie_aansluiting,
            rijrichting: profileData.rijrichting,
            herinplant: profileData.herinplant,
            grondsoort: profileData.grondsoort,
            bodem_ph: profileData.bodem_ph,
          }
        : null,
      latestSoil,
      timeline,
      summary: {
        thisYearTreatments,
        thisYearFertilizations,
        infectionEventsThisYear,
      },
      harvestYear,
      generatedAt: now.toISOString(),
    };

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('Perceel diagnostics error:', err);
    return NextResponse.json({ error: err.message || 'Fout' }, { status: 500 });
  }
}
