#!/usr/bin/env npx tsx
/**
 * Test script voor CTGB MST API integratie
 *
 * Gebruik:
 *   npx tsx scripts/test-ctgb.ts "Merpan Spuitkorrel"
 *   npx tsx scripts/test-ctgb.ts "captan"
 *   npx tsx scripts/test-ctgb.ts "Switch"
 *
 * Dit script roept direct de CTGB MST API aan (niet onze Next.js route)
 * om te testen of de API bereikbaar is en correcte data teruggeeft.
 */

const MST_API_BASE = 'http://public.mst.ctgb.nl/public-api/1.0';

interface SearchResult {
  id: string;
  name: string;
  registrationNumber: string;
  categoryType: { type: string; description: string };
  expirationDate: string;
  lastRenewalDate: string;
}

interface SearchResponse {
  meta: { total: number; offset: number; limit: number };
  data: SearchResult[];
}

async function searchProducts(query: string): Promise<SearchResponse> {
  const params = new URLSearchParams();
  params.set('filter[productName]', query);
  params.set('filter[categoryType]', 'PPP');
  params.set('filter[productStatus]', 'Valid');
  params.set('page[limit]', '10');
  params.set('sort', 'productName');

  const url = `${MST_API_BASE}/authorisations?${params.toString()}`;

  console.log('\n--- Zoeken in CTGB MST API ---');
  console.log(`URL: ${url}\n`);

  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function getProductDetails(id: string): Promise<any> {
  const params = new URLSearchParams();
  params.set('filter[locale]', 'nl');

  const url = `${MST_API_BASE}/authorisations/${id}?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

function formatSubstances(data: any): string[] {
  const substances: string[] = [];
  const compositions = data.compositions;

  if (!compositions) return substances;

  // Handle object format with substances array
  if (compositions.substances && Array.isArray(compositions.substances)) {
    for (const sub of compositions.substances) {
      const name = sub.substance?.name || sub.name;
      const conc = sub.concentration
        ? ` (${sub.concentration} ${sub.concentrationUnit?.unit || ''})`
        : '';
      if (name) substances.push(`${name}${conc}`);
    }
  }

  return substances;
}

function extractCropNames(targetCrops: any[]): string[] {
  const crops: string[] = [];

  function traverse(items: any[]) {
    for (const item of items) {
      if (item.crop && item.selected) {
        if (!crops.includes(item.crop)) crops.push(item.crop);
      }
      if (item.items) traverse(item.items);
    }
  }

  if (Array.isArray(targetCrops)) traverse(targetCrops);
  return crops;
}

function extractOrganismNames(targetOrganisms: any[]): string[] {
  const organisms: string[] = [];

  function traverse(items: any[]) {
    for (const item of items) {
      if (item.diseases && Array.isArray(item.diseases) && item.selected) {
        for (const disease of item.diseases) {
          if (!organisms.includes(disease)) organisms.push(disease);
        }
      }
      if (item.items) traverse(item.items);
    }
  }

  if (Array.isArray(targetOrganisms)) traverse(targetOrganisms);
  return organisms;
}

function formatUsages(data: any): any[] {
  const usages: any[] = [];
  const uses = data.uses || [];

  if (!Array.isArray(uses)) return usages;

  // Get W-codes
  const wCodes: string[] = [];
  if (data.authorisation?.actual) {
    for (const actual of data.authorisation.actual) {
      if (actual.wCodings) {
        for (const wc of actual.wCodings) {
          if (wc.wCode && !wCodes.includes(wc.wCode)) wCodes.push(wc.wCode);
        }
      }
    }
  }

  for (const usage of uses) {
    const gewassen = extractCropNames(usage.targetCrops || []);
    if (gewassen.length === 0 && usage.nameOfUse?.usesSummary) {
      gewassen.push(usage.nameOfUse.usesSummary);
    }

    const doelorganismen = extractOrganismNames(usage.targetOrganisms || []);

    let dosering = '';
    if (usage.maximumProductDose) {
      dosering = `${usage.maximumProductDose.ratio} ${usage.maximumProductDose.measure?.unit || ''}`;
    }

    const locaties: string[] = [];
    if (usage.targetLocations) {
      for (const loc of usage.targetLocations) {
        if (loc.description) locaties.push(loc.description);
      }
    }

    const methodes: string[] = [];
    if (usage.applicationMethods) {
      for (const method of usage.applicationMethods) {
        if (method.description) methodes.push(method.description);
      }
    }

    usages.push({
      gewassen: gewassen.length > 0 ? gewassen : ['Algemeen'],
      doelorganismen,
      dosering,
      veiligheidstermijn: usage.phiDays !== undefined ? `${usage.phiDays} dagen` : '',
      maxToepassingen: usage.amountOfApplications?.perCropSeason,
      interval: usage.minimumIntervalBetweenApplications
        ? `min. ${usage.minimumIntervalBetweenApplications} dagen`
        : '',
      locatie: locaties.join(', '),
      methode: methodes.join(', '),
      wCodes,
      opmerkingen: usage.remarks || '',
    });
  }

  return usages;
}

async function main() {
  const query = process.argv[2];

  if (!query) {
    console.log('Gebruik: npx tsx scripts/test-ctgb.ts "<zoekopdracht>"');
    console.log('');
    console.log('Voorbeelden:');
    console.log('  npx tsx scripts/test-ctgb.ts "Merpan Spuitkorrel"');
    console.log('  npx tsx scripts/test-ctgb.ts "captan"');
    console.log('  npx tsx scripts/test-ctgb.ts "Switch"');
    process.exit(1);
  }

  try {
    // Step 1: Search
    console.log(`Zoeken naar: "${query}"`);
    const searchResults = await searchProducts(query);

    console.log(`Gevonden: ${searchResults.meta.total} resultaten\n`);

    if (searchResults.data.length === 0) {
      console.log('Geen producten gevonden.');
      return;
    }

    // Show search results
    console.log('--- Zoekresultaten ---');
    for (const product of searchResults.data) {
      console.log(`  [${product.id}] ${product.name}`);
      console.log(`      Toelatingsnummer: ${product.registrationNumber}`);
      console.log(`      Vervaldatum: ${product.expirationDate}`);
      console.log('');
    }

    // Step 2: Get details for first result
    const firstProduct = searchResults.data[0];
    console.log(`\n--- Details voor: ${firstProduct.name} ---\n`);

    const response = await getProductDetails(String(firstProduct.id));
    const details = response.data || response;

    // Show holder
    if (details.authorisationHolder) {
      console.log(`Toelatingshouder: ${details.authorisationHolder.companyName || details.authorisationHolder.name}`);
    }

    // Show registration number
    if (details.authorisation?.registrationNumber?.nl) {
      console.log(`Toelatingsnummer: ${details.authorisation.registrationNumber.nl}`);
    }

    // Show expiration
    if (details.authorisation?.expirationDate) {
      console.log(`Vervaldatum: ${details.authorisation.expirationDate}`);
    }

    // Show substances
    const substances = formatSubstances(details);
    if (substances.length > 0) {
      console.log(`\nWerkzame stoffen:`);
      for (const s of substances) {
        console.log(`  - ${s}`);
      }
    }

    // Show usages
    const usages = formatUsages(details);
    if (usages.length > 0) {
      console.log(`\nGebruiksvoorschriften (${usages.length} toepassingen):`);
      for (let i = 0; i < Math.min(usages.length, 5); i++) {
        const u = usages[i];
        console.log(`\n  [${i + 1}] Gewas: ${u.gewassen.join(', ')}`);
        if (u.doelorganismen.length > 0) {
          console.log(`      Doelorganismen: ${u.doelorganismen.join(', ')}`);
        }
        if (u.dosering) console.log(`      Dosering: ${u.dosering}`);
        if (u.veiligheidstermijn) console.log(`      Veiligheidstermijn: ${u.veiligheidstermijn}`);
        if (u.maxToepassingen) console.log(`      Max toepassingen: ${u.maxToepassingen}`);
        if (u.interval) console.log(`      Interval: ${u.interval}`);
        if (u.locatie) console.log(`      Locatie: ${u.locatie}`);
        if (u.methode) console.log(`      Methode: ${u.methode}`);
        if (u.wCodes.length > 0) console.log(`      W-codes: ${u.wCodes.join(', ')}`);
        if (u.opmerkingen) console.log(`      Opmerkingen: ${u.opmerkingen}`);
      }
      if (usages.length > 5) {
        console.log(`\n  ... en nog ${usages.length - 5} andere toepassingen`);
      }
    }

    // Show labelling if available
    if (details.components && details.components[0]?.labelling) {
      const labellings = details.components[0].labelling;
      const labelling = Array.isArray(labellings) ? labellings[0] : labellings;

      if (labelling) {
        console.log('\nEtikettering:');
        if (labelling.signalWord?.description) {
          console.log(`  Signaalwoord: ${labelling.signalWord.description}`);
        }
        if (labelling.symbolCodes && labelling.symbolCodes.length > 0) {
          console.log(`  GHS symbolen: ${labelling.symbolCodes.map((s: any) => s.code).join(', ')}`);
        }
        if (labelling.hazardStatements && labelling.hazardStatements.length > 0) {
          console.log(`  H-zinnen:`);
          for (const h of labelling.hazardStatements.slice(0, 5)) {
            console.log(`    ${h.code}: ${h.statement}`);
          }
        }
      }
    }

    console.log('\n--- Test voltooid ---');
    console.log('\nOm de volledige JSON te zien, voer uit:');
    console.log(`  curl -sL "${MST_API_BASE}/authorisations/${firstProduct.id}?filter%5Blocale%5D=nl" | jq`);

  } catch (error) {
    console.error('\nFout:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
