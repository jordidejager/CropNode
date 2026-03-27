/**
 * Debug endpoint for WhatsApp bot — TEMPORARY.
 * Tests each step of the pipeline to find where it fails.
 * Remove after debugging is complete.
 */

import { sendTextMessage } from '@/lib/whatsapp/client';
import { getUserIdByPhone, getSprayableParcelsForUser } from '@/lib/whatsapp/store';
import { stripPlus, addPlus } from '@/lib/whatsapp/phone-utils';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const phone = searchParams.get('phone') || '';
  const steps: Array<{ step: string; result: string; ok: boolean }> = [];

  // Step 1: Check env vars
  const envVars = {
    WHATSAPP_PHONE_NUMBER_ID: !!process.env.WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_ACCESS_TOKEN: !!process.env.WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_APP_SECRET: !!process.env.WHATSAPP_APP_SECRET,
    WHATSAPP_VERIFY_TOKEN: !!process.env.WHATSAPP_VERIFY_TOKEN,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    GOOGLE_API_KEY: !!process.env.GOOGLE_API_KEY,
  };
  const allEnvSet = Object.values(envVars).every(Boolean);
  steps.push({
    step: '1. Environment variables',
    result: JSON.stringify(envVars),
    ok: allEnvSet,
  });

  if (!phone) {
    return Response.json({
      message: 'Voeg ?phone=31612345678 toe aan de URL om te testen',
      steps,
    });
  }

  // Step 2: Phone normalization
  const e164 = addPlus(phone);
  const metaFormat = stripPlus(phone);
  steps.push({
    step: '2. Phone normalization',
    result: `Input: "${phone}" → E.164: "${e164}" → Meta: "${metaFormat}"`,
    ok: true,
  });

  // Step 3: User lookup
  try {
    const userId = await getUserIdByPhone(phone);
    steps.push({
      step: '3. User lookup (whatsapp_linked_numbers)',
      result: userId ? `Found user: ${userId}` : 'NOT FOUND — nummer niet gekoppeld!',
      ok: !!userId,
    });

    if (userId) {
      // Step 4: Parcels lookup
      try {
        const parcels = await getSprayableParcelsForUser(userId);
        steps.push({
          step: '4. Parcels for user',
          result: `${parcels.length} percelen gevonden: ${parcels.slice(0, 3).map(p => p.name).join(', ')}${parcels.length > 3 ? '...' : ''}`,
          ok: parcels.length > 0,
        });
      } catch (e: any) {
        steps.push({
          step: '4. Parcels for user',
          result: `ERROR: ${e.message}`,
          ok: false,
        });
      }

      // Step 5: Try sending a test message
      const testParam = searchParams.get('send');
      if (testParam === 'yes') {
        try {
          const msgId = await sendTextMessage(metaFormat, '🧪 CropNode WhatsApp test — dit is een testbericht!');
          steps.push({
            step: '5. Send test message',
            result: `Verzonden! Message ID: ${msgId}`,
            ok: true,
          });
        } catch (e: any) {
          steps.push({
            step: '5. Send test message',
            result: `FAILED: ${e.message}`,
            ok: false,
          });
        }
      } else {
        steps.push({
          step: '5. Send test message',
          result: 'Voeg &send=yes toe om een testbericht te versturen',
          ok: true,
        });
      }
    }
  } catch (e: any) {
    steps.push({
      step: '3. User lookup',
      result: `ERROR: ${e.message}`,
      ok: false,
    });
  }

  return Response.json({ phone, steps }, { status: 200 });
}
