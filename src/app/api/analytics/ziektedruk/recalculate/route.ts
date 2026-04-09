import { createClient } from '@/lib/supabase/server';
import {
  apiSuccess,
  apiError,
  ErrorCodes,
  handleUnknownError,
  validateBody,
} from '@/lib/api-utils';
import { z } from 'zod';
import {
  getConfig,
  calculateAndCache,
} from '@/lib/disease-models/disease-service';

const RecalculateSchema = z.object({
  parcel_id: z.string().min(1, 'parcel_id is required'),
  harvest_year: z.number().int().min(2020).max(2100),
});

/**
 * POST /api/analytics/ziektedruk/recalculate
 *
 * Force a fresh calculation of disease model results.
 * Ignores cache and recalculates from weather data.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return apiError('Unauthorized', ErrorCodes.UNAUTHORIZED, 401);

    const body = await validateBody(request, RecalculateSchema);

    const config = await getConfig(
      body.parcel_id,
      body.harvest_year,
      supabase
    );

    if (!config) {
      return apiError(
        'Geen configuratie gevonden. Stel eerst de biofix-datum in.',
        ErrorCodes.NOT_FOUND,
        404
      );
    }

    const result = await calculateAndCache(config, supabase);

    return apiSuccess(result);
  } catch (error) {
    return handleUnknownError(error, 'ziektedruk recalculate POST');
  }
}
