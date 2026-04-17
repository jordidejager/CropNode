import { NextRequest } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase-client';
import { apiError, apiSuccess, handleUnknownError, ErrorCodes } from '@/lib/api-utils';

/**
 * POST /api/afzetstromen/extract-sorteerrapport
 *
 * Upload een PDF sorteerrapport. De AI extraheert alle data en maakt in één keer:
 *   - batches row (met variety, pick, season, harvest_year, notes)
 *   - batch_events van type 'sortering_extern' (kosten + per-maat verdeling)
 *   - batch_events van type 'afzet' (opbrengst)
 *   - batch_parcels rij als het perceel kan worden gematcht
 *   - batch_documents rij met de originele PDF
 *
 * Synchroon: wachttijd ~5-15s. Retourneert het aangemaakte batch-record.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return apiError('Niet ingelogd', ErrorCodes.UNAUTHORIZED, 401);
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return apiError('Geen bestand geüpload', ErrorCodes.VALIDATION_ERROR, 400);
    }
    if (file.type !== 'application/pdf') {
      return apiError('Alleen PDF bestanden worden geaccepteerd', ErrorCodes.VALIDATION_ERROR, 400);
    }
    if (file.size > 10 * 1024 * 1024) {
      return apiError('Bestand mag maximaal 10 MB zijn', ErrorCodes.VALIDATION_ERROR, 400);
    }

    // Admin client for storage + RPC-bypass
    const admin = createServiceRoleClient();

    // Convert to buffer + base64 once — used for both Storage upload and Gemini
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    // Run AI extraction (synchronous for simplicity; ~5-15s)
    const { runSorteerrapportExtraction } = await import(
      '@/ai/flows/extract-sorteerrapport'
    );

    let extraction: Awaited<ReturnType<typeof runSorteerrapportExtraction>>;
    try {
      extraction = await runSorteerrapportExtraction({
        pdfBase64: base64,
        filename: file.name,
      });
    } catch (err) {
      console.error('[extract-sorteerrapport] AI extraction failed:', err);
      return apiError(
        `AI-extractie mislukt: ${err instanceof Error ? err.message : 'onbekende fout'}`,
        ErrorCodes.INTERNAL_ERROR,
        500,
      );
    }

    // ---- Derive values ----
    const orderDate = extraction.sorter.order_date
      ? new Date(extraction.sorter.order_date)
      : new Date();

    const harvestYear = deriveHarvestYear(orderDate);
    const season = deriveSeason(harvestYear);

    // Normaliseer variety via alias-map (bv. "Fengapi" → "Tessa/Fengapi")
    const { normalizeVariety } = await import('@/components/afzetstromen/constants');
    const canonicalVariety = normalizeVariety(extraction.batch.variety ?? null);

    // ---- Try to match parcel / sub_parcel ----
    const matchedParcel = await matchParcel(
      admin,
      user.id,
      extraction.batch.parcel_hint ?? null,
      extraction.batch.sub_parcel_hint ?? null,
      canonicalVariety,
    );

    // ---- Upload PDF to Storage ----
    const timestamp = Date.now();
    const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${user.id}/sorteerrapporten/${timestamp}_${safeFilename}`;

    const { error: uploadError } = await admin.storage
      .from('partij-documenten')
      .upload(storagePath, buffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) {
      console.error('[extract-sorteerrapport] Storage upload failed:', uploadError);
      // Continue anyway — data extraction is the primary value; the user still
      // wants the batch to be created. Mark storagePath as null.
    }

    // ---- Build auto-label ----
    const parts: string[] = [];
    if (canonicalVariety) parts.push(canonicalVariety);
    if (extraction.batch.pick_number) parts.push(`P${extraction.batch.pick_number}`);
    if (matchedParcel?.subParcelName) parts.push(matchedParcel.subParcelName);
    else if (matchedParcel?.parcelName) parts.push(matchedParcel.parcelName);
    else if (extraction.batch.parcel_hint) parts.push(extraction.batch.parcel_hint);
    if (harvestYear) parts.push(String(harvestYear));
    const autoLabel = parts.length > 0 ? parts.join(' — ') : null;

    // ---- Build notes ----
    const noteParts: string[] = [];
    noteParts.push(
      `Automatisch aangemaakt uit sorteerrapport (${extraction.sorter.name ?? 'onbekende sorteerder'}) — AI-extractie confidence ${Math.round(extraction.confidence * 100)}%.`,
    );
    if (extraction.notes_for_user) {
      noteParts.push(`AI-opmerking: ${extraction.notes_for_user}`);
    }
    if (!matchedParcel && extraction.batch.parcel_hint) {
      noteParts.push(
        `Perceel "${extraction.batch.parcel_hint}"${extraction.batch.sub_parcel_hint ? ` / "${extraction.batch.sub_parcel_hint}"` : ''} niet gevonden in je percelen — handmatig koppelen indien nodig.`,
      );
    }
    if (extraction.batch.plantation_year) {
      noteParts.push(`Aanplantjaar: ${extraction.batch.plantation_year}`);
    }

    // ---- Create batch ----
    const { data: batchRow, error: batchErr } = await admin
      .from('batches')
      .insert({
        user_id: user.id,
        label: autoLabel,
        variety: canonicalVariety,
        season,
        harvest_year: harvestYear,
        pick_number: clampPickNumber(extraction.batch.pick_number),
        status: 'active',
        notes: noteParts.join('\n'),
      })
      .select()
      .single();

    if (batchErr || !batchRow) {
      return apiError(
        `Partij aanmaken mislukt: ${batchErr?.message ?? 'onbekende fout'}`,
        ErrorCodes.INTERNAL_ERROR,
        500,
      );
    }

    const batchId = batchRow.id as string;

    // ---- Create batch_parcels link (if matched) ----
    if (matchedParcel) {
      await admin.from('batch_parcels').insert({
        batch_id: batchId,
        user_id: user.id,
        parcel_id: matchedParcel.parcelId,
        sub_parcel_id: matchedParcel.subParcelId,
        estimated_kg: extraction.financials.total_kg ?? null,
      });
    }

    // ---- Create sortering_extern event ----
    const sorteringDetails: Record<string, unknown> = {
      sorter_name: extraction.sorter.name ?? null,
      invoice_number: extraction.sorter.invoice_number ?? null,
      order_number: extraction.sorter.order_number ?? null,
      supplier_reference: extraction.sorter.supplier_reference ?? null,
      transportkosten_inbegrepen: true, // default assumption for externe sortering
      sizes: extraction.sizes.map((s) => ({
        size: s.size,
        class: s.class,
        kg: s.kg,
        percentage: s.percentage,
        price_per_kg: s.price_per_kg,
      })),
      sorteerkosten_eur: extraction.financials.sort_cost_eur ?? null,
      source: 'ai_extraction',
      ai_confidence: extraction.confidence,
    };

    await admin.from('batch_events').insert({
      user_id: user.id,
      batch_id: batchId,
      event_type: 'sortering_extern',
      event_date: toIsoDate(orderDate),
      kg: extraction.financials.total_kg ?? null,
      cost_eur: extraction.financials.sort_cost_eur ?? null,
      details: sorteringDetails,
      notes: 'Automatisch aangemaakt uit sorteerrapport.',
    });

    // ---- Create afzet event (revenue) ----
    if (
      extraction.financials.total_revenue_eur != null ||
      extraction.sizes.some((s) => s.revenue_eur != null || s.price_per_kg != null)
    ) {
      const afzetDetails: Record<string, unknown> = {
        buyer: extraction.buyer.name ?? extraction.sorter.name ?? null,
        price_per_kg: extraction.financials.avg_price_per_kg ?? null,
        payment_date: extraction.buyer.payment_date ?? null,
        contract_reference: extraction.sorter.order_number ?? null,
        invoice_number: extraction.sorter.invoice_number ?? null,
        sizes: extraction.sizes.map((s) => ({
          size: s.size,
          class: s.class,
          kg: s.kg,
          price_per_kg: s.price_per_kg,
          revenue_eur: s.revenue_eur,
        })),
        source: 'ai_extraction',
      };

      await admin.from('batch_events').insert({
        user_id: user.id,
        batch_id: batchId,
        event_type: 'afzet',
        event_date: toIsoDate(orderDate),
        kg: extraction.financials.total_kg ?? null,
        revenue_eur: extraction.financials.total_revenue_eur ?? null,
        details: afzetDetails,
        notes: 'Automatisch aangemaakt uit sorteerrapport.',
      });
    }

    // ---- Create batch_documents row for the PDF ----
    if (!uploadError) {
      await admin.from('batch_documents').insert({
        user_id: user.id,
        batch_id: batchId,
        storage_path: storagePath,
        filename: file.name,
        mime_type: 'application/pdf',
        size_bytes: file.size,
        document_type: 'sorteer_overzicht',
        processing_status: 'linked',
        processed_at: new Date().toISOString(),
        notes: `AI-geëxtraheerd. Confidence: ${Math.round(extraction.confidence * 100)}%.`,
      });
    }

    // ---- Return summary ----
    return apiSuccess(
      {
        batchId,
        label: autoLabel,
        matchedParcel: matchedParcel
          ? {
              parcelId: matchedParcel.parcelId,
              subParcelId: matchedParcel.subParcelId,
              parcelName: matchedParcel.parcelName,
              subParcelName: matchedParcel.subParcelName,
            }
          : null,
        confidence: extraction.confidence,
        sizesFound: extraction.sizes.length,
        totalKg: extraction.financials.total_kg ?? null,
        totalRevenueEur: extraction.financials.total_revenue_eur ?? null,
        sortCostEur: extraction.financials.sort_cost_eur ?? null,
        extraction, // full extraction for debug/preview in UI
      },
      201,
    );
  } catch (error) {
    return handleUnknownError(error, 'afzetstromen/extract-sorteerrapport POST');
  }
}

// ============================================================================
// Helpers
// ============================================================================

function toIsoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function clampPickNumber(n: number | null | undefined): number | null {
  if (n == null) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 5) return null;
  return rounded;
}

/** Convention: July+ = new harvest year; Jan-Jun = previous season's year. */
function deriveHarvestYear(orderDate: Date): number {
  const year = orderDate.getFullYear();
  const month = orderDate.getMonth() + 1;
  // Sorteerrapporten komen meestal in het voorjaar/winter na de oogst.
  // Jan-Juni: oogst was het vorige jaar. Juli-Dec: deze herfst geoogst.
  if (month <= 6) return year - 1;
  return year;
}

function deriveSeason(harvestYear: number): string {
  return `${harvestYear}-${harvestYear + 1}`;
}

/**
 * Fuzzy match a parcel by parcel_hint / sub_parcel_hint / variety against
 * the user's existing parcels + sub_parcels. Returns the best match or null.
 */
async function matchParcel(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  parcelHint: string | null,
  subParcelHint: string | null,
  variety: string | null,
): Promise<{
  parcelId: string;
  subParcelId: string | null;
  parcelName: string;
  subParcelName: string | null;
} | null> {
  if (!parcelHint && !subParcelHint && !variety) return null;

  // Fetch the user's parcels + sub_parcels (not many rows usually)
  const { data: parcels } = await admin
    .from('parcels')
    .select('id, name')
    .eq('user_id', userId);
  const { data: subParcels } = await admin
    .from('sub_parcels')
    .select('id, name, parcel_id, variety')
    .eq('user_id', userId);

  if (!parcels || parcels.length === 0) return null;

  const norm = (s: string | null | undefined) =>
    (s ?? '').toLowerCase().trim().replace(/\s+/g, ' ');

  // 1) Try exact sub_parcel name match within a parcel hint.
  if (subParcelHint) {
    const spMatch = (subParcels ?? []).find(
      (sp: any) => norm(sp.name) === norm(subParcelHint),
    );
    if (spMatch) {
      const parent = parcels.find((p: any) => p.id === spMatch.parcel_id);
      if (parent) {
        return {
          parcelId: parent.id,
          subParcelId: spMatch.id,
          parcelName: parent.name,
          subParcelName: spMatch.name,
        };
      }
    }
  }

  // 2) Parcel name exact match, then optional sub_parcel match by variety.
  if (parcelHint) {
    const parcelMatch = parcels.find((p: any) => norm(p.name) === norm(parcelHint));
    if (parcelMatch) {
      // Prefer sub_parcel whose variety matches the extracted variety
      const candidates = (subParcels ?? []).filter(
        (sp: any) => sp.parcel_id === parcelMatch.id,
      );
      let sp = null;
      if (variety) {
        sp = candidates.find((c: any) => norm(c.variety) === norm(variety)) ?? null;
      }
      if (!sp && candidates.length === 1) sp = candidates[0];
      return {
        parcelId: parcelMatch.id,
        subParcelId: sp?.id ?? null,
        parcelName: parcelMatch.name,
        subParcelName: sp?.name ?? null,
      };
    }
  }

  // 3) Contains-match (e.g. parcel name "Vierwegen 7" vs hint "Vierwegen")
  if (parcelHint) {
    const hint = norm(parcelHint);
    const parcelContains = parcels.find(
      (p: any) => norm(p.name).includes(hint) || hint.includes(norm(p.name)),
    );
    if (parcelContains) {
      const candidates = (subParcels ?? []).filter(
        (sp: any) => sp.parcel_id === parcelContains.id,
      );
      let sp = null;
      if (variety) {
        sp = candidates.find((c: any) => norm(c.variety) === norm(variety)) ?? null;
      }
      if (!sp && candidates.length === 1) sp = candidates[0];
      return {
        parcelId: parcelContains.id,
        subParcelId: sp?.id ?? null,
        parcelName: parcelContains.name,
        subParcelName: sp?.name ?? null,
      };
    }
  }

  // 4) Fallback: only variety given → match first sub_parcel with that variety.
  if (variety) {
    const sp = (subParcels ?? []).find(
      (s: any) => norm(s.variety) === norm(variety),
    );
    if (sp) {
      const parent = parcels.find((p: any) => p.id === sp.parcel_id);
      if (parent) {
        return {
          parcelId: parent.id,
          subParcelId: sp.id,
          parcelName: parent.name,
          subParcelName: sp.name,
        };
      }
    }
  }

  return null;
}
