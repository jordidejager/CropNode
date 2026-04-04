/**
 * POST /api/spuitschrift/hide-product
 *
 * Hides or unhides a single product from a spuitschrift entry.
 * When hidden:
 *   - Product moved from `products` to `hidden_products` JSONB
 *   - parcel_history rows for that product are deleted
 *   - inventory_movements for that product are reversed
 * When unhidden:
 *   - Product moved back from `hidden_products` to `products`
 *   - parcel_history rows re-created
 *   - inventory_movements re-created
 *
 * Body: { spuitschriftId: string, productName: string, hide: boolean }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

async function getAuthUser(supabase: SupabaseClient) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (user) return user;
  if (error) console.warn('[hide-product] getUser() failed:', error.message);
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const user = await getAuthUser(supabase);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { spuitschriftId, productName, hide } = await request.json();
    if (!spuitschriftId || !productName || typeof hide !== 'boolean') {
      return NextResponse.json({ error: 'Missing spuitschriftId, productName, or hide' }, { status: 400 });
    }

    // 1. Fetch the spuitschrift entry (verify ownership)
    const { data: entry, error: fetchErr } = await supabase
      .from('spuitschrift')
      .select('id, products, hidden_products, plots, user_id, date')
      .eq('id', spuitschriftId)
      .eq('user_id', user.id)
      .single();

    if (fetchErr || !entry) {
      return NextResponse.json({ error: 'Spuitschrift entry niet gevonden' }, { status: 404 });
    }

    const products: any[] = entry.products || [];
    const hiddenProducts: any[] = entry.hidden_products || [];

    if (hide) {
      // --- HIDE PRODUCT ---
      const productIndex = products.findIndex((p: any) => p.product === productName);
      if (productIndex === -1) {
        return NextResponse.json({ error: `Product "${productName}" niet gevonden` }, { status: 404 });
      }

      // Move product from products → hidden_products
      const [removedProduct] = products.splice(productIndex, 1);
      hiddenProducts.push(removedProduct);

      // Update spuitschrift
      await supabase
        .from('spuitschrift')
        .update({ products, hidden_products: hiddenProducts })
        .eq('id', spuitschriftId);

      // Delete parcel_history rows for this product
      await supabase
        .from('parcel_history')
        .delete()
        .eq('spuitschrift_id', spuitschriftId)
        .eq('product', productName);

      // Reverse inventory movements for this product from this entry
      await supabase
        .from('inventory_movements')
        .delete()
        .eq('reference_id', spuitschriftId)
        .eq('product_name', productName);

    } else {
      // --- UNHIDE PRODUCT ---
      const hiddenIndex = hiddenProducts.findIndex((p: any) => p.product === productName);
      if (hiddenIndex === -1) {
        return NextResponse.json({ error: `Verborgen product "${productName}" niet gevonden` }, { status: 404 });
      }

      // Move product from hidden_products → products
      const [restoredProduct] = hiddenProducts.splice(hiddenIndex, 1);
      products.push(restoredProduct);

      // Update spuitschrift
      await supabase
        .from('spuitschrift')
        .update({ products, hidden_products: hiddenProducts })
        .eq('id', spuitschriftId);

      // Re-create parcel_history rows
      const { data: subParcels } = await supabase
        .from('v_sprayable_parcels')
        .select('id, name, crop, variety, area')
        .eq('user_id', user.id)
        .in('id', entry.plots || []);

      for (const sp of (subParcels ?? [])) {
        await supabase.from('parcel_history').insert({
          id: `restored-${Date.now()}-${sp.id}-${productName}`,
          spuitschrift_id: spuitschriftId,
          parcel_id: sp.id,
          parcel_name: sp.name || '',
          crop: sp.crop || '',
          variety: sp.variety || '',
          product: productName,
          dosage: restoredProduct.dosage,
          unit: restoredProduct.unit,
          date: entry.date || new Date().toISOString(),
          user_id: user.id,
        } as any);
      }

      // Re-create inventory movement
      const totalArea = (subParcels ?? []).reduce((sum: number, sp: any) => sum + (sp.area || 0), 0);
      const quantity = -(restoredProduct.dosage * totalArea);
      if (quantity !== 0) {
        await supabase.from('inventory_movements').insert({
          product_name: productName,
          quantity,
          unit: restoredProduct.unit?.replace('/ha', '') || 'L',
          type: 'usage',
          date: entry.date || new Date().toISOString(),
          description: `Hersteld: ${productName}`,
          reference_id: spuitschriftId,
          user_id: user.id,
        } as any);
      }
    }

    return NextResponse.json({
      success: true,
      products,
      hidden_products: hiddenProducts,
    });
  } catch (error) {
    console.error('[hide-product] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Onbekende fout' },
      { status: 500 }
    );
  }
}
