import { createClient } from '@/lib/supabase/server';
import {
  apiSuccess,
  apiError,
  ErrorCodes,
  handleUnknownError,
} from '@/lib/api-utils';
import {
  getConfig,
  getCachedOrCalculate,
  calculateAndCache,
} from '@/lib/disease-models/disease-service';
import type { ZiektedrukNotConfigured } from '@/lib/disease-models/types';

/**
 * GET /api/analytics/ziektedruk?parcel_id=xxx&harvest_year=2026
 *
 * Returns disease pressure results for a parcel and harvest year.
 * If no config exists, returns { configured: false }.
 * If config exists, returns cached results or recalculates if stale.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      // Fallback: try session (getUser can fail on edge cases with expired tokens)
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        return apiError('Unauthorized', ErrorCodes.UNAUTHORIZED, 401);
      }
    }

    const { searchParams } = new URL(request.url);
    const parcelId = searchParams.get('parcel_id');
    const harvestYearStr = searchParams.get('harvest_year');

    if (!parcelId || !harvestYearStr) {
      return apiError(
        'parcel_id and harvest_year are required',
        ErrorCodes.VALIDATION_ERROR,
        400
      );
    }

    const harvestYear = parseInt(harvestYearStr, 10);
    if (isNaN(harvestYear)) {
      return apiError(
        'harvest_year must be a number',
        ErrorCodes.VALIDATION_ERROR,
        400
      );
    }

    // Check if config exists
    const config = await getConfig(parcelId, harvestYear, supabase);

    if (!config) {
      const response: ZiektedrukNotConfigured = { configured: false };
      return apiSuccess(response);
    }

    // Force recalculate if requested, otherwise use cache
    const force = searchParams.get('force') === '1';
    const result = force
      ? await calculateAndCache(config, supabase)
      : await getCachedOrCalculate(config, supabase);

    return apiSuccess(result);
  } catch (error) {
    return handleUnknownError(error, 'ziektedruk GET');
  }
}
