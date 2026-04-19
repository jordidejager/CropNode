import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase-client';

interface MarginCell {
  subParcelId: string;
  parcelName: string;      // hoofdperceel
  subParcelName: string;
  fullName: string;        // "Hoofd — Sub"
  variety: string;
  hectares: number;
  harvestYear: number;
  inputCost: number;
  totalKg: number;
  estimatedRevenue: number;
  estimatedMargin: number;
  marginPerHa: number;
  hasYieldData: boolean;
  hasCostData: boolean;
}

// Defaults voor marktprijs per kg (indicatief, teler zou eigen prijzen moeten instellen)
const DEFAULT_PRICES_EUR_PER_KG: Record<string, number> = {
  conference: 0.65,
  elstar: 0.50,
  jonagold: 0.45,
  kanzi: 0.85,
  junami: 0.85,
  doyenne: 0.75,
  default: 0.55,
};

function getDefaultPrice(variety: string): number {
  if (!variety) return DEFAULT_PRICES_EUR_PER_KG.default;
  const v = variety.toLowerCase();
  for (const [key, price] of Object.entries(DEFAULT_PRICES_EUR_PER_KG)) {
    if (v.includes(key)) return price;
  }
  return DEFAULT_PRICES_EUR_PER_KG.default;
}

export async function GET() {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const admin = getSupabaseAdmin();

    const [parcelsRes, subParcelsRes, parcelHistoryRes, productionRes, harvestsRes] = await Promise.all([
      admin.from('parcels').select('id, name').eq('user_id', user.id),
      admin.from('sub_parcels').select('id, parcel_id, name, crop, variety, area').eq('user_id', user.id),
      admin.from('parcel_history').select('parcel_name, dosage, unit_price, harvest_year').eq('user_id', user.id),
      admin.from('production_summaries').select('sub_parcel_id, total_kg, hectares, variety, harvest_year').eq('user_id', user.id),
      admin.from('harvest_registrations').select('sub_parcel_id, total_crates, weight_per_crate, quality_class, harvest_year').eq('user_id', user.id),
    ]);

    const parcels = (parcelsRes.data || []) as Array<{ id: string; name: string }>;
    const subParcels = (subParcelsRes.data || []) as Array<{
      id: string; parcel_id: string; name: string; crop: string; variety: string; area: number;
    }>;
    const parcelHistory = (parcelHistoryRes.data || []) as Array<{
      parcel_name: string; dosage: number; unit_price: number | null; harvest_year: number;
    }>;
    const production = (productionRes.data || []) as Array<{
      sub_parcel_id: string | null; total_kg: number; hectares: number | null;
      variety: string; harvest_year: number;
    }>;
    const harvests = (harvestsRes.data || []) as Array<{
      sub_parcel_id: string | null; total_crates: number; weight_per_crate: number | null;
      quality_class: string | null; harvest_year: number;
    }>;

    const parcelMap = new Map(parcels.map((p) => [p.id, p.name]));

    // Kosten per subperceel per jaar (parcel_history matcht op NAAM van subperceel via plots array → parcel_name)
    const costByNameYear = new Map<string, number>();
    parcelHistory.forEach((h) => {
      if (!h.parcel_name || !h.harvest_year || h.unit_price == null) return;
      const cost = (h.unit_price || 0) * (h.dosage || 0);
      const key = `${h.parcel_name}|${h.harvest_year}`;
      costByNameYear.set(key, (costByNameYear.get(key) || 0) + cost);
    });

    // Opbrengst per subperceel per jaar — eerst uit production_summaries, dan aanvullen via harvest_registrations
    const yieldBySpYear = new Map<string, { totalKg: number; hectares: number }>();
    production.forEach((p) => {
      if (!p.sub_parcel_id || !p.total_kg) return;
      const key = `${p.sub_parcel_id}|${p.harvest_year}`;
      yieldBySpYear.set(key, {
        totalKg: p.total_kg,
        hectares: p.hectares && p.hectares > 0 ? p.hectares : 0,
      });
    });
    // Aggregeer harvest_registrations per sp/year
    const harvestAgg = new Map<string, number>();
    harvests.forEach((h) => {
      if (!h.sub_parcel_id || !h.total_crates) return;
      const key = `${h.sub_parcel_id}|${h.harvest_year}`;
      const wpc = h.weight_per_crate || 18;
      harvestAgg.set(key, (harvestAgg.get(key) || 0) + h.total_crates * wpc);
    });
    harvestAgg.forEach((kg, key) => {
      if (yieldBySpYear.has(key)) return; // production summary heeft voorrang
      const [spId] = key.split('|');
      const sp = subParcels.find((s) => s.id === spId);
      if (!sp) return;
      yieldBySpYear.set(key, { totalKg: kg, hectares: sp.area || 0 });
    });

    // Verzamel alle relevante jaren
    const yearsSet = new Set<number>();
    parcelHistory.forEach((h) => yearsSet.add(h.harvest_year));
    production.forEach((p) => yearsSet.add(p.harvest_year));
    harvests.forEach((h) => yearsSet.add(h.harvest_year));
    const years = [...yearsSet].filter((y) => y && y > 2015).sort((a, b) => b - a);

    // Matrix bouwen: één cel per (subperceel × jaar)
    const cells: MarginCell[] = [];

    subParcels.forEach((sp) => {
      const parcelName = parcelMap.get(sp.parcel_id) || 'Onbekend';
      const fullName = parcelName.toLowerCase() === sp.name.toLowerCase()
        ? parcelName
        : `${parcelName} — ${sp.name}`;

      years.forEach((y) => {
        const costKey = `${sp.name}|${y}`;
        const yieldKey = `${sp.id}|${y}`;
        const inputCost = costByNameYear.get(costKey) || 0;
        const yieldData = yieldBySpYear.get(yieldKey);
        const totalKg = yieldData?.totalKg || 0;
        const hectares = yieldData?.hectares || sp.area || 0;
        const pricePerKg = getDefaultPrice(sp.variety);
        const estimatedRevenue = totalKg * pricePerKg;
        const estimatedMargin = estimatedRevenue - inputCost;
        const marginPerHa = hectares > 0 ? estimatedMargin / hectares : 0;

        // Alleen cell opnemen als er data is
        if (inputCost === 0 && totalKg === 0) return;

        cells.push({
          subParcelId: sp.id,
          parcelName,
          subParcelName: sp.name,
          fullName,
          variety: sp.variety,
          hectares: sp.area || 0,
          harvestYear: y,
          inputCost: Math.round(inputCost),
          totalKg: Math.round(totalKg),
          estimatedRevenue: Math.round(estimatedRevenue),
          estimatedMargin: Math.round(estimatedMargin),
          marginPerHa: Math.round(marginPerHa),
          hasYieldData: totalKg > 0,
          hasCostData: inputCost > 0,
        });
      });
    });

    // Ranglijst per jaar (rendabelste + minst rendabel)
    const rankingByYear = new Map<number, MarginCell[]>();
    cells.forEach((c) => {
      if (!c.hasYieldData || !c.hasCostData) return;
      if (!rankingByYear.has(c.harvestYear)) rankingByYear.set(c.harvestYear, []);
      rankingByYear.get(c.harvestYear)!.push(c);
    });
    rankingByYear.forEach((list) => list.sort((a, b) => b.marginPerHa - a.marginPerHa));

    // Bedrijfstotaal per jaar
    const totalsByYear = new Map<number, {
      totalCost: number; totalRevenue: number; totalMargin: number;
      totalHa: number; marginPerHa: number; parcelsWithData: number;
    }>();
    cells.forEach((c) => {
      if (!c.hasYieldData || !c.hasCostData) return;
      if (!totalsByYear.has(c.harvestYear)) {
        totalsByYear.set(c.harvestYear, { totalCost: 0, totalRevenue: 0, totalMargin: 0, totalHa: 0, marginPerHa: 0, parcelsWithData: 0 });
      }
      const t = totalsByYear.get(c.harvestYear)!;
      t.totalCost += c.inputCost;
      t.totalRevenue += c.estimatedRevenue;
      t.totalMargin += c.estimatedMargin;
      t.totalHa += c.hectares;
      t.parcelsWithData += 1;
    });
    totalsByYear.forEach((t) => {
      t.marginPerHa = t.totalHa > 0 ? Math.round(t.totalMargin / t.totalHa) : 0;
    });

    // Lekdetector: cellen met negatieve marge of kosten > 1.5× bedrijfsgemiddelde per jaar
    const costLeaks: Array<{ cell: MarginCell; reason: string }> = [];
    totalsByYear.forEach((t, year) => {
      const cellsThisYear = cells.filter((c) => c.harvestYear === year && c.hasCostData);
      const avgCostPerHa = t.totalHa > 0 ? t.totalCost / t.totalHa : 0;
      cellsThisYear.forEach((c) => {
        if (c.hasYieldData && c.estimatedMargin < 0) {
          costLeaks.push({
            cell: c,
            reason: `Negatieve marge: kosten €${c.inputCost} vs geschatte omzet €${c.estimatedRevenue}`,
          });
        } else if (c.hectares > 0 && avgCostPerHa > 0 && (c.inputCost / c.hectares) > avgCostPerHa * 1.5) {
          const pct = Math.round(((c.inputCost / c.hectares) / avgCostPerHa - 1) * 100);
          costLeaks.push({
            cell: c,
            reason: `Kosten €${Math.round(c.inputCost / c.hectares)}/ha — ${pct}% boven bedrijfsgemiddelde`,
          });
        }
      });
    });

    return NextResponse.json({
      cells,
      years,
      totalsByYear: Object.fromEntries(totalsByYear),
      costLeaks: costLeaks.slice(0, 10),
      rankings: Object.fromEntries(
        [...rankingByYear.entries()].map(([y, list]) => [y, { top: list.slice(0, 3), bottom: list.slice(-3).reverse() }])
      ),
      priceHints: DEFAULT_PRICES_EUR_PER_KG,
      note: 'Marktprijzen zijn indicatief. Voor accurate marges kunnen eigen prijzen worden ingesteld.',
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Rendement error:', err);
    return NextResponse.json({ error: err.message || 'Fout' }, { status: 500 });
  }
}
