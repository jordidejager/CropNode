import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/cron/reminders
 * Cron job that marks due reminders as sent.
 * For now: sets is_reminder_sent = true so the UI can show a badge.
 * Later: can trigger WhatsApp/push notifications.
 * Schedule: every 15 minutes (see vercel.json)
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Find all notes where reminder_at <= now AND is_reminder_sent = false
    const now = new Date().toISOString();
    const { data: dueReminders, error } = await supabase
      .from('field_notes')
      .select('id, user_id, content, due_date, reminder_at')
      .lte('reminder_at', now)
      .eq('is_reminder_sent', false)
      .eq('status', 'open')
      .limit(100);

    if (error) {
      console.error('[reminders cron] Query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!dueReminders || dueReminders.length === 0) {
      return NextResponse.json({ success: true, processed: 0 });
    }

    // Mark all as sent
    const ids = dueReminders.map(r => r.id);
    const { error: updateError } = await supabase
      .from('field_notes')
      .update({ is_reminder_sent: true })
      .in('id', ids);

    if (updateError) {
      console.error('[reminders cron] Update error:', updateError);
    }

    console.log(`[reminders cron] Processed ${ids.length} reminders`);

    return NextResponse.json({
      success: true,
      processed: ids.length,
    });
  } catch (error) {
    console.error('[reminders cron] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
