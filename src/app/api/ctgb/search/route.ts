import { NextResponse } from 'next/server';
import type {
  CtgbSearchResponse,
  CtgbSearchResult,
  CtgbAuthorisationListResponse,
} from '@/lib/ctgb-types';

const MST_API_BASE = 'http://public.mst.ctgb.nl/public-api/1.0';

// JSON:API headers
const API_HEADERS = {
  'Accept': 'application/vnd.api+json',
  'Content-Type': 'application/vnd.api+json',
};

/**
 * Build the search URL with proper encoding for JSON:API filter syntax
 */
function buildSearchUrl(query: string, limit: number = 25): string {
  const params = new URLSearchParams();
  params.set('filter[productName]', query);
  params.set('filter[categoryType]', 'PPP');
  params.set('filter[productStatus]', 'Valid');
  params.set('page[limit]', String(limit));
  params.set('sort', 'productName');

  return `${MST_API_BASE}/authorisations?${params.toString()}`;
}

/**
 * Build the detail URL for a specific authorisation
 */
function buildDetailUrl(id: string): string {
  const params = new URLSearchParams();
  params.set('filter[locale]', 'nl');
  return `${MST_API_BASE}/authorisations/${id}?${params.toString()}`;
}

/**
 * Fetch from MST API with error handling and redirect support
 */
async function fetchMST<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: API_HEADERS,
    redirect: 'follow',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`MST API error (${response.status}): ${errorText.slice(0, 200)}`);
  }

  return response.json();
}

/**
 * Extract active substances from compositions
 * The API returns compositions as an object with substances array
 */
function extractActiveSubstances(data: any): string[] {
  const substances: string[] = [];

  // Handle both object and array format
  const compositions = data.compositions;
  if (!compositions) return substances;

  // If compositions is an object with substances array
  if (compositions.substances && Array.isArray(compositions.substances)) {
    for (const sub of compositions.substances) {
      const name = sub.substance?.name || sub.name;
      if (name && !substances.includes(name)) {
        substances.push(name);
      }
    }
  }

  // If compositions is an array
  if (Array.isArray(compositions)) {
    for (const comp of compositions) {
      if (comp.substances && Array.isArray(comp.substances)) {
        for (const sub of comp.substances) {
          const name = sub.substance?.name || sub.name;
          if (name && !substances.includes(name)) {
            substances.push(name);
          }
        }
      }
    }
  }

  return substances;
}

/**
 * Transform composition data
 */
function transformComposition(data: any): CtgbSearchResult['samenstelling'] | undefined {
  const compositions = data.compositions;
  if (!compositions) return undefined;

  // Handle object format (single composition)
  if (compositions.substances && Array.isArray(compositions.substances)) {
    return {
      formuleringstype: compositions.formulationType?.description,
      stoffen: compositions.substances.map((s: any) => ({
        naam: s.substance?.name || s.name || 'Onbekend',
        concentratie: s.concentration
          ? `${s.concentration} ${s.concentrationUnit?.unit || s.concentrationUnit || ''}`
          : undefined,
        casNummer: s.substance?.casNumber || s.casNumber,
      })),
    };
  }

  return undefined;
}

/**
 * Recursively extract crop names from hierarchical targetCrops structure
 */
function extractCropNames(targetCrops: any[]): string[] {
  const crops: string[] = [];

  function traverse(items: any[]) {
    for (const item of items) {
      if (item.crop && item.selected) {
        if (!crops.includes(item.crop)) {
          crops.push(item.crop);
        }
      }
      if (item.items && Array.isArray(item.items)) {
        traverse(item.items);
      }
    }
  }

  if (Array.isArray(targetCrops)) {
    traverse(targetCrops);
  }

  return crops;
}

/**
 * Recursively extract organism names from hierarchical targetOrganisms structure
 */
function extractOrganismNames(targetOrganisms: any[]): string[] {
  const organisms: string[] = [];

  function traverse(items: any[]) {
    for (const item of items) {
      // Get diseases if present
      if (item.diseases && Array.isArray(item.diseases) && item.selected) {
        for (const disease of item.diseases) {
          if (!organisms.includes(disease)) {
            organisms.push(disease);
          }
        }
      }
      // Or organism name
      if (item.organismScientific && item.selected) {
        if (!organisms.includes(item.organismScientific)) {
          organisms.push(item.organismScientific);
        }
      }
      if (item.items && Array.isArray(item.items)) {
        traverse(item.items);
      }
    }
  }

  if (Array.isArray(targetOrganisms)) {
    traverse(targetOrganisms);
  }

  return organisms;
}

/**
 * Transform PPP usages (gebruiksvoorschriften)
 */
function transformUsages(data: any): CtgbSearchResult['gebruiksvoorschriften'] {
  const usages: CtgbSearchResult['gebruiksvoorschriften'] = [];
  const uses = data.uses || [];

  if (!Array.isArray(uses)) return usages;

  // Get W-codes from authorisation
  const wCodes: string[] = [];
  if (data.authorisation?.actual) {
    for (const actual of data.authorisation.actual) {
      if (actual.wCodings) {
        for (const wc of actual.wCodings) {
          if (wc.wCode && !wCodes.includes(wc.wCode)) {
            wCodes.push(wc.wCode);
          }
        }
      }
    }
  }

  for (const usage of uses) {
    // Extract crops from hierarchical structure
    const gewassen = extractCropNames(usage.targetCrops || []);
    if (gewassen.length === 0 && usage.nameOfUse?.usesSummary) {
      gewassen.push(usage.nameOfUse.usesSummary);
    }

    // Extract organisms
    const doelorganismen = extractOrganismNames(usage.targetOrganisms || []);

    // Extract dosage
    let dosering: string | undefined;
    if (usage.maximumProductDose) {
      const dose = usage.maximumProductDose;
      dosering = `${dose.ratio} ${dose.measure?.unit || ''}`.trim();
    }

    // Extract locations
    const locaties: string[] = [];
    if (usage.targetLocations && Array.isArray(usage.targetLocations)) {
      for (const loc of usage.targetLocations) {
        if (loc.description) locaties.push(loc.description);
      }
    }

    // Extract methods
    const methodes: string[] = [];
    if (usage.applicationMethods && Array.isArray(usage.applicationMethods)) {
      for (const method of usage.applicationMethods) {
        if (method.description) methodes.push(method.description);
      }
    }

    // PHI days (veiligheidstermijn)
    let veiligheidstermijn: string | undefined;
    if (usage.phiDays !== undefined) {
      veiligheidstermijn = `${usage.phiDays} dagen`;
    }

    // Interval
    let interval: string | undefined;
    if (usage.minimumIntervalBetweenApplications) {
      interval = `min. ${usage.minimumIntervalBetweenApplications} dagen`;
    }

    // Remarks
    const opmerkingen: string[] = [];
    if (usage.remarks) {
      opmerkingen.push(usage.remarks);
    }
    if (usage.restrictions && Array.isArray(usage.restrictions)) {
      opmerkingen.push(...usage.restrictions);
    }

    usages.push({
      gewas: gewassen.join(', ') || 'Algemeen',
      doelorganisme: doelorganismen.length > 0 ? doelorganismen.join(', ') : undefined,
      locatie: locaties.length > 0 ? locaties.join(', ') : undefined,
      toepassingsmethode: methodes.length > 0 ? methodes.join(', ') : undefined,
      dosering,
      maxToepassingen: usage.amountOfApplications?.perCropSeason,
      veiligheidstermijn,
      interval,
      opmerkingen: opmerkingen.length > 0 ? opmerkingen : undefined,
      wCodes: wCodes.length > 0 ? wCodes : undefined,
    });
  }

  return usages;
}

/**
 * Transform labelling information (GHS symbols, H/P statements)
 */
function transformLabelling(data: any): CtgbSearchResult['etikettering'] | undefined {
  const components = data.components || [];
  if (!Array.isArray(components) || components.length === 0) return undefined;

  // Components can have labelling as array or object
  const labellings = components[0]?.labelling;
  if (!labellings) return undefined;

  // Handle array format
  const labelling = Array.isArray(labellings) ? labellings[0] : labellings;
  if (!labelling) return undefined;

  return {
    ghsSymbolen: labelling.symbolCodes?.map((s: any) => s.code) ||
                 labelling.ghsSymbols?.map((s: any) => s.code) ||
                 undefined,
    hZinnen: labelling.hazardStatements?.map((h: any) => ({
      code: h.code,
      tekst: h.statement,
    })) || undefined,
    pZinnen: labelling.precautionaryStatements?.map((p: any) => ({
      code: p.code,
      tekst: p.statement,
    })) || undefined,
    signaalwoord: labelling.signalWord?.description || labelling.signalWord,
  };
}

/**
 * Transform decisions (besluiten)
 */
function transformDecisions(data: any): CtgbSearchResult['besluiten'] | undefined {
  const decisions = data.decisions || [];
  if (!Array.isArray(decisions) || decisions.length === 0) return undefined;

  return decisions.slice(0, 5).map((d: any) => ({
    type: d.decisionType?.description || d.type || 'Onbekend',
    datum: d.lastRenewalDate || d.date || '',
    omschrijving: d.document?.documentName,
  }));
}

/**
 * Transform a full detail response to our search result format
 */
function transformToSearchResult(response: any): CtgbSearchResult {
  // The actual data is in response.data for detail endpoint
  const data = response.data || response;

  return {
    id: String(data.id || ''),
    toelatingsnummer: data.authorisation?.registrationNumber?.nl || data.registrationNumber || '',
    naam: data.name || '',
    status: 'Valid',
    vervaldatum: data.authorisation?.expirationDate || data.expirationDate || '',
    categorie: data.categoryType?.description || 'Gewasbeschermingsmiddel',
    toelatingshouder: data.authorisationHolder?.companyName || data.authorisationHolder?.name,
    werkzameStoffen: extractActiveSubstances(data),
    samenstelling: transformComposition(data),
    gebruiksvoorschriften: transformUsages(data),
    etikettering: transformLabelling(data),
    besluiten: transformDecisions(data),
  };
}

/**
 * GET /api/ctgb/search?query=...
 *
 * Search for plant protection products in the CTGB MST database
 * Returns full details including usage prescriptions, dosages, and safety information
 */
export async function GET(request: Request): Promise<NextResponse<CtgbSearchResponse>> {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');
    const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10), 100);

    // Validation
    if (!query || query.trim().length < 2) {
      return NextResponse.json({
        success: false,
        query: query || '',
        total: 0,
        results: [],
        error: 'Zoekopdracht moet minimaal 2 tekens bevatten',
      }, { status: 400 });
    }

    const trimmedQuery = query.trim();

    // Step 1: Search for products
    const searchUrl = buildSearchUrl(trimmedQuery, limit);
    console.log('[CTGB API] Searching:', searchUrl);

    let searchResponse: CtgbAuthorisationListResponse;
    try {
      searchResponse = await fetchMST<CtgbAuthorisationListResponse>(searchUrl);
    } catch (error) {
      console.error('[CTGB API] Search error:', error);
      return NextResponse.json({
        success: false,
        query: trimmedQuery,
        total: 0,
        results: [],
        error: `Fout bij zoeken in CTGB database: ${error instanceof Error ? error.message : 'Onbekende fout'}`,
      }, { status: 502 });
    }

    const products = searchResponse.data || [];

    if (products.length === 0) {
      return NextResponse.json({
        success: true,
        query: trimmedQuery,
        total: 0,
        results: [],
      });
    }

    // Step 2: Fetch full details for each product (parallel)
    console.log(`[CTGB API] Fetching details for ${products.length} products...`);

    const detailPromises = products.map(async (product) => {
      try {
        const detailUrl = buildDetailUrl(String(product.id));
        const detail = await fetchMST<any>(detailUrl);
        return transformToSearchResult(detail);
      } catch (error) {
        console.error(`[CTGB API] Error fetching details for ${product.id}:`, error);
        // Return basic info if detail fetch fails
        return {
          id: String(product.id),
          toelatingsnummer: product.registrationNumber || '',
          naam: product.name || '',
          status: 'Valid' as const,
          vervaldatum: product.expirationDate || '',
          categorie: product.categoryType?.description || 'PPP',
          werkzameStoffen: [],
          gebruiksvoorschriften: [],
        };
      }
    });

    const results = await Promise.all(detailPromises);

    console.log(`[CTGB API] Successfully fetched ${results.length} products`);

    return NextResponse.json({
      success: true,
      query: trimmedQuery,
      total: searchResponse.meta?.total || results.length,
      results,
    });

  } catch (error) {
    console.error('[CTGB API] Unexpected error:', error);
    return NextResponse.json({
      success: false,
      query: '',
      total: 0,
      results: [],
      error: `Onverwachte fout: ${error instanceof Error ? error.message : 'Onbekende fout'}`,
    }, { status: 500 });
  }
}
