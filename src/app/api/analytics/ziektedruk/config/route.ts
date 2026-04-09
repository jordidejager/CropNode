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
  upsertConfig,
  calculateAndCache,
} from '@/lib/disease-models/disease-service';

const ConfigSchema = z.object({
  parcel_id: z.string().min(1, 'parcel_id is required'),
  harvest_year: z.number().int().min(2020).max(2100),
  biofix_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'biofix_date must be YYYY-MM-DD'),
  inoculum_pressure: z
    .enum(['low', 'medium', 'high'])
    .default('medium'),
});

/**
 * POST /api/analytics/ziektedruk/config
 *
 * Create or update disease model configuration for a parcel.
 * Triggers a full recalculation after saving.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return apiError('Unauthorized', ErrorCodes.UNAUTHORIZED, 401);

    const body = await validateBody(request, ConfigSchema);

    // Upsert config
    const config = await upsertConfig(
      user.id,
      body.parcel_id,
      body.harvest_year,
      body.biofix_date,
      body.inoculum_pressure ?? 'medium',
      supabase
    );

    // Trigger recalculation with new config
    const result = await calculateAndCache(config, supabase);

    return apiSuccess(result, 200);
  } catch (error) {
    return handleUnknownError(error, 'ziektedruk config POST');
  }
}
