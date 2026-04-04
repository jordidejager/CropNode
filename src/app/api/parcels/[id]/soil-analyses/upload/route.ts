import { NextRequest } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { apiError, apiSuccess, handleUnknownError, ErrorCodes } from '@/lib/api-utils';
import type { ExtractionResult } from '@/ai/flows/extract-soil-analysis';

/**
 * POST /api/parcels/[id]/soil-analyses/upload
 * Upload een PDF grondmonster rapport en start AI-extractie.
 */
export async function POST(
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

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return apiError('Geen bestand geüpload', ErrorCodes.VALIDATION_ERROR, 400);
    }

    // Validate file
    if (file.type !== 'application/pdf') {
      return apiError('Alleen PDF bestanden worden geaccepteerd', ErrorCodes.VALIDATION_ERROR, 400);
    }

    if (file.size > 10 * 1024 * 1024) { // 10 MB
      return apiError('Bestand mag maximaal 10 MB zijn', ErrorCodes.VALIDATION_ERROR, 400);
    }

    // Upload to Supabase Storage
    const timestamp = Date.now();
    const storagePath = `${user.id}/${id}/${timestamp}_${file.name}`;

    const fileBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from('soil-analysis-pdfs')
      .upload(storagePath, fileBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) {
      return apiError(`Upload mislukt: ${uploadError.message}`, ErrorCodes.INTERNAL_ERROR, 500);
    }

    // Create soil_analyses record
    const { data: analysis, error: insertError } = await supabase
      .from('soil_analyses')
      .insert({
        ...(type === 'parcel' ? { parcel_id: id } : { sub_parcel_id: id }),
        user_id: user.id,
        datum_monstername: new Date().toISOString().split('T')[0], // Placeholder, wordt bijgewerkt na extractie
        pdf_storage_path: storagePath,
        pdf_filename: file.name,
        extractie_status: 'processing',
      })
      .select()
      .single();

    if (insertError) {
      return apiError(`Record aanmaken mislukt: ${insertError.message}`, ErrorCodes.INTERNAL_ERROR, 500);
    }

    // Start AI-extractie (async — niet wachten op resultaat)
    startExtraction(supabase, analysis.id, storagePath, user.id).catch(err => {
      console.error('[Soil Analysis] Extractie gefaald:', err);
    });

    return apiSuccess(analysis, 201);

  } catch (error) {
    return handleUnknownError(error, 'soil-analyses/upload POST');
  }
}

/**
 * Start de AI-extractie van een grondmonster PDF.
 * Draait async — update het record als het klaar is.
 */
async function startExtraction(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  analysisId: string,
  storagePath: string,
  userId: string,
) {
  try {
    // Download PDF van Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('soil-analysis-pdfs')
      .download(storagePath);

    if (downloadError || !fileData) {
      throw new Error(`PDF download mislukt: ${downloadError?.message}`);
    }

    // Convert to base64
    const buffer = await fileData.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    // Call Genkit flow
    const { runSoilExtraction } = await import('@/ai/flows/extract-soil-analysis');
    const result: ExtractionResult = await runSoilExtraction({ pdfBase64: base64, filename: storagePath });

    // Update het record met geëxtraheerde data
    const updateData: Record<string, unknown> = {
      extractie_status: 'completed',
      extractie_confidence: result.confidence,
      extractie_ruwe_output: result.rawOutput,
      updated_at: new Date().toISOString(),
    };

    // Map metadata
    if (result.metadata) {
      if (result.metadata.rapportIdentificatie) updateData.rapport_identificatie = result.metadata.rapportIdentificatie;
      if (result.metadata.lab) updateData.lab = result.metadata.lab;
      if (result.metadata.datumMonstername) updateData.datum_monstername = result.metadata.datumMonstername;
      if (result.metadata.datumVerslag) updateData.datum_verslag = result.metadata.datumVerslag;
      if (result.metadata.geldigTot) updateData.geldig_tot = result.metadata.geldigTot;
      if (result.metadata.bemonsterdeLaagCm) updateData.bemonsterde_laag_cm = result.metadata.bemonsterdeLaagCm;
      if (result.metadata.bemonsteringsmethode) updateData.bemonsteringsmethode = result.metadata.bemonsteringsmethode;
      if (result.metadata.grondsoortRapport) updateData.grondsoort_rapport = result.metadata.grondsoortRapport;
      if (result.metadata.oppervlakteRapportHa) updateData.oppervlakte_rapport_ha = result.metadata.oppervlakteRapportHa;
    }

    // Map analyseresultaten
    if (result.analyseresultaten) {
      const a = result.analyseresultaten;
      if (a.nTotaalBodemvoorraadKgHa != null) updateData.n_totaal_bodemvoorraad_kg_ha = a.nTotaalBodemvoorraadKgHa;
      if (a.nTotaalMgKg != null) updateData.n_totaal_mg_kg = a.nTotaalMgKg;
      if (a.cnRatio != null) updateData.cn_ratio = a.cnRatio;
      if (a.nLeverendVermogenKgHa != null) updateData.n_leverend_vermogen_kg_ha = a.nLeverendVermogenKgHa;
      if (a.pPlantbeschikbaarKgHa != null) updateData.p_plantbeschikbaar_kg_ha = a.pPlantbeschikbaarKgHa;
      if (a.pPlantbeschikbaarMgKg != null) updateData.p_plantbeschikbaar_mg_kg = a.pPlantbeschikbaarMgKg;
      if (a.pBodemvoorraadKgHa != null) updateData.p_bodemvoorraad_kg_ha = a.pBodemvoorraadKgHa;
      if (a.pBodemvoorraadPAl != null) updateData.p_bodemvoorraad_p_al = a.pBodemvoorraadPAl;
      if (a.pBodemvoorraadP100g != null) updateData.p_bodemvoorraad_p_100g = a.pBodemvoorraadP100g;
      if (a.pwGetal != null) updateData.pw_getal = a.pwGetal;
      if (a.cOrganischPct != null) updateData.c_organisch_pct = a.cOrganischPct;
      if (a.organischeStofPct != null) updateData.organische_stof_pct = a.organischeStofPct;
      if (a.kleiPercentage != null) updateData.klei_percentage = a.kleiPercentage;
      if (a.bulkdichtheidKgM3 != null) updateData.bulkdichtheid_kg_m3 = a.bulkdichtheidKgM3;
    }

    // Map overige
    if (result.waarderingen) updateData.waarderingen = result.waarderingen;
    if (result.bemestingsadviezen) updateData.bemestingsadviezen = result.bemestingsadviezen;
    if (result.rvo) {
      if (result.rvo.pAlMgP2o5 != null) updateData.rvo_p_al_mg_p2o5 = result.rvo.pAlMgP2o5;
      if (result.rvo.pCacl2MgKg != null) updateData.rvo_p_cacl2_mg_kg = result.rvo.pCacl2MgKg;
    }
    if (result.ruimtelijk) {
      if (result.ruimtelijk.hoekpuntenRd) updateData.hoekpunten_rd = result.ruimtelijk.hoekpuntenRd;
      if (result.ruimtelijk.monsternamepuntenRd) updateData.monsternamepunten_rd = result.ruimtelijk.monsternamepuntenRd;
    }

    await supabase
      .from('soil_analyses')
      .update(updateData)
      .eq('id', analysisId);

  } catch (err) {
    console.error('[Soil Analysis] Extractie error:', err);
    await supabase
      .from('soil_analyses')
      .update({
        extractie_status: 'failed',
        extractie_ruwe_output: { error: String(err) },
        updated_at: new Date().toISOString(),
      })
      .eq('id', analysisId);
  }
}
