import type {
  AnalyticsData,
  AnalyticsRegistration,
  AnalyticsSubParcel,
  KPIData,
  KPIComparison,
  CostBreakdown,
  MonthlyCost,
  ProductUsage,
  ParcelCostRow,
  TreatmentTimelineEntry,
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

  return {
    totalInputCosts,
    costsPerHectare,
    totalTreatments,
    totalHectares,
  };
}

export function calculateKPIComparison(data: AnalyticsData): KPIComparison {
  const current = calculateKPIs(data.registrations, data.subParcels);
  const previous =
    data.prevRegistrations.length > 0
      ? calculateKPIs(data.prevRegistrations, data.subParcels)
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

export function generateCSV(registrations: AnalyticsRegistration[], harvestYear: number): string {
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

  return lines.join('\n');
}

export function percentageChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
