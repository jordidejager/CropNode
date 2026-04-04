/**
 * WhatsApp Product Query Handler.
 * Handles product info queries via WhatsApp using existing DB functions:
 * - fn_search_products(query) — fuzzy product search
 * - fn_get_product_for_crop(product, gewas) — crop-specific dosage/PHI
 * - v_product_card — complete product card view
 */

import { getSupabaseAdmin } from '@/lib/supabase-client';
import { sendTextMessage } from './client';
import { logMessage } from './store';
import { stripPlus } from './phone-utils';

// ============================================================================
// Pattern detection — no AI needed for simple queries
// ============================================================================

const PRODUCT_QUERY_PATTERNS: Array<{ regex: RegExp; extract: (m: RegExpMatchArray) => { product?: string; crop?: string; organism?: string } }> = [
  // "wat is delan" / "info delan" / "info over captan"
  { regex: /^(?:wat is|info|informatie|details)(?: over)?\s+(.+)/i, extract: m => ({ product: m[1].trim() }) },
  // "dosering delan" / "dosering delan op appel"
  { regex: /^(?:dosering|doseren)\s+(.+?)(?:\s+(?:op|voor|bij)\s+(.+))?$/i, extract: m => ({ product: m[1].trim(), crop: m[2]?.trim() }) },
  // "is delan toegelaten" / "mag ik captan gebruiken"
  { regex: /^(?:is|mag ik|kan ik)\s+(.+?)\s+(?:toegelaten|toegestaan|gebruiken|nog geldig)/i, extract: m => ({ product: m[1].trim() }) },
  // "welke middelen tegen schurft" / "wat kan ik tegen meeldauw"
  { regex: /^(?:welke middelen|wat kan ik|wat gebruik|middelen)\s+(?:tegen|voor)\s+(.+)/i, extract: m => ({ organism: m[1].trim() }) },
  // "middelen voor schurft op appel"
  { regex: /^(?:middelen|producten)\s+(?:voor|tegen)\s+(.+?)\s+(?:op|bij)\s+(.+)/i, extract: m => ({ organism: m[1].trim(), crop: m[2].trim() }) },
];

/**
 * Check if a message is a product query. Returns extracted params or null.
 */
export function detectProductQuery(text: string): { product?: string; crop?: string; organism?: string } | null {
  const lower = text.toLowerCase().trim();
  for (const { regex, extract } of PRODUCT_QUERY_PATTERNS) {
    const match = lower.match(regex);
    if (match) return extract(match);
  }
  return null;
}

// ============================================================================
// Main handler
// ============================================================================

export async function handleProductQuery(
  userId: string,
  phoneNumber: string,
  queryText: string,
  params?: { product?: string; crop?: string; organism?: string }
): Promise<void> {
  const metaPhone = stripPlus(phoneNumber);
  const detected = params || detectProductQuery(queryText);

  try {
    await logMessage({ phoneNumber, direction: 'inbound', messageText: queryText });

    const admin = getSupabaseAdmin();
    if (!admin) throw new Error('Admin client niet beschikbaar');

    // Route based on query type
    if (detected?.organism) {
      await handleOrganismQuery(admin, metaPhone, phoneNumber, detected.organism, detected.crop);
      return;
    }

    if (detected?.product) {
      await handleSingleProductQuery(admin, metaPhone, phoneNumber, detected.product, detected.crop);
      return;
    }

    // Fallback: try searching the query text as product name
    await handleSingleProductQuery(admin, metaPhone, phoneNumber, queryText);

  } catch (err) {
    console.error('[handleProductQuery] Error:', err);
    const msg = '❗ Kon productinformatie niet ophalen. Probeer het opnieuw.';
    await sendTextMessage(metaPhone, msg);
    await logMessage({ phoneNumber, direction: 'outbound', messageText: msg });
  }
}

// ============================================================================
// Single product lookup
// ============================================================================

async function handleSingleProductQuery(
  admin: any,
  metaPhone: string,
  phoneNumber: string,
  productQuery: string,
  crop?: string
): Promise<void> {
  // Search for product
  const { data: searchResults, error: searchErr } = await admin.rpc('fn_search_products', {
    search_query: productQuery,
    filter_source: null,
  });

  if (searchErr || !searchResults?.length) {
    const msg = `❓ Product _"${productQuery}"_ niet gevonden.\n\nProbeer een andere naam of spelling.`;
    await sendTextMessage(metaPhone, msg);
    await logMessage({ phoneNumber, direction: 'outbound', messageText: msg });
    return;
  }

  const bestMatch = searchResults[0];

  // Get product card
  const { data: card } = await admin
    .from('v_product_card')
    .select('*')
    .eq('product_id', bestMatch.product_id)
    .maybeSingle();

  // Get crop-specific info if crop provided or default to hardfruit
  let cropInfo: any = null;
  const targetCrop = crop || 'appel';
  const { data: cropData } = await admin.rpc('fn_get_product_for_crop', {
    p_product: bestMatch.name,
    p_gewas: targetCrop,
  });
  if (cropData?.length > 0) {
    cropInfo = cropData;
  }

  // Format response
  const msg = formatProductCard(bestMatch, card, cropInfo, targetCrop);
  await sendTextMessage(metaPhone, msg);
  await logMessage({ phoneNumber, direction: 'outbound', messageText: msg });
}

// ============================================================================
// Organism query (reverse lookup)
// ============================================================================

async function handleOrganismQuery(
  admin: any,
  metaPhone: string,
  phoneNumber: string,
  organism: string,
  crop?: string
): Promise<void> {
  const { data: results, error } = await admin.rpc('fn_find_products_for_organism', {
    p_doelorganisme: organism,
    p_gewas: crop || 'appel',
    p_product_type: null,
  });

  if (error || !results?.length) {
    const msg = `❓ Geen middelen gevonden tegen _"${organism}"_${crop ? ` op ${crop}` : ''}.`;
    await sendTextMessage(metaPhone, msg);
    await logMessage({ phoneNumber, direction: 'outbound', messageText: msg });
    return;
  }

  // Format list (max 8 products)
  const lines: string[] = [];
  lines.push(`🔍 *Middelen tegen ${organism}*${crop ? ` op ${crop}` : ''}`);
  lines.push('');

  const shown = results.slice(0, 8);
  for (const r of shown) {
    const dose = r.dosering ? ` — ${r.dosering}` : '';
    const frac = r.frac_code ? ` (${r.frac_code})` : '';
    lines.push(`🌿 *${r.product_name}*${frac}${dose}`);
  }

  if (results.length > 8) {
    lines.push(`\n_...en ${results.length - 8} andere middelen_`);
  }

  lines.push('');
  lines.push('_Typ "info [productnaam]" voor meer details._');

  const msg = lines.join('\n');
  await sendTextMessage(metaPhone, msg);
  await logMessage({ phoneNumber, direction: 'outbound', messageText: msg });
}

// ============================================================================
// Formatting
// ============================================================================

function formatProductCard(
  match: any,
  card: any | null,
  cropInfo: any[] | null,
  crop: string
): string {
  const lines: string[] = [];
  const isCTGB = match.source === 'ctgb';

  // Header
  const typeLabel = match.product_type || (isCTGB ? 'Gewasbescherming' : 'Meststof');
  const emoji = isCTGB ? '🌿' : '🌱';
  lines.push(`${emoji} *${match.name}*`);

  if (isCTGB && card) {
    const statusIcon = card.status === 'Toegelaten' ? '✓' : '⚠️';
    lines.push(`📋 ${typeLabel} — CTGB ${statusIcon} (${card.toelatingsnummer || ''})`);
    if (card.toelatingshouder) {
      lines.push(`🏢 ${card.toelatingshouder}`);
    }
  } else {
    lines.push(`📋 ${typeLabel}`);
    if (card?.manufacturer) {
      lines.push(`🏢 ${card.manufacturer}`);
    }
  }

  // Werkzame stoffen (CTGB)
  if (isCTGB && card?.werkzame_stoffen) {
    lines.push('');
    lines.push('💊 *Werkzame stoffen:*');
    try {
      const stoffen = typeof card.werkzame_stoffen === 'string'
        ? JSON.parse(card.werkzame_stoffen)
        : card.werkzame_stoffen;
      if (Array.isArray(stoffen)) {
        for (const stof of stoffen.slice(0, 5)) {
          const conc = stof.concentratie ? ` (${stof.concentratie})` : '';
          const frac = stof.frac_code ? ` — ${stof.frac_code}` : '';
          lines.push(`• ${stof.naam || stof.name}${conc}${frac}`);
        }
      }
    } catch { /* ignore parse errors */ }
  }

  // Samenstelling (meststof)
  if (!isCTGB && card) {
    const npk: string[] = [];
    if (card.n_total) npk.push(`N: ${card.n_total}%`);
    if (card.p2o5) npk.push(`P₂O₅: ${card.p2o5}%`);
    if (card.k2o) npk.push(`K₂O: ${card.k2o}%`);
    if (npk.length > 0) {
      lines.push('');
      lines.push('🧪 *Samenstelling:*');
      npk.forEach(n => lines.push(`• ${n}`));
    }
    if (card.dosage_fruit) {
      lines.push('');
      lines.push(`📍 *Dosering fruitteelt:* ${card.dosage_fruit}`);
    }
  }

  // Crop-specific info (hardfruit)
  if (cropInfo && cropInfo.length > 0) {
    lines.push('');
    const cropEmoji = crop.includes('peer') ? '🍐' : '🍎';
    lines.push(`${cropEmoji} *${crop.charAt(0).toUpperCase() + crop.slice(1)}:*`);

    // Group by doelorganisme, show top 3
    const shown = cropInfo.slice(0, 3);
    for (const ci of shown) {
      if (ci.doelorganisme) {
        lines.push(`  _${ci.doelorganisme}_`);
      }
      const details: string[] = [];
      if (ci.dosering) details.push(`Dosering: ${ci.dosering}`);
      if (ci.max_toepassingen) details.push(`Max: ${ci.max_toepassingen}×`);
      if (ci.interval) details.push(`Interval: ${ci.interval}`);
      if (ci.veiligheidstermijn) details.push(`PHI: ${ci.veiligheidstermijn}`);
      if (details.length > 0) {
        lines.push(`  ${details.join(' · ')}`);
      }
    }
    if (cropInfo.length > 3) {
      lines.push(`  _+${cropInfo.length - 3} andere toepassingen_`);
    }
  }

  // Status
  if (isCTGB && card) {
    lines.push('');
    if (card.status === 'Toegelaten' && card.vervaldatum) {
      const expDate = new Date(card.vervaldatum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
      lines.push(`✅ Toegelaten t/m ${expDate}`);
    } else if (card.status) {
      lines.push(`⚠️ Status: ${card.status}`);
    }
  }

  // Truncate if needed
  let text = lines.join('\n');
  if (text.length > 4000) {
    text = text.substring(0, 3980) + '\n\n_...ingekort_';
  }
  return text;
}
