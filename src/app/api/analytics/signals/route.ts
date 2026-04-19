import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase-client';
import { runSignalEngine } from '@/lib/analytics/signals/engine';
import { buildBenchmarkSnapshot } from '@/lib/analytics/signals/benchmark-snapshot';

export async function GET() {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
    }

    const admin = getSupabaseAdmin();

    // Parallel: signals + benchmarks
    const [engineResult, benchmarks] = await Promise.all([
      runSignalEngine(admin, user.id),
      buildBenchmarkSnapshot(admin, user.id),
    ]);

    return NextResponse.json({
      signals: engineResult.signals,
      stats: engineResult.stats,
      benchmarks,
      generatedAt: engineResult.generatedAt,
    });
  } catch (err: any) {
    console.error('Signals route error:', err);
    return NextResponse.json(
      { error: err.message || 'Fout bij genereren aandachtspunten' },
      { status: 500 }
    );
  }
}
