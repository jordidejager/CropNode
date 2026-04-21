import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase-client';
import { resolveUser } from '@/lib/analytics/auth-helper';

function deriveHarvestYear(now: Date): number {
  const month = now.getMonth() + 1;
  return month >= 11 ? now.getFullYear() + 1 : now.getFullYear();
}

// N gewasbehoefte per ras-type (indicatief, kg N/ha/jaar voor volgroeide boomgaard)
const N_REQUIREMENT_KG_HA: Record<string, number> = {
  conference: 80,
  elstar: 75,
  jonagold: 85,
  kanzi: 80,
  default: 80,
};

function getNRequirement(variety: string): number {
  const v = variety.toLowerCase();
  for (const [k, req] of Object.entries(N_REQUIREMENT_KG_HA)) {
    if (v.includes(k)) return req;
  }
  return N_REQUIREMENT_KG_HA.default;
}

export async function GET() {
  try {
    const supabase = await createServerClient();
    const user = await resolveUser(supabase);
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const admin = getSupabaseAdmin();
    const now = new Date();
    const harvestYear = deriveHarvestYear(now);

    const [parcelsRes, subParcelsRes, spuitRes, parcelHistRes, soilRes, diseaseCfgRes] = await Promise.all([
      admin.from('parcels').select('id, name').eq('user_id', user.id),
      admin.from('sub_parcels').select('id, parcel_id, name, crop, variety, area').eq('user_id', user.id),
      admin.from('spuitschrift')
        .select('id, date, plots, products, registration_type, harvest_year')
        .eq('user_id', user.id)
        .eq('harvest_year', harvestYear),
      admin.from('parcel_history')
        .select('parcel_name, product, dosage, unit, unit_price, harvest_year, registration_type, date')
        .eq('user_id', user.id)
        .eq('harvest_year', harvestYear),
      admin.from('soil_analyses')
        .select('parcel_id, sub_parcel_id, n_leverend_vermogen_kg_ha, datum_monstername')
        .eq('user_id', user.id)
        .order('datum_monstername', { ascending: false }),
      admin.from('disease_model_config')
        .select('id, parcel_id')
        .eq('user_id', user.id)
        .eq('harvest_year', harvestYear),
    ]);

    const parcels = (parcelsRes.data || []) as Array<{ id: string; name: string }>;
    const subParcels = (subParcelsRes.data || []) as Array<{
      id: string; parcel_id: string; name: string; crop: string; variety: string; area: number;
    }>;
    const spuitRows = (spuitRes.data || []) as any[];
    const parcelHist = (parcelHistRes.data || []) as any[];
    const soilRows = (soilRes.data || []) as any[];
    const diseaseCfg = (diseaseCfgRes.data || []) as any[];

    const parcelMap = new Map(parcels.map((p) => [p.id, p.name]));

    // --- 1. SPUIT-RENDEMENT-MATRIX: per product ---
    const productStats = new Map<string, {
      product: string;
      applications: number;
      totalCost: number;
      totalDosage: number;
      unit: string;
      datesByParcel: Map<string, string[]>;
    }>();

    spuitRows.forEach((r) => {
      const products = Array.isArray(r.products) ? r.products : [];
      products.forEach((p: any) => {
        if (!p.product) return;
        if (!productStats.has(p.product)) {
          productStats.set(p.product, {
            product: p.product,
            applications: 0,
            totalCost: 0,
            totalDosage: 0,
            unit: p.unit || '',
            datesByParcel: new Map(),
          });
        }
        const entry = productStats.get(p.product)!;
        entry.applications += 1;
        entry.totalDosage += p.dosage || 0;
        entry.totalCost += (p.unit_price || 0) * (p.dosage || 0);
        (r.plots || []).forEach((plot: string) => {
          if (!entry.datesByParcel.has(plot)) entry.datesByParcel.set(plot, []);
          entry.datesByParcel.get(plot)!.push(r.date);
        });
      });
    });

    // Haal CTGB details op voor actieve stoffen
    const productNames = [...productStats.keys()];
    let ctgbDetails: any[] = [];
    if (productNames.length > 0) {
      const { data } = await admin
        .from('ctgb_products')
        .select('naam, werkzame_stoffen, categorie')
        .in('naam', productNames);
      ctgbDetails = data || [];
    }

    const productList = [...productStats.values()]
      .map((p) => {
        const ctgb = ctgbDetails.find((c) => c.naam === p.product);
        const activeSubstances = ctgb?.werkzame_stoffen || [];
        return {
          product: p.product,
          applications: p.applications,
          totalCost: Math.round(p.totalCost),
          totalDosage: Math.round(p.totalDosage * 100) / 100,
          unit: p.unit,
          avgCostPerApp: p.applications > 0 ? Math.round(p.totalCost / p.applications) : 0,
          activeSubstances,
          category: ctgb?.categorie || 'overig',
          parcelCount: p.datesByParcel.size,
        };
      })
      .sort((a, b) => b.totalCost - a.totalCost);

    // --- 2. BEMESTINGSBALANS per subperceel ---
    // Voor elk subperceel: aanvoer N uit bemesting (blad + strooi) + bodemlevering → vergelijking met gewasbehoefte
    const balansRows: Array<{
      subParcelId: string;
      fullName: string;
      variety: string;
      hectares: number;
      nSupplyFromSoil: number | null;
      nFromFertilizer: number;
      nBehoefte: number;
      nBalance: number;
      nStatus: 'tekort' | 'op niveau' | 'overschot';
    }> = [];

    subParcels.forEach((sp) => {
      // Bodemlevering uit laatste grondmonster
      let nSupply: number | null = null;
      const own = soilRows.find((r) => r.sub_parcel_id === sp.id);
      const hoofd = soilRows.find((r) => r.parcel_id === sp.parcel_id);
      if (own?.n_leverend_vermogen_kg_ha != null) nSupply = own.n_leverend_vermogen_kg_ha;
      else if (hoofd?.n_leverend_vermogen_kg_ha != null) nSupply = hoofd.n_leverend_vermogen_kg_ha;

      // Bemestingsaanvoer — heel grove schatting: productnaam bevat "N" + percentage N in dose, of hardcoded per product
      // Voor nu: conservatief = tel aantal bladmest/strooi events × 5 kg N per event (indicatief)
      const fertEvents = parcelHist.filter(
        (h) => h.parcel_name === sp.name &&
          (h.registration_type === 'spreading' ||
            (h.registration_type === 'spraying' && String(h.product).match(/ureum|mkp|kalksalp|nitraat|ammoniumsulfaat|knoop/i)))
      );
      const nFromFertilizer = fertEvents.length * 5; // Zeer ruwe schatting

      const nBehoefte = getNRequirement(sp.variety);
      const totalN = (nSupply || 0) + nFromFertilizer;
      const nBalance = totalN - nBehoefte;
      const nStatus: 'tekort' | 'op niveau' | 'overschot' =
        nBalance < -20 ? 'tekort' : nBalance > 30 ? 'overschot' : 'op niveau';

      const parcelName = parcelMap.get(sp.parcel_id) || 'Onbekend';
      const fullName = parcelName.toLowerCase() === sp.name.toLowerCase()
        ? parcelName
        : `${parcelName} — ${sp.name}`;

      balansRows.push({
        subParcelId: sp.id,
        fullName,
        variety: sp.variety,
        hectares: sp.area || 0,
        nSupplyFromSoil: nSupply,
        nFromFertilizer,
        nBehoefte,
        nBalance,
        nStatus,
      });
    });

    balansRows.sort((a, b) => a.nBalance - b.nBalance); // Tekorten bovenaan

    // --- 3. CTGB CUMULATIE: werkzame stoffen PER PERCEEL ---
    // Bouw een product → actieve stoffen lookup
    const productToSubstances = new Map<string, string[]>();
    ctgbDetails.forEach((c: any) => {
      if (Array.isArray(c.werkzame_stoffen)) {
        productToSubstances.set(c.naam, c.werkzame_stoffen);
      }
    });

    // Per (perceel × stof): hoeveel toepassingen dit seizoen
    const parcelSubstanceStats = new Map<string, Map<string, {
      applications: number;
      products: Set<string>;
    }>>();

    // Tel per registratie per perceel per product → actieve stoffen
    spuitRows.forEach((r) => {
      const products = Array.isArray(r.products) ? r.products : [];
      const plots = Array.isArray(r.plots) ? r.plots : [];
      plots.forEach((plot: string) => {
        if (!parcelSubstanceStats.has(plot)) {
          parcelSubstanceStats.set(plot, new Map());
        }
        const byStof = parcelSubstanceStats.get(plot)!;
        products.forEach((p: any) => {
          const substances = productToSubstances.get(p.product) || [];
          substances.forEach((s: string) => {
            if (!byStof.has(s)) {
              byStof.set(s, { applications: 0, products: new Set() });
            }
            const entry = byStof.get(s)!;
            entry.applications += 1;
            entry.products.add(p.product);
          });
        });
      });
    });

    // Flat lijst voor overzicht: hoogste aantal per (stof × perceel)
    const parcelSubstanceList: Array<{
      parcel: string;
      fullName: string;
      substance: string;
      applications: number;
      products: string[];
    }> = [];

    parcelSubstanceStats.forEach((byStof, plot) => {
      // Bouw fullName voor weergave
      const sp = subParcels.find((s) => s.name === plot);
      const parcelName = sp ? (parcelMap.get(sp.parcel_id) || 'Onbekend') : '';
      const fullName = parcelName && parcelName.toLowerCase() !== plot.toLowerCase()
        ? `${parcelName} — ${plot}`
        : plot;

      byStof.forEach((entry, substance) => {
        parcelSubstanceList.push({
          parcel: plot,
          fullName,
          substance,
          applications: entry.applications,
          products: [...entry.products],
        });
      });
    });
    parcelSubstanceList.sort((a, b) => b.applications - a.applications);

    // Aggregeer ook per-stof (met max per perceel) voor het overzicht
    const substanceByMaxPerParcel = new Map<string, {
      substance: string;
      maxApplicationsOnOneParcel: number;
      maxParcel: string;
      parcelsAboveThreshold: number;
      allProducts: Set<string>;
    }>();

    parcelSubstanceList.forEach((entry) => {
      if (!substanceByMaxPerParcel.has(entry.substance)) {
        substanceByMaxPerParcel.set(entry.substance, {
          substance: entry.substance,
          maxApplicationsOnOneParcel: 0,
          maxParcel: '',
          parcelsAboveThreshold: 0,
          allProducts: new Set(),
        });
      }
      const agg = substanceByMaxPerParcel.get(entry.substance)!;
      if (entry.applications > agg.maxApplicationsOnOneParcel) {
        agg.maxApplicationsOnOneParcel = entry.applications;
        agg.maxParcel = entry.fullName;
      }
      if (entry.applications >= 6) agg.parcelsAboveThreshold += 1;
      entry.products.forEach((p) => agg.allProducts.add(p));
    });

    const substanceList = [...substanceByMaxPerParcel.values()]
      .map((s) => ({
        substance: s.substance,
        maxApplicationsOnOneParcel: s.maxApplicationsOnOneParcel,
        maxParcel: s.maxParcel,
        parcelsAboveThreshold: s.parcelsAboveThreshold,
        products: [...s.allProducts],
      }))
      .sort((a, b) => b.maxApplicationsOnOneParcel - a.maxApplicationsOnOneParcel);

    // Risico-lijst: (stof × perceel) combinaties met 6+ toepassingen
    const highRiskByParcel = parcelSubstanceList.filter((e) => e.applications >= 6);

    // --- 4. MODE-OF-ACTION DIVERSITY (resistentie-management) ---
    // Per categorie (fungicide/insecticide) hoeveel unieke stoffen zijn toegepast?
    const categoryMap = new Map<string, Set<string>>();
    productList.forEach((p) => {
      const cat = (p.category || 'overig').toLowerCase();
      if (!categoryMap.has(cat)) categoryMap.set(cat, new Set());
      (p.activeSubstances || []).forEach((s: string) => categoryMap.get(cat)!.add(s));
    });

    const diversityByCategory = [...categoryMap.entries()].map(([cat, substances]) => ({
      category: cat,
      uniqueSubstances: substances.size,
      substances: [...substances],
    }));

    // --- 5. SUMMARY ---
    const totalSprays = spuitRows.filter((r) => r.registration_type === 'spraying').length;
    const totalFert = spuitRows.filter((r) => r.registration_type === 'spreading').length;
    const totalCost = productList.reduce((s, p) => s + p.totalCost, 0);

    return NextResponse.json({
      harvestYear,
      summary: {
        totalSprays,
        totalFertilizations: totalFert,
        totalCost,
        uniqueProducts: productList.length,
        uniqueSubstances: substanceList.length,
        parcelsWithSoilData: balansRows.filter((r) => r.nSupplyFromSoil != null).length,
        diseaseModelsActive: diseaseCfg.length,
      },
      productList: productList.slice(0, 20),
      balansRows,
      substanceList,
      highRiskByParcel,
      diversityByCategory,
      generatedAt: now.toISOString(),
    });
  } catch (err: any) {
    console.error('Operations error:', err);
    return NextResponse.json({ error: err.message || 'Fout' }, { status: 500 });
  }
}
