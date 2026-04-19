/**
 * Auto-setup endpoint for disease pressure pages.
 *
 * When a user visits /ziektedruk/appelschurft or /ziektedruk/zwartvruchtrot,
 * this endpoint:
 * 1. Finds or auto-creates the config for the parcel's station
 * 2. Derives the biofix date from phenology_reference (bloom date - offset)
 *    - apple_scab: bloom - 22 days (green tip)
 *    - black_rot: bloom + 7 days (petal fall)
 * 3. Runs the simulation
 * 4. Returns the full results
 *
 * User never needs to manually set biofix — they just visit the page.
 */

import { createClient } from '@/lib/supabase/server';
import {
  apiSuccess,
  apiError,
  ErrorCodes,
  handleUnknownError,
} from '@/lib/api-utils';
import {
  getConfig,
  upsertConfig,
  calculateDiseaseResults,
} from '@/lib/disease-models/disease-service';
import { calculateBlackRotResults } from '@/lib/disease-models/black-rot/service';
import type { DiseaseType } from '@/lib/disease-models/types';

// Days relative to full bloom (bloom_date_f2)
const BIOFIX_OFFSETS: Record<DiseaseType, number> = {
  apple_scab: -22, // green tip ≈ bloom - 22 days
  black_rot: 7, // petal fall ≈ bloom + 7 days
};

// Fallback bloom dates when phenology_reference has no entry
const FALLBACK_BLOOMS: Record<number, string> = {
  2024: '2024-04-03',
  2025: '2025-04-11',
  2026: '2026-04-08',
};

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return apiError('Unauthorized', ErrorCodes.UNAUTHORIZED, 401);

    const body = await request.json();
    const parcelId = body.parcel_id as string;
    const harvestYear = body.harvest_year as number;
    const diseaseType = (body.disease_type as DiseaseType) ?? 'apple_scab';

    if (!parcelId || !harvestYear) {
      return apiError(
        'parcel_id and harvest_year required',
        ErrorCodes.VALIDATION_ERROR,
        400
      );
    }

    // 1. Check existing config
    let config = await getConfig(parcelId, harvestYear, supabase, diseaseType);

    // 2. If no config → create one with auto-biofix
    if (!config) {
      // Get bloom date from phenology_reference (or fallback)
      let bloomDate: string | null = null;

      const { data: pheno } = await supabase
        .from('phenology_reference')
        .select('bloom_date_f2')
        .eq('year', harvestYear)
        .maybeSingle();

      if (pheno?.bloom_date_f2) {
        bloomDate = pheno.bloom_date_f2 as string;
      } else {
        bloomDate = FALLBACK_BLOOMS[harvestYear] ?? null;
      }

      if (!bloomDate) {
        return apiError(
          `Geen bloeidatum bekend voor ${harvestYear}. Voeg fenologie-data toe.`,
          ErrorCodes.VALIDATION_ERROR,
          400
        );
      }

      const biofixDate = addDays(bloomDate, BIOFIX_OFFSETS[diseaseType]);

      config = await upsertConfig(
        user.id,
        parcelId,
        harvestYear,
        biofixDate,
        'medium', // default inoculum pressure
        supabase,
        diseaseType
      );
    }

    // 3. Run simulation
    const result =
      diseaseType === 'black_rot'
        ? await calculateBlackRotResults(config, supabase)
        : await calculateDiseaseResults(config, supabase);

    return apiSuccess(result);
  } catch (error) {
    return handleUnknownError(error, 'auto-setup POST');
  }
}
