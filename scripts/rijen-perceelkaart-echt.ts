/**
 * Perceelkaart op echte percelen (alleen lezen): controles, eerste rij en grootte.
 * Gebruik: npm run rijen:perceelkaart-echt -- [--user <uuid>] [--uit <map>] Murre Spoor
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env.local') });

(async () => {
  const args = process.argv.slice(2);
  const pak = (vlag: string) => {
    const i = args.indexOf(vlag);
    if (i < 0) return null;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
  };
  const userId = pak('--user') ?? '90a3acab-5aaf-401f-8f8f-8cf1021d7969';
  const uitMap = pak('--uit');
  const { getSupabaseAdmin } = await import('../src/lib/supabase-client');
  const { laadPerceelkaart } = await import('../src/lib/rijen/perceelkaart-store');
  const { perceelkaartBestandsnaam } = await import('../src/lib/rijen/perceelkaart');
  const fs = await import('fs');
  for (const naam of args.length ? args : ['Murre', 'Spoor']) {
    const { data, error } = await getSupabaseAdmin().from('parcels').select('id, name').eq('user_id', userId).ilike('name', naam);
    if (error || !data?.length) {
      console.log(`${naam}: niet gevonden`);
      continue;
    }
    const t = Date.now();
    const kaart = await laadPerceelkaart(userId, String(data[0].id));
    if (!kaart) continue;
    const tekst = JSON.stringify(kaart);
    const m = kaart.metadata;
    console.log(`\n=== ${m.perceel_naam} (${Date.now() - t} ms, ${(tekst.length / 1024).toFixed(0)} kB) ===`);
    console.log('controles ok:', m.controles.ok);
    for (const r of m.controles.meldingen) console.log(`  - [${r.soort}] ${r.tekst}`);
    const { conventies: _c, controles: _k, ...rest } = m;
    console.log('metadata:', JSON.stringify(rest));
    const eerste = kaart.features.find(f => f.properties.soort === 'rij');
    if (eerste) console.log('eerste rij:', JSON.stringify(eerste.properties, null, 1));
    if (uitMap) {
      const pad = resolve(uitMap, perceelkaartBestandsnaam(m.perceel_naam));
      fs.writeFileSync(pad, JSON.stringify(kaart, null, 1));
      console.log('geschreven:', pad);
    }
  }
})().catch(e => {
  console.error(e);
  process.exit(1);
});
