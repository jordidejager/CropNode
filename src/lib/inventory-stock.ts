/**
 * Server-side stock levels per product for one user (admin client + explicit user_id).
 * Same aggregation as the client hook useStockOverview in src/hooks/use-data.ts.
 */

import { getSupabaseAdmin } from '@/lib/supabase-client';

export interface StockLevel {
  productName: string;
  stock: number;
  unit: string;
  lastMovement: Date | null;
}

export async function getStockForUser(userId: string): Promise<StockLevel[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('inventory_movements')
    .select('product_name, quantity, unit, date')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(5000);

  if (error || !data) return [];

  const byProduct = new Map<string, StockLevel>();
  for (const row of data) {
    const name = (row.product_name || '').trim();
    if (!name) continue;
    const existing = byProduct.get(name);
    const date = row.date ? new Date(row.date) : null;
    if (existing) {
      existing.stock += Number(row.quantity) || 0;
      if (!existing.unit && row.unit) existing.unit = row.unit;
    } else {
      byProduct.set(name, { productName: name, stock: Number(row.quantity) || 0, unit: row.unit || '', lastMovement: date });
    }
  }
  return [...byProduct.values()].sort((a, b) => a.productName.localeCompare(b.productName, 'nl'));
}
