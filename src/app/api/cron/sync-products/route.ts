import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/cron/sync-products?source=ctgb|fertilizer|all
 *
 * Cron job that syncs the unified products table from source tables.
 * - CTGB: weekly (maandag 03:00)
 * - Fertilizer: monthly (1e van de maand 04:00)
 *
 * Secured with CRON_SECRET environment variable.
 * See vercel.json for schedule config.
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source') || 'all';

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Create sync log
    const { data: logData } = await supabase
      .from('sync_log')
      .insert({
        source,
        started_at: new Date().toISOString(),
        status: 'running',
        triggered_by: 'cron',
      })
      .select('id')
      .single();
    const syncLogId = logData?.id;

    let updated = 0;
    let withdrawn = 0;
    const errors: Array<{ message: string }> = [];

    // Sync CTGB → products
    if (source === 'ctgb' || source === 'all') {
      const result = await syncCtgbToProducts(supabase);
      updated += result.updated;
      withdrawn += result.withdrawn;
      errors.push(...result.errors);
    }

    // Sync fertilizers → products
    if (source === 'fertilizer' || source === 'all') {
      const result = await syncFertilizersToProducts(supabase);
      updated += result.updated;
      errors.push(...result.errors);
    }

    // Update sync log
    if (syncLogId) {
      await supabase
        .from('sync_log')
        .update({
          completed_at: new Date().toISOString(),
          status: errors.length > 0 ? 'partial' : 'success',
          products_updated: updated,
          products_withdrawn: withdrawn,
          errors,
          summary: `Synced ${updated} products, ${withdrawn} withdrawn, ${errors.length} errors`,
        })
        .eq('id', syncLogId);
    }

    return NextResponse.json({
      success: true,
      source,
      updated,
      withdrawn,
      errors: errors.length,
      syncLogId,
    });
  } catch (error: any) {
    console.error('Sync products cron error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

async function syncCtgbToProducts(supabase: any) {
  const stats = { updated: 0, withdrawn: 0, errors: [] as Array<{ message: string }> };

  // Fetch all CTGB in batches
  const all: any[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from('ctgb_products')
      .select('toelatingsnummer, naam, product_types, status, search_keywords')
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }

  // Upsert to products table
  for (let i = 0; i < all.length; i += 100) {
    const batch = all.slice(i, i + 100);
    const rows = batch.map((cp: any) => ({
      name: cp.naam,
      product_type: (cp.product_types?.[0] || 'gewasbescherming').toLowerCase(),
      source: 'ctgb',
      source_id: cp.toelatingsnummer,
      status: cp.status === 'Valid' ? 'active' : 'expired',
      search_keywords: cp.search_keywords || [],
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('products')
      .upsert(rows, { onConflict: 'source,source_id' });

    if (error) {
      stats.errors.push({ message: `CTGB batch ${i}: ${error.message}` });
    } else {
      stats.updated += batch.length;
    }
  }

  return stats;
}

async function syncFertilizersToProducts(supabase: any) {
  const stats = { updated: 0, errors: [] as Array<{ message: string }> };

  const all: any[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from('fertilizers')
      .select('id, name, category, search_keywords')
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }

  const mapCat = (c: string) => {
    switch (c) {
      case 'Leaf': return 'bladmeststof';
      case 'Soil': return 'strooimeststof';
      case 'Fertigation': return 'fertigatiemeststof';
      default: return 'meststof';
    }
  };

  for (let i = 0; i < all.length; i += 100) {
    const batch = all.slice(i, i + 100);
    const rows = batch.map((f: any) => ({
      name: f.name,
      product_type: mapCat(f.category),
      source: 'fertilizer',
      source_id: f.id,
      status: 'active',
      search_keywords: f.search_keywords || [],
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('products')
      .upsert(rows, { onConflict: 'source,source_id' });

    if (error) {
      stats.errors.push({ message: `Fertilizer batch ${i}: ${error.message}` });
    } else {
      stats.updated += batch.length;
    }
  }

  return stats;
}
