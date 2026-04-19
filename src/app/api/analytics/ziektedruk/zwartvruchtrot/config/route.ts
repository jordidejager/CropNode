import { createClient } from '@/lib/supabase/server';
import {
  apiSuccess,
  apiError,
  ErrorCodes,
  handleUnknownError,
} from '@/lib/api-utils';
import { upsertConfig } from '@/lib/disease-models/disease-service';
import { calculateBlackRotResults } from '@/lib/disease-models/black-rot/service';
import { z } from 'zod';

const ConfigSchema = z.object({
  parcel_id: z.string().min(1),
  harvest_year: z.number().int(),
  biofix_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  inoculum_pressure: z.enum(['low', 'medium', 'high']).optional(),
});

/**
 * POST /api/analytics/ziektedruk/zwartvruchtrot/config
 * { parcel_id, harvest_year, biofix_date, inoculum_pressure? }
 *
 * Sets the black rot model config and returns fresh simulation results.
 * biofix_date should be petal fall (mid-to-late April typically).
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return apiError('Unauthorized', ErrorCodes.UNAUTHORIZED, 401);

    const body = await request.json();
    const parsed = ConfigSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        'Invalid request body',
        ErrorCodes.VALIDATION_ERROR,
        400,
        { issues: parsed.error.issues }
      );
    }

    const config = await upsertConfig(
      user.id,
      parsed.data.parcel_id,
      parsed.data.harvest_year,
      parsed.data.biofix_date,
      parsed.data.inoculum_pressure ?? 'medium',
      supabase,
      'black_rot'
    );

    const result = await calculateBlackRotResults(config, supabase);
    return apiSuccess(result);
  } catch (error) {
    return handleUnknownError(error, 'zwartvruchtrot config POST');
  }
}
