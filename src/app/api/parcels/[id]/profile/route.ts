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

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return apiError('Niet ingelogd', ErrorCodes.UNAUTHORIZED, 401);
    }

    // Haal profiel op
    const { data: profile, error } = await supabase
      .from('parcel_profiles')
      .select('*')
      .eq(idColumn, id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      return apiError('Fout bij ophalen profiel', ErrorCodes.INTERNAL_ERROR, 500);
    }

    // Haal ook laatste grondmonster op
    const { data: latestAnalysis } = await supabase
      .from('soil_analyses')
      .select('id, datum_monstername, lab, grondsoort_rapport, organische_stof_pct, klei_percentage, extractie_status')
      .eq(idColumn, id)
      .eq('user_id', user.id)
      .order('datum_monstername', { ascending: false })
      .limit(1)
      .maybeSingle();

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

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
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

    // Bereken plantdichtheid server-side
    let plantdichtheid = body.plantdichtheid_per_ha;
    if (body.rijafstand_m && body.plantafstand_m && body.rijafstand_m > 0 && body.plantafstand_m > 0) {
      plantdichtheid = Math.round(10000 / (body.rijafstand_m * body.plantafstand_m));
    }

    const profileData = {
      ...(type === 'parcel' ? { parcel_id: id } : { sub_parcel_id: id }),
      user_id: user.id,
      plantjaar: body.plantjaar ?? null,
      gewas: body.gewas ?? null,
      ras: body.ras ?? null,
      onderstammen: body.onderstammen ?? [],
      bestuiversras: body.bestuiversras ?? null,
      kloon_selectie: body.kloon_selectie ?? null,
      rijafstand_m: body.rijafstand_m ?? null,
      plantafstand_m: body.plantafstand_m ?? null,
      plantdichtheid_per_ha: plantdichtheid ?? null,
      aantal_bomen: body.aantal_bomen ?? null,
      teeltsysteem: body.teeltsysteem ?? null,
      boomhoogte_m: body.boomhoogte_m ?? null,
      rijrichting: body.rijrichting ?? null,
      hagelnet: body.hagelnet ?? null,
      regenkap: body.regenkap ?? null,
      insectennet: body.insectennet ?? null,
      windscherm: body.windscherm ?? null,
      steunconstructie: body.steunconstructie ?? null,
      irrigatiesysteem: body.irrigatiesysteem ?? null,
      fertigatie_aansluiting: body.fertigatie_aansluiting ?? null,
      nachtvorstberegening: body.nachtvorstberegening ?? null,
      koelberegening: body.koelberegening ?? null,
      waterbron: body.waterbron ?? null,
      drainage: body.drainage ?? null,
      grondsoort: body.grondsoort ?? null,
      bodem_ph: body.bodem_ph ?? null,
      organische_stof_pct: body.organische_stof_pct ?? null,
      klei_percentage: body.klei_percentage ?? null,
      grondwaterniveau: body.grondwaterniveau ?? null,
      certificeringen: body.certificeringen ?? [],
      duurzaamheidsprogrammas: body.duurzaamheidsprogrammas ?? [],
      voorgaand_gewas: body.voorgaand_gewas ?? null,
      herinplant: body.herinplant ?? null,
      verwachte_rooidatum: body.verwachte_rooidatum ?? null,
      notities: body.notities ?? null,
      bodem_bron_analyse_id: body.bodem_bron_analyse_id ?? null,
      updated_at: new Date().toISOString(),
    };

    const adminClient = createServiceRoleClient();
    const { data, error } = await adminClient
      .from('parcel_profiles')
      .upsert(profileData, { onConflict: type === 'parcel' ? 'parcel_id' : 'sub_parcel_id' })
      .select()
      .single();

    if (error) {
      return apiError(`Fout bij opslaan profiel: ${error.message}`, ErrorCodes.INTERNAL_ERROR, 500);
    }

    return apiSuccess(data);

  } catch (error) {
    return handleUnknownError(error, 'parcels/profile PUT');
  }
}
