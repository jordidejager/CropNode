import { NextRequest } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase-client';
import { apiError, apiSuccess, handleUnknownError, ErrorCodes } from '@/lib/api-utils';

/**
 * GET /api/parcels/[id]/profile?type=parcel|sub_parcel
 * Haal het perceelprofiel op voor een parcel of sub_parcel.
 * type=parcel → zoek op parcel_id (hoofdperceel)
 * type=sub_parcel (default) → zoek op sub_parcel_id
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const type = request.nextUrl.searchParams.get('type') || 'sub_parcel';
    const idColumn = type === 'parcel' ? 'parcel_id' : 'sub_parcel_id';
    const supabase = await createServerClient();

    // Auth check
    let user = (await supabase.auth.getUser()).data.user;
    if (!user) {
      const { data: sessionData } = await supabase.auth.getSession();
      user = sessionData?.session?.user || null;
    }
    if (!user) {
      return apiError('Niet ingelogd', ErrorCodes.UNAUTHORIZED, 401);
    }

    // Gebruik adminClient voor data queries (bypass RLS, betrouwbaarder)
    const adminClient = createServiceRoleClient();

    // Haal profiel op
    const { data: profile, error } = await adminClient
      .from('parcel_profiles')
      .select('*')
      .eq(idColumn, id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      return apiError('Fout bij ophalen profiel', ErrorCodes.INTERNAL_ERROR, 500);
    }

    // Haal laatste grondmonster op (eigen + hoofdperceel als fallback)
    const analysisFields = '*';
    let latestAnalysis = null;

    const { data: ownAnalysis } = await adminClient
      .from('soil_analyses')
      .select(analysisFields)
      .eq(idColumn, id)
      .eq('user_id', user.id)
      .order('datum_monstername', { ascending: false })
      .limit(1)
      .maybeSingle();

    latestAnalysis = ownAnalysis;

    // Fallback naar hoofdperceel's grondmonster als sub_parcel geen eigen heeft
    if (!latestAnalysis && type === 'sub_parcel') {
      const { data: subParcel } = await adminClient
        .from('sub_parcels')
        .select('parcel_id')
        .eq('id', id)
        .maybeSingle();

      console.log(`[profile GET] Fallback lookup: sub_parcel ${id} → parcel_id: ${subParcel?.parcel_id || 'NULL'}`);

      if (subParcel?.parcel_id) {
        const { data: parentAnalysis } = await adminClient
          .from('soil_analyses')
          .select(analysisFields)
          .eq('parcel_id', subParcel.parcel_id)
          .eq('user_id', user.id)
          .order('datum_monstername', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (parentAnalysis) {
          latestAnalysis = { ...parentAnalysis, inherited: true };
        }
      }
    }

    return apiSuccess({
      profile: profile || null,
      latestSoilAnalysis: latestAnalysis || null,
    });

  } catch (error) {
    return handleUnknownError(error, 'parcels/profile GET');
  }
}

/**
 * PUT /api/parcels/[id]/profile?type=parcel|sub_parcel
 * Upsert (insert of update) het volledige profiel.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const type = request.nextUrl.searchParams.get('type') || 'sub_parcel';
    const supabase = await createServerClient();

    // Auth: probeer getUser, fallback naar getSession
    let user = (await supabase.auth.getUser()).data.user;
    if (!user) {
      const { data: sessionData } = await supabase.auth.getSession();
      user = sessionData?.session?.user || null;
    }
    if (!user) {
      return apiError('Niet ingelogd', ErrorCodes.UNAUTHORIZED, 401);
    }

    const body = await request.json();

    // Validatie
    if (body.plantjaar != null && (body.plantjaar < 1950 || body.plantjaar > new Date().getFullYear())) {
      return apiError('Plantjaar moet tussen 1950 en huidig jaar zijn', ErrorCodes.VALIDATION_ERROR, 400);
    }
    if (body.bodem_ph != null && (body.bodem_ph < 3.0 || body.bodem_ph > 9.0)) {
      return apiError('pH moet tussen 3.0 en 9.0 zijn', ErrorCodes.VALIDATION_ERROR, 400);
    }
    if (body.organische_stof_pct != null && (body.organische_stof_pct < 0 || body.organische_stof_pct > 30)) {
      return apiError('Organische stof moet tussen 0 en 30% zijn', ErrorCodes.VALIDATION_ERROR, 400);
    }
    if (body.klei_percentage != null && (body.klei_percentage < 0 || body.klei_percentage > 100)) {
      return apiError('Klei percentage moet tussen 0 en 100% zijn', ErrorCodes.VALIDATION_ERROR, 400);
    }

    // Sanitize: lege strings → null voor numerieke velden
    const numFields = ['plantjaar', 'rijafstand_m', 'plantafstand_m', 'plantdichtheid_per_ha',
      'aantal_bomen', 'boomhoogte_m', 'bodem_ph', 'organische_stof_pct', 'klei_percentage',
      'verwachte_rooidatum', 'bestuiver_afstand', 'c_organisch_pct', 'pw_getal'];
    for (const f of numFields) {
      if (body[f] === '' || body[f] === undefined) body[f] = null;
      else if (body[f] != null) body[f] = Number(body[f]);
    }

    // Bereken plantdichtheid server-side (-10% koppakkers)
    let plantdichtheid = body.plantdichtheid_per_ha;
    if (body.rijafstand_m && body.plantafstand_m && body.rijafstand_m > 0 && body.plantafstand_m > 0) {
      plantdichtheid = Math.round((10000 / (body.rijafstand_m * body.plantafstand_m)) * 0.9);
    }

    // Extract ziekte_* en vijand_* velden naar JSONB objecten
    const ziektenPlagen: Record<string, string> = {};
    const natuurlijkeVijanden: Record<string, string> = {};
    for (const [key, val] of Object.entries(body)) {
      if (key.startsWith('ziekte_') && val) ziektenPlagen[key] = val as string;
      if (key.startsWith('vijand_') && val) natuurlijkeVijanden[key] = val as string;
    }

    // Bouw profileData op — alleen velden die daadwerkelijk naar DB gaan
    const profileData: Record<string, unknown> = {
      ...(type === 'parcel' ? { parcel_id: id } : { sub_parcel_id: id }),
      user_id: user.id,
      updated_at: new Date().toISOString(),
    };

    // Stel alle bekende profiel-velden in (null als niet meegegeven)
    const textFields = [
      'gewas', 'ras', 'bestuiversras', 'kloon_selectie', 'teeltsysteem', 'rijrichting',
      'hagelnet', 'regenkap', 'insectennet', 'windscherm', 'steunconstructie',
      'irrigatiesysteem', 'fertigatie_aansluiting', 'nachtvorstberegening', 'koelberegening',
      'beregening', 'waterbron', 'drainage', 'grondsoort', 'grondwaterniveau',
      'voorgaand_gewas', 'herinplant', 'notities',
    ];
    for (const f of textFields) {
      if (f in body) profileData[f] = body[f] || null;
    }

    // Numerieke velden (al gesanitized boven)
    const numericFields = [
      'plantjaar', 'rijafstand_m', 'plantafstand_m', 'aantal_bomen',
      'boomhoogte_m', 'bodem_ph', 'organische_stof_pct', 'klei_percentage',
      'verwachte_rooidatum', 'bestuiver_afstand', 'c_organisch_pct', 'pw_getal',
    ];
    for (const f of numericFields) {
      if (f in body) profileData[f] = body[f];
    }

    // Plantdichtheid
    profileData.plantdichtheid_per_ha = plantdichtheid ?? null;

    // Array/JSONB velden
    if ('onderstammen' in body) profileData.onderstammen = body.onderstammen ?? [];
    if ('certificeringen' in body) profileData.certificeringen = body.certificeringen ?? [];
    if ('duurzaamheidsprogrammas' in body) profileData.duurzaamheidsprogrammas = body.duurzaamheidsprogrammas ?? [];

    // Ziekten & natuurlijke vijanden (JSONB)
    profileData.ziekten_plagen = Object.keys(ziektenPlagen).length > 0 ? ziektenPlagen : {};
    profileData.natuurlijke_vijanden = Object.keys(natuurlijkeVijanden).length > 0 ? natuurlijkeVijanden : {};

    if ('bodem_bron_analyse_id' in body) profileData.bodem_bron_analyse_id = body.bodem_bron_analyse_id ?? null;

    const adminClient = createServiceRoleClient();
    let { data, error } = await adminClient
      .from('parcel_profiles')
      .upsert(profileData, { onConflict: type === 'parcel' ? 'parcel_id' : 'sub_parcel_id' })
      .select()
      .single();

    // Als er een kolom-fout is (migratie niet uitgevoerd), probeer opnieuw zonder nieuwe kolommen
    if (error?.message?.includes('column') || error?.code === '42703') {
      console.warn('[profile PUT] Column error, retrying without new fields:', error.message);
      const safeFields = ['bestuiver_afstand', 'ziekten_plagen', 'natuurlijke_vijanden', 'c_organisch_pct', 'pw_getal', 'beregening'];
      for (const f of safeFields) delete profileData[f];
      const retry = await adminClient
        .from('parcel_profiles')
        .upsert(profileData, { onConflict: type === 'parcel' ? 'parcel_id' : 'sub_parcel_id' })
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      return apiError(`Fout bij opslaan profiel: ${error.message}`, ErrorCodes.INTERNAL_ERROR, 500);
    }

    return apiSuccess(data);

  } catch (error) {
    return handleUnknownError(error, 'parcels/profile PUT');
  }
}
