import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase-client';
import { ai, withTimeout } from '@/ai/genkit';
import crypto from 'crypto';

// Rate limit: 1 call per 5 minutes per user
const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_MS = 5 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
    }

    // Rate limiting
    const lastCall = rateLimitMap.get(user.id);
    if (lastCall && Date.now() - lastCall < RATE_LIMIT_MS) {
      const waitSec = Math.ceil((RATE_LIMIT_MS - (Date.now() - lastCall)) / 1000);
      return NextResponse.json({ error: `Wacht nog ${waitSec} seconden voor een nieuwe analyse.` }, { status: 429 });
    }

    const admin = getSupabaseAdmin();

    // ================================================================
    // STEP 1: Aggregate all data
    // ================================================================

    const [
      parcelsRes,
      subParcelsRes,
      profilesRes,
      soilRes,
      productionRes,
      spuitschriftRes,
      weatherRes,
    ] = await Promise.all([
      admin.from('parcels').select('id, name, area').eq('user_id', user.id).order('name'),
      admin.from('sub_parcels').select('id, parcel_id, name, crop, variety, area').eq('user_id', user.id).order('name'),
      admin.from('parcel_profiles').select('*').eq('user_id', user.id),
      admin.from('soil_analyses').select('parcel_id, sub_parcel_id, organische_stof_pct, n_leverend_vermogen_kg_ha, p_plantbeschikbaar_kg_ha, p_bodemvoorraad_p_al, klei_percentage, cn_ratio, waarderingen, datum_monstername').eq('user_id', user.id).order('datum_monstername', { ascending: false }),
      admin.from('production_summaries').select('harvest_year, sub_parcel_id, variety, total_kg, hectares, total_crates, weight_per_crate').eq('user_id', user.id).order('harvest_year', { ascending: false }),
      admin.from('spuitschrift').select('id, date, plots, products, registration_type, harvest_year').eq('user_id', user.id).order('date', { ascending: false }).limit(500),
      // Weather: get daily data for last 3 years
      (async () => {
        const { data: stations } = await admin.from('weather_stations').select('id').eq('user_id', user.id).limit(1);
        if (!stations?.length) return { data: [] };
        const threeYearsAgo = new Date();
        threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
        return admin.from('weather_data_daily').select('date, temp_min_c, temp_max_c, temp_avg_c, precipitation_sum, frost_hours, gdd_base5').eq('station_id', stations[0].id).eq('is_forecast', false).gte('date', threeYearsAgo.toISOString().split('T')[0]).order('date');
      })(),
    ]);

    const parcels = parcelsRes.data || [];
    const subParcels = subParcelsRes.data || [];
    const profiles = profilesRes.data || [];
    const soilAnalyses = soilRes.data || [];
    const production = productionRes.data || [];
    const spuitschrift = (spuitschriftRes.data || []) as any[];
    const weatherDaily = weatherRes.data || [];

    // ================================================================
    // STEP 2: Build aggregated context for Gemini
    // ================================================================

    // Build per-subparcel summary
    const parcelSummaries = subParcels.map((sp: any) => {
      const hoofdPerceel = parcels.find((p: any) => p.id === sp.parcel_id);
      const profile = profiles.find((p: any) => p.sub_parcel_id === sp.id || p.parcel_id === sp.parcel_id);
      const soil = soilAnalyses.find((s: any) => s.sub_parcel_id === sp.id || s.parcel_id === sp.parcel_id);
      const prod = production.filter((p: any) => p.sub_parcel_id === sp.id);
      const sprays = spuitschrift.filter((s: any) => s.plots?.includes(sp.name));

      // Production per year
      const prodPerYear: Record<number, number> = {};
      prod.forEach((p: any) => {
        prodPerYear[p.harvest_year] = p.total_kg;
      });

      // Spray count per year
      const sprayPerYear: Record<number, number> = {};
      sprays.forEach((s: any) => {
        const y = s.harvest_year || new Date(s.date).getFullYear();
        sprayPerYear[y] = (sprayPerYear[y] || 0) + 1;
      });

      return {
        naam: sp.name,
        hoofdperceel: hoofdPerceel?.name || 'Onbekend',
        gewas: sp.crop,
        ras: sp.variety,
        hectares: sp.area,
        // Profile data
        plantjaar: profile?.plantjaar || null,
        onderstam: profile?.onderstam || null,
        teeltsysteem: profile?.teeltsysteem || null,
        plantdichtheid: profile?.plantdichtheid_per_ha || null,
        hagelnet: profile?.hagelnet || null,
        windscherm: profile?.windscherm || null,
        irrigatie: profile?.irrigatiesysteem || null,
        fertigatie: profile?.fertigatie_aansluiting || null,
        rijrichting: profile?.rijrichting || null,
        herinplant: profile?.herinplant || null,
        // Soil data
        organische_stof: soil?.organische_stof_pct || null,
        n_leverend_vermogen: soil?.n_leverend_vermogen_kg_ha || null,
        p_beschikbaar: soil?.p_plantbeschikbaar_kg_ha || null,
        p_al: soil?.p_bodemvoorraad_p_al || null,
        klei_pct: soil?.klei_percentage || null,
        cn_ratio: soil?.cn_ratio || null,
        // Production history
        productie_kg_per_jaar: prodPerYear,
        kg_per_ha_per_jaar: Object.fromEntries(
          Object.entries(prodPerYear).map(([y, kg]) => [y, sp.area > 0 ? Math.round((kg as number) / sp.area) : 0])
        ),
        // Spray history
        bespuitingen_per_jaar: sprayPerYear,
      };
    });

    // Weather summary per growing season (March-October)
    const weatherPerYear: Record<number, any> = {};
    (weatherDaily as any[]).forEach((d: any) => {
      const date = new Date(d.date);
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      // Growing season: March-October
      if (month < 3 || month > 10) return;

      if (!weatherPerYear[year]) {
        weatherPerYear[year] = { neerslag_totaal_mm: 0, gem_temp: 0, temp_count: 0, vorstdagen_bloei: 0, gdd_totaal: 0 };
      }
      const w = weatherPerYear[year];
      w.neerslag_totaal_mm += d.precipitation_sum || 0;
      if (d.temp_avg_c != null) { w.gem_temp += d.temp_avg_c; w.temp_count++; }
      // Frost during bloom (April-May)
      if ((month === 4 || month === 5) && d.temp_min_c != null && d.temp_min_c < 0) w.vorstdagen_bloei++;
      w.gdd_totaal += d.gdd_base5 || 0;
    });

    // Finalize weather averages
    Object.values(weatherPerYear).forEach((w: any) => {
      w.gem_temp = w.temp_count > 0 ? Math.round((w.gem_temp / w.temp_count) * 10) / 10 : null;
      delete w.temp_count;
    });

    // Data completeness check
    const dataCheck = {
      percelen: subParcels.length,
      perceelprofielen: profiles.length,
      grondmonsters: soilAnalyses.length,
      productiejaren: [...new Set(production.map((p: any) => p.harvest_year))].length,
      spuitregistraties: spuitschrift.length,
      weerjaren: Object.keys(weatherPerYear).length,
    };

    // Create data hash for caching
    const dataHash = crypto.createHash('md5')
      .update(JSON.stringify({ dataCheck, lastProd: production[0]?.harvest_year, lastSpray: spuitschrift[0]?.date }))
      .digest('hex');

    // Check cache: less than 24h old and same data hash
    const { data: cached } = await admin
      .from('insight_results')
      .select('id, result_json, generated_at, data_hash')
      .eq('user_id', user.id)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached && cached.data_hash === dataHash) {
      const age = Date.now() - new Date(cached.generated_at).getTime();
      if (age < 24 * 60 * 60 * 1000) {
        return NextResponse.json({
          insights: cached.result_json,
          cached: true,
          generated_at: cached.generated_at,
          data_check: dataCheck,
        });
      }
    }

    // Check minimum data
    if (subParcels.length === 0) {
      return NextResponse.json({
        insights: [],
        cached: false,
        data_check: dataCheck,
        error: 'Geen percelen gevonden. Voeg eerst percelen toe.',
      });
    }

    // ================================================================
    // STEP 3: Gemini Analysis
    // ================================================================

    const context = JSON.stringify({
      percelen: parcelSummaries,
      weer_per_jaar: weatherPerYear,
      data_beschikbaarheid: dataCheck,
    });

    const systemPrompt = `Je bent een data-analist voor een Nederlandse fruitteler. Je analyseert perceeldata, productiecijfers, bodemanalyses, spuitregistraties en weerdata om patronen en correlaties te ontdekken.

REGELS:
- Antwoord UITSLUITEND in het Nederlands
- Gebruik NOOIT het woord "advies" of "aanbeveling". Gebruik "indicatie", "signalering", of "patroon"
- Toon ALLEEN patronen waar voldoende data voor is (minimaal 2 percelen voor vergelijkingen, minimaal 2 jaren voor trends)
- Wees specifiek: noem concrete perceelnamen, cijfers, percentages
- Geef de top 8-12 meest opvallende patronen, gerangschikt van sterkst naar zwakst

CORRELATIE-RECEPTEN (probeer allemaal, rapporteer alleen als data beschikbaar):

Productie:
- Vergelijk kg/ha tussen rassen
- Vergelijk kg/ha tussen onderstammen bij zelfde ras
- Correleer plantdichtheid met kg/ha
- Correleer leeftijd (plantjaar) met kg/ha
- Trend productie per perceel over jaren

Infrastructuur:
- Vergelijk kg/ha bij hagelnet types
- Vergelijk kg/ha bij irrigatie ja/nee
- Vergelijk kg/ha bij fertigatie ja/nee
- Vergelijk kg/ha bij teeltsystemen

Bodem:
- Correleer organische stof met kg/ha
- Correleer N-leverend vermogen met kg/ha
- Correleer P-beschikbaar met kg/ha

Weer:
- Correleer totale neerslag groeiseizoen met kg/ha per jaar
- Correleer GDD met kg/ha per jaar
- Impact nachtvorst bloei op productie

Uitschieters:
- Welk perceel presteert ver onder/boven gemiddelde?
- Percelen met dalende productietrend
- Percelen met slechte bodemscores én lage productie

Antwoord ALLEEN met een JSON array, geen markdown of toelichting:
[
  {
    "titel": "korte conclusie (max 80 tekens)",
    "beschrijving": "2-3 zinnen met concrete cijfers",
    "type": "vergelijking|correlatie|trend|uitschieter|risico",
    "categorie": "productie|bodem|gewasbescherming|weer|infrastructuur",
    "sterkte": "sterk|matig|zwak",
    "betrokken_percelen": ["naam1", "naam2"],
    "datapunten": {"label1": waarde1, "label2": waarde2},
    "visualisatie_type": "bar_vergelijking|lijn_trend|scatter|waarde_highlight"
  }
]`;

    rateLimitMap.set(user.id, Date.now());

    const result = await withTimeout(
      ai.generate({
        prompt: `Analyseer de volgende bedrijfsdata van een fruitteler en geef de meest opvallende patronen:\n\n${context}`,
        system: systemPrompt,
        config: {
          temperature: 0.3,
          maxOutputTokens: 4096,
        },
      }),
      60_000,
      'Inzichten analyse'
    );

    // Parse response
    let insights: any[] = [];
    try {
      const text = result.text.trim();
      // Strip markdown code fences if present
      const jsonStr = text.replace(/^```json?\s*\n?/, '').replace(/\n?```\s*$/, '');
      insights = JSON.parse(jsonStr);
      if (!Array.isArray(insights)) insights = [];
    } catch (parseErr) {
      console.error('Failed to parse Gemini insights:', parseErr, result.text);
      return NextResponse.json({
        insights: [],
        cached: false,
        data_check: dataCheck,
        error: 'De analyse kon niet verwerkt worden. Probeer het opnieuw.',
      });
    }

    // Save to cache
    await admin.from('insight_results').insert({
      user_id: user.id,
      result_json: insights,
      data_hash: dataHash,
    });

    // Cleanup old results (keep last 5)
    const { data: oldResults } = await admin
      .from('insight_results')
      .select('id')
      .eq('user_id', user.id)
      .order('generated_at', { ascending: false })
      .range(5, 100);

    if (oldResults?.length) {
      await admin.from('insight_results').delete().in('id', oldResults.map((r: any) => r.id));
    }

    return NextResponse.json({
      insights,
      cached: false,
      generated_at: new Date().toISOString(),
      data_check: dataCheck,
    });
  } catch (err: any) {
    console.error('Inzichten generate error:', err);
    return NextResponse.json({
      error: err.message || 'Er ging iets mis bij het genereren van inzichten.',
      insights: [],
    }, { status: 500 });
  }
}
