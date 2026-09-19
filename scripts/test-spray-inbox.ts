/**
 * test-spray-inbox.ts — run the spuit-inbox processing on a note without WhatsApp.
 *
 * Inserts a logbook draft (source = whatsapp_spray) for the given user, runs
 * processSprayDraft() and prints the resulting parsed_data + review_meta.
 * The draft is deleted afterwards unless --keep is passed (then it shows up in
 * /gewasbescherming/inbox so you can try the review UI).
 *
 * Usage:
 *   npx tsx scripts/test-spray-inbox.ts --user <uuid> "X en Y gespoten met captan, 0,5 soriale en 25 kg totaal zwavel"
 *   npx tsx scripts/test-spray-inbox.ts --user <uuid> --keep "alle peren delan"
 *   npx tsx scripts/test-spray-inbox.ts --user <uuid> --dry "…"   # geen DB-writes: pipeline + verrijking alleen
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env.local') });

async function main() {
  const args = process.argv.slice(2);
  const userIdx = args.indexOf('--user');
  const userId = userIdx >= 0 ? args[userIdx + 1] : process.env.TEST_USER_ID;
  const keep = args.includes('--keep');
  const dry = args.includes('--dry');
  const note = args.filter((a, i) => !a.startsWith('--') && i !== userIdx + 1).join(' ').trim();

  if (!userId || !note) {
    console.error('Gebruik: npx tsx scripts/test-spray-inbox.ts --user <uuid> [--keep|--dry] "<notitie>"');
    process.exit(1);
  }

  console.log(`\n📝 Notitie: "${note}"\n👤 User: ${userId}\n`);

  if (dry) {
    await runDry(userId, note);
    return;
  }

  const { insertSprayDraft, getSprayDraft } = await import('../src/lib/whatsapp/store');
  const { processSprayDraft } = await import('../src/lib/whatsapp/spray-inbox');
  const { getSupabaseAdmin } = await import('../src/lib/supabase-client');

  const id = await insertSprayDraft({
    userId,
    rawInput: note,
    waMessageId: `test-${Date.now()}`,
    messageDate: new Date(),
    reviewMeta: { receivedAt: new Date().toISOString() },
  });
  console.log(`→ Draft ${id} aangemaakt (status Nieuw)`);

  const started = Date.now();
  await processSprayDraft(id, { silent: true });
  console.log(`→ Verwerkt in ${Date.now() - started}ms\n`);

  const draft = await getSprayDraft(id);
  if (!draft) throw new Error('Draft verdwenen?');

  console.log(`Status:            ${draft.status}`);
  console.log(`Datum:             ${draft.date.toISOString()}`);
  console.log(`Type:              ${draft.registrationType}`);
  console.log(`Percelen:          ${(draft.parsedData?.plots || []).join(', ') || '(geen)'}`);
  console.log('Middelen:');
  for (const p of draft.parsedData?.products || []) {
    const total = p.totalAmount != null ? ` (totaal ${p.totalAmount})` : '';
    const sugg = p.suggestions?.length ? `  → suggesties: ${p.suggestions.map(s => s.naam).join(', ')}` : '';
    console.log(`  - ${p.product}  ${p.dosage} ${p.unit}${total}  resolved=${p.resolved !== false}${sugg}`);
  }
  console.log('Aannames:');
  for (const a of draft.reviewMeta.assumptions || []) {
    console.log(`  - [${a.field}${a.productIndex != null ? ` #${a.productIndex}` : ''}] ${a.from ? `${a.from} → ` : ''}${a.to} (${a.reason})`);
  }
  console.log(`Onzeker:           ${(draft.reviewMeta.uncertainFields || []).join(', ') || '(niets)'}`);
  for (const f of draft.reviewMeta.validationFlags || []) {
    console.log(`  ${f.type.toUpperCase()}: ${f.message}`);
  }
  if (draft.reviewMeta.error) console.log(`Fout:              ${draft.reviewMeta.error}`);

  if (keep) {
    console.log(`\n✅ Draft bewaard — bekijk op /gewasbescherming/inbox`);
  } else {
    await (getSupabaseAdmin() as any).from('logbook').delete().eq('id', id);
    console.log(`\n🧹 Draft ${id} opgeruimd (gebruik --keep om te bewaren)`);
  }
}

async function runDry(userId: string, note: string) {
  const { runRegistrationPipeline, getOrLoadContext } = await import('../src/lib/registration-pipeline');
  const { enrichUnit } = await import('../src/lib/whatsapp/spray-inbox');
  const { getUserProductNames, getLastUsedDosagesForUser } = await import('../src/lib/supabase-store');

  const started = Date.now();
  const result = await runRegistrationPipeline(note, userId);
  console.log(`→ Pipeline: action=${result.action} in ${result.processingTimeMs}ms`);
  console.log(`   ${result.humanSummary}`);
  if (!result.registration) return;

  const ctx = await getOrLoadContext(userId);
  const names = await getUserProductNames(userId);
  const lastUsed = await getLastUsedDosagesForUser(
    userId,
    result.registration.units.flatMap(u => u.products).filter(p => !p.dosage).map(p => p.product)
  );
  console.log(`→ Historie: ${names.length} eerder gebruikte middelen (${names.slice(0, 6).join(', ')}${names.length > 6 ? ', …' : ''})`);
  console.log(`→ Datum uit pipeline: ${new Date(result.registration.date).toISOString()}  type=${result.registration.registrationType}`);

  result.registration.units.forEach((unit, ui) => {
    const enriched = enrichUnit(unit.products, ctx.products, names, lastUsed);
    const plotNames = unit.plots.map(id => ctx.parcels.find(p => p.id === id)?.name || id);
    console.log(`\nUnit ${ui + 1}${unit.label ? ` (${unit.label})` : ''}`);
    console.log(`  Percelen: ${plotNames.join(', ') || '(geen)'}`);
    for (const p of enriched.products) {
      const total = p.totalAmount != null ? ` (totaal ${p.totalAmount})` : '';
      const sugg = p.suggestions?.length ? `  → suggesties: ${p.suggestions.map(s => s.naam).join(', ')}` : '';
      console.log(`  - ${p.product}  ${p.dosage} ${p.unit}${total}  resolved=${p.resolved !== false}${sugg}`);
    }
    for (const a of enriched.assumptions) {
      console.log(`  aanname [${a.field}${a.productIndex != null ? ` #${a.productIndex}` : ''}] ${a.from ? `${a.from} → ` : ''}${a.to} (${a.reason})`);
    }
    console.log(`  onzeker: ${enriched.uncertainFields.join(', ') || '(niets)'}`);
  });
  for (const f of result.validationFlags || []) console.log(`  ${f.type.toUpperCase()}: ${f.message}`);
  console.log(`\n⏱ Totaal ${Date.now() - started}ms (dry run, niets opgeslagen)`);
}

main().catch(err => {
  console.error('❌', err);
  process.exit(1);
});
