import type {
  AnalyticsData,
  AnalyticsRegistration,
  AnalyticsHarvest,
  AnalyticsSubParcel,
  KPIData,
  KPIComparison,
  CostBreakdown,
  MonthlyCost,
  ProductUsage,
  ParcelCostRow,
  TreatmentTimelineEntry,
  HarvestPerParcel,
  ParcelComparisonData,
  WeatherStats,
} from './types';

// ============================
// Cost Calculation Helpers
// ============================

function getProductCategory(product: any, registrationType: string): 'gewasbescherming' | 'bladmeststof' | 'strooimeststof' {
  if (registrationType === 'spreading') return 'strooimeststof';
  if (product.source === 'fertilizer') return 'bladmeststof';
  return 'gewasbescherming';
}

function getProductCost(product: any): number {
  if (product.unit_price && product.dosage) {
    return product.unit_price * product.dosage;
  }
  return 0;
}

function getRegistrationCost(reg: AnalyticsRegistration): number {
  return reg.products.reduce((sum, p) => sum + getProductCost(p), 0);
}

// ============================
// KPI Calculations
// ============================

export function calculateKPIs(
  registrations: AnalyticsRegistration[],
  harvests: AnalyticsHarvest[],
  subParcels: AnalyticsSubParcel[]
): KPIData {
  const totalInputCosts = registrations.reduce(
    (sum, r) => sum + getRegistrationCost(r),
    0
  );

  const treatedParcelNames = new Set<string>();
  registrations.forEach((r) => r.plots.forEach((p) => treatedParcelNames.add(p)));

  let totalHectares = 0;
  treatedParcelNames.forEach((name) => {
    const sp = subParcels.find((s) => s.name === name);
    if (sp) totalHectares += sp.area;
  });

  if (totalHectares === 0 && treatedParcelNames.size > 0) {
    totalHectares = treatedParcelNames.size;
  }

  const costsPerHectare = totalHectares > 0 ? totalInputCosts / totalHectares : 0;
  const totalTreatments = registrations.length;

  const totalHarvestKg = harvests.reduce((sum, h) => {
    const weightPerCrate = h.weight_per_crate || 18;
    return sum + h.total_crates * weightPerCrate;
  }, 0);
  const totalHarvestTons = totalHarvestKg / 1000;

  const costsPerTon = totalHarvestTons > 0 ? totalInputCosts / totalHarvestTons : 0;

  return {
    totalInputCosts,
    costsPerHectare,
    totalTreatments,
    totalHarvestTons,
    costsPerTon,
    totalHectares,
  };
}

export function calculateKPIComparison(data: AnalyticsData): KPIComparison {
  const current = calculateKPIs(data.registrations, data.harvests, data.subParcels);
  const previous =
    data.prevRegistrations.length > 0 || data.prevHarvests.length > 0
      ? calculateKPIs(data.prevRegistrations, data.prevHarvests, data.subParcels)
      : null;

  return { current, previous };
}

// ============================
// Cost Breakdown (Donut)
// ============================

export function calculateCostBreakdown(registrations: AnalyticsRegistration[]): CostBreakdown[] {
  const categories = { gewasbescherming: 0, bladmeststoffen: 0, strooimeststoffen: 0 };

  registrations.forEach((reg) => {
    reg.products.forEach((product) => {
      const cat = getProductCategory(product, reg.registration_type);
      const cost = getProductCost(product);
      if (cat === 'gewasbescherming') categories.gewasbescherming += cost;
      else if (cat === 'bladmeststof') categories.bladmeststoffen += cost;
      else categories.strooimeststoffen += cost;
    });
  });

  return [
    { category: 'Gewasbescherming', value: categories.gewasbescherming, color: '#10b981' },
    { category: 'Bladmeststoffen', value: categories.bladmeststoffen, color: '#14b8a6' },
    { category: 'Strooimeststoffen', value: categories.strooimeststoffen, color: '#f59e0b' },
  ].filter((c) => c.value > 0);
}

// ============================
// Monthly Costs (Stacked Bar)
// ============================

export function calculateMonthlyCosts(registrations: AnalyticsRegistration[]): MonthlyCost[] {
  const monthMap = new Map<string, MonthlyCost>();
  const monthNames = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

  registrations.forEach((reg) => {
    const date = new Date(reg.date);
    const monthIndex = date.getMonth();
    const year = date.getFullYear();
    const key = `${year}-${monthIndex}`;

    if (!monthMap.has(key)) {
      monthMap.set(key, { month: `${monthNames[monthIndex]} ${year}`, monthIndex, year, gewasbescherming: 0, bladmeststoffen: 0, strooimeststoffen: 0 });
    }

    const entry = monthMap.get(key)!;
    reg.products.forEach((product) => {
      const cat = getProductCategory(product, reg.registration_type);
      const cost = getProductCost(product);
      if (cat === 'gewasbescherming') entry.gewasbescherming += cost;
      else if (cat === 'bladmeststof') entry.bladmeststoffen += cost;
      else entry.strooimeststoffen += cost;
    });
  });

  return [...monthMap.values()].sort((a, b) => a.year !== b.year ? a.year - b.year : a.monthIndex - b.monthIndex);
}

// ============================
// Product Usage Analysis
// ============================

export function calculateProductUsage(registrations: AnalyticsRegistration[]): ProductUsage[] {
  const productMap = new Map<string, ProductUsage>();

  registrations.forEach((reg) => {
    reg.products.forEach((product) => {
      const key = product.product;
      if (!productMap.has(key)) {
        productMap.set(key, { product: key, totalVolume: 0, unit: product.unit, totalCost: 0, registrationCount: 0 });
      }
      const entry = productMap.get(key)!;
      entry.totalVolume += product.dosage;
      entry.totalCost += getProductCost(product);
      entry.registrationCount += 1;
    });
  });

  return [...productMap.values()].sort((a, b) => b.totalVolume - a.totalVolume);
}

// ============================
// Parcel Cost Analysis
// ============================

export function calculateParcelCosts(
  registrations: AnalyticsRegistration[],
  subParcels: AnalyticsSubParcel[]
): ParcelCostRow[] {
  const parcelMap = new Map<string, ParcelCostRow>();

  registrations.forEach((reg) => {
    const costPerPlot = getRegistrationCost(reg) / Math.max(reg.plots.length, 1);

    reg.plots.forEach((plotName) => {
      if (!parcelMap.has(plotName)) {
        const sp = subParcels.find((s) => s.name === plotName);
        parcelMap.set(plotName, { parcelId: sp?.id || plotName, parcelName: plotName, hectares: sp?.area || 1, treatmentCount: 0, totalCost: 0, costPerHa: 0 });
      }
      const entry = parcelMap.get(plotName)!;
      entry.treatmentCount += 1;
      entry.totalCost += costPerPlot;
    });
  });

  parcelMap.forEach((entry) => {
    entry.costPerHa = entry.hectares > 0 ? entry.totalCost / entry.hectares : 0;
  });

  return [...parcelMap.values()].sort((a, b) => b.costPerHa - a.costPerHa);
}

// ============================
// Treatment Timeline
// ============================

export function calculateTreatmentTimeline(registrations: AnalyticsRegistration[]): TreatmentTimelineEntry[] {
  const entries: TreatmentTimelineEntry[] = [];

  registrations.forEach((reg) => {
    reg.products.forEach((product) => {
      reg.plots.forEach((plotName) => {
        entries.push({ date: reg.date, parcelName: plotName, product: product.product, category: getProductCategory(product, reg.registration_type) });
      });
    });
  });

  return entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

// ============================
// Harvest Analysis
// ============================

export function calculateHarvestPerParcel(harvests: AnalyticsHarvest[], subParcels: AnalyticsSubParcel[]): HarvestPerParcel[] {
  const parcelMap = new Map<string, HarvestPerParcel>();

  harvests.forEach((h) => {
    const sp = subParcels.find((s) => s.id === h.sub_parcel_id);
    const key = h.sub_parcel_id || h.parcel_id;

    if (!parcelMap.has(key)) {
      parcelMap.set(key, { parcelId: key, parcelName: sp?.name || h.variety, variety: h.variety, hectares: sp?.area || 1, totalKg: 0, kgPerHa: 0, totalCrates: 0, qualityBreakdown: { klasseI: 0, klasseII: 0, industrie: 0 } });
    }

    const entry = parcelMap.get(key)!;
    const weightPerCrate = h.weight_per_crate || 18;
    entry.totalCrates += h.total_crates;
    entry.totalKg += h.total_crates * weightPerCrate;

    if (h.quality_class && entry.qualityBreakdown) {
      if (h.quality_class === 'Klasse I') entry.qualityBreakdown.klasseI += h.total_crates;
      else if (h.quality_class === 'Klasse II') entry.qualityBreakdown.klasseII += h.total_crates;
      else if (h.quality_class === 'Industrie') entry.qualityBreakdown.industrie += h.total_crates;
    }
  });

  parcelMap.forEach((entry) => {
    entry.kgPerHa = entry.hectares > 0 ? entry.totalKg / entry.hectares : 0;
  });

  return [...parcelMap.values()].sort((a, b) => b.kgPerHa - a.kgPerHa);
}

export function calculateHarvestPerVariety(harvests: AnalyticsHarvest[], subParcels: AnalyticsSubParcel[]) {
  const perParcel = calculateHarvestPerParcel(harvests, subParcels);
  const varietyMap = new Map<string, { variety: string; kgPerHaValues: number[]; totalKg: number }>();

  perParcel.forEach((p) => {
    if (!varietyMap.has(p.variety)) {
      varietyMap.set(p.variety, { variety: p.variety, kgPerHaValues: [], totalKg: 0 });
    }
    const entry = varietyMap.get(p.variety)!;
    entry.kgPerHaValues.push(p.kgPerHa);
    entry.totalKg += p.totalKg;
  });

  return [...varietyMap.values()].map((v) => ({
    variety: v.variety,
    avgKgPerHa: v.kgPerHaValues.reduce((a, b) => a + b, 0) / v.kgPerHaValues.length,
    minKgPerHa: Math.min(...v.kgPerHaValues),
    maxKgPerHa: Math.max(...v.kgPerHaValues),
    totalKg: v.totalKg,
  }));
}

// ============================
// Parcel Comparison (Radar)
// ============================

export function calculateParcelComparison(
  registrations: AnalyticsRegistration[],
  harvests: AnalyticsHarvest[],
  subParcels: AnalyticsSubParcel[],
  selectedParcelIds: string[]
): ParcelComparisonData[] {
  const parcelCosts = calculateParcelCosts(registrations, subParcels);
  const harvestData = calculateHarvestPerParcel(harvests, subParcels);

  return selectedParcelIds.map((id) => {
    const sp = subParcels.find((s) => s.id === id || s.name === id);
    const cost = parcelCosts.find((c) => c.parcelId === id || c.parcelName === id);
    const harvest = harvestData.find((h) => h.parcelId === id || h.parcelName === id);

    const totalCrates = harvest?.totalCrates || 0;
    const qb = harvest?.qualityBreakdown;
    const klasseIPercent = totalCrates > 0 && qb ? (qb.klasseI / totalCrates) * 100 : 0;

    return {
      parcelId: id,
      parcelName: sp?.name || cost?.parcelName || id,
      variety: sp?.variety || harvest?.variety || '-',
      hectares: sp?.area || cost?.hectares || 0,
      treatmentCount: cost?.treatmentCount || 0,
      inputCostsPerHa: cost?.costPerHa || 0,
      harvestKgPerHa: harvest?.kgPerHa || 0,
      costsPerTon: harvest && harvest.totalKg > 0 && cost ? (cost.totalCost / (harvest.totalKg / 1000)) : 0,
      qualityKlasseIPercent: klasseIPercent,
    };
  });
}

// ============================
// Normalization for Radar Chart
// ============================

export function normalizeForRadar(data: ParcelComparisonData[]) {
  if (data.length === 0) return [];

  const ranges = {
    inputCostsPerHa: { min: Infinity, max: -Infinity },
    treatmentCount: { min: Infinity, max: -Infinity },
    harvestKgPerHa: { min: Infinity, max: -Infinity },
    costsPerTon: { min: Infinity, max: -Infinity },
  };

  data.forEach((d) => {
    ranges.inputCostsPerHa.min = Math.min(ranges.inputCostsPerHa.min, d.inputCostsPerHa);
    ranges.inputCostsPerHa.max = Math.max(ranges.inputCostsPerHa.max, d.inputCostsPerHa);
    ranges.treatmentCount.min = Math.min(ranges.treatmentCount.min, d.treatmentCount);
    ranges.treatmentCount.max = Math.max(ranges.treatmentCount.max, d.treatmentCount);
    ranges.harvestKgPerHa.min = Math.min(ranges.harvestKgPerHa.min, d.harvestKgPerHa);
    ranges.harvestKgPerHa.max = Math.max(ranges.harvestKgPerHa.max, d.harvestKgPerHa);
    ranges.costsPerTon.min = Math.min(ranges.costsPerTon.min, d.costsPerTon);
    ranges.costsPerTon.max = Math.max(ranges.costsPerTon.max, d.costsPerTon);
  });

  function normalize(value: number, min: number, max: number, invert = false): number {
    if (max === min) return 50;
    const normalized = ((value - min) / (max - min)) * 100;
    return invert ? 100 - normalized : normalized;
  }

  const axes = ['Kosten/ha', 'Behandelingen', 'Opbrengst kg/ha', 'Kosten/ton', 'Kwaliteit %KI'];

  return data.map((d) => ({
    parcel: d.parcelName,
    axes: [
      { axis: axes[0], value: normalize(d.inputCostsPerHa, ranges.inputCostsPerHa.min, ranges.inputCostsPerHa.max, true) },
      { axis: axes[1], value: normalize(d.treatmentCount, ranges.treatmentCount.min, ranges.treatmentCount.max, true) },
      { axis: axes[2], value: normalize(d.harvestKgPerHa, ranges.harvestKgPerHa.min, ranges.harvestKgPerHa.max) },
      { axis: axes[3], value: normalize(d.costsPerTon, ranges.costsPerTon.min, ranges.costsPerTon.max, true) },
      { axis: axes[4], value: d.qualityKlasseIPercent },
    ],
  }));
}

// ============================
// Weather Stats
// ============================

export function calculateWeatherStats(weatherData: any[]): WeatherStats | null {
  if (!weatherData || weatherData.length === 0) return null;

  let rainDays = 0;
  let frostDays = 0;
  let currentDryStreak = 0;
  let longestDryPeriod = 0;
  const weeklyTemps: number[][] = [];
  let currentWeek: number[] = [];

  weatherData.forEach((day) => {
    if ((day.precipitation_sum || 0) >= 0.1) { rainDays++; currentDryStreak = 0; }
    else { currentDryStreak++; longestDryPeriod = Math.max(longestDryPeriod, currentDryStreak); }

    const month = new Date(day.date).getMonth() + 1;
    if ((month === 4 || month === 5) && day.temp_min_c !== null && day.temp_min_c < 0) frostDays++;

    if (day.temp_avg_c !== null) {
      currentWeek.push(day.temp_avg_c);
      if (currentWeek.length === 7) { weeklyTemps.push([...currentWeek]); currentWeek = []; }
    }
  });

  let warmestWeekAvgTemp = 0;
  weeklyTemps.forEach((week) => {
    const avg = week.reduce((a, b) => a + b, 0) / week.length;
    warmestWeekAvgTemp = Math.max(warmestWeekAvgTemp, avg);
  });

  return { rainDays, frostDays, longestDryPeriod, warmestWeekAvgTemp: Math.round(warmestWeekAvgTemp * 10) / 10 };
}

// ============================
// CSV Export
// ============================

export function generateCSV(registrations: AnalyticsRegistration[], harvests: AnalyticsHarvest[], harvestYear: number): string {
  const lines: string[] = ['Type,Datum,Percelen,Product,Dosering,Eenheid,Oogstjaar'];

  registrations.forEach((reg) => {
    reg.products.forEach((product) => {
      lines.push([
        reg.registration_type === 'spreading' ? 'Strooien' : 'Spuiten',
        reg.date, `"${reg.plots.join(', ')}"`, `"${product.product}"`,
        product.dosage.toString(), product.unit, harvestYear.toString(),
      ].join(','));
    });
  });

  if (harvests.length > 0) {
    lines.push('');
    lines.push('Type,Datum,Ras,Pluk,Kisten,Kwaliteit,Kg/kist,Oogstjaar');
    harvests.forEach((h) => {
      lines.push(['Oogst', h.harvest_date, `"${h.variety}"`, h.pick_number.toString(), h.total_crates.toString(), h.quality_class || '', (h.weight_per_crate || 18).toString(), harvestYear.toString()].join(','));
    });
  }

  return lines.join('\n');
}

export function percentageChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
