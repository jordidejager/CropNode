/**
 * WhatsApp rot-uitval intent + handler.
 *
 * Detecteert berichten zoals:
 *   - "rotte bak geleegd bij sortering van Schele"
 *   - "rotte bak"
 *   - "1,5 m3 bak rot peren bij Vierwegen"
 *
 * Probeert een matchende partij te vinden o.b.v. ras/perceel-naam.
 * Maakt automatisch een 'rot_uitval' batch_event aan met kg-schatting.
 */
import { sendTextMessage } from './client';
import { getSupabaseAdmin } from '@/lib/supabase-client';

const ROT_KEYWORDS = [
    'rotte bak',
    'rotbak',
    'rot fruit',
    'rotte peren',
    'rotte appels',
    'bak rot',
    'kuubsbak rot',
    'kuubsbak geleegd',
];

/**
 * Detecteert of een binnenkomend bericht over rot-uitval gaat.
 */
export function isRotUitvalIntent(text: string): boolean {
    const normalized = text.toLowerCase();
    return ROT_KEYWORDS.some((kw) => normalized.includes(kw));
}

/**
 * Probeer aantal bakken uit het bericht te halen.
 * Defaults naar 1 bak als niet vermeld.
 */
function parseBakkenAantal(text: string): number {
    const m = text.toLowerCase().match(/(\d+)\s*(bak|bakken|kuubsbak|kuub)/);
    if (m) {
        const n = parseInt(m[1], 10);
        if (Number.isFinite(n) && n > 0 && n <= 50) return n;
    }
    return 1;
}

/**
 * Extracteer perceel-/partij-hint uit het bericht.
 * Bv. "rotte bak geleegd bij sortering van Schele" → "schele"
 *      "rotte bak Vierwegen" → "vierwegen"
 */
function extractHint(text: string): string | null {
    const lower = text.toLowerCase();
    // Patterns: "bij", "van", "uit", "op"
    const patterns = [
        /(?:bij|van|uit|op)\s+(?:sortering\s+van\s+|partij\s+|perceel\s+)?([\w\s/-]{2,40})/i,
        /(?:rotte?\s+bak\s+)([\w\s/-]{2,40})/i,
    ];
    for (const re of patterns) {
        const m = lower.match(re);
        if (m && m[1]) {
            const hint = m[1].replace(/\s+(geleegd|leeggekiept|leeg).*$/i, '').trim();
            if (hint && !ROT_KEYWORDS.some((kw) => kw === hint)) return hint;
        }
    }
    return null;
}

/**
 * Zoekt een actieve partij (status='active') waarvan het label, ras of
 * (sub)perceel het hint-woord bevat. Returnt de eerste match.
 */
async function findMatchingBatch(
    userId: string,
    hint: string | null,
): Promise<{ id: string; label: string | null; variety: string | null } | null> {
    const admin = getSupabaseAdmin();
    let query = admin
        .from('v_batches_enriched')
        .select('id, label, variety, parcel_name, sub_parcel_name, harvest_year, status')
        .eq('user_id', userId)
        .neq('status', 'archived')
        .neq('status', 'closed')
        .order('harvest_year', { ascending: false })
        .limit(20);

    const { data, error } = await query;
    if (error || !data) return null;
    if (!hint) {
        // Geen hint: pak de meest recente actieve partij (laatste oogstjaar)
        return data[0] ?? null;
    }
    const h = hint.toLowerCase();
    const match = data.find((b: any) => {
        return (
            (b.label && String(b.label).toLowerCase().includes(h)) ||
            (b.variety && String(b.variety).toLowerCase().includes(h)) ||
            (b.parcel_name && String(b.parcel_name).toLowerCase().includes(h)) ||
            (b.sub_parcel_name && String(b.sub_parcel_name).toLowerCase().includes(h))
        );
    });
    return match ?? data[0] ?? null;
}

/**
 * Verwerk een rot-uitval-bericht: maak een batch_event aan en bevestig naar user.
 */
export async function handleRotUitval(
    userId: string,
    e164Phone: string,
    messageText: string,
    waMessageId: string | null,
): Promise<void> {
    const bakken = parseBakkenAantal(messageText);
    const hint = extractHint(messageText);
    const match = await findMatchingBatch(userId, hint);

    if (!match) {
        await sendTextMessage(
            e164Phone,
            'Geen actieve partij gevonden om de rotte bak aan te koppelen. Maak eerst een partij aan in /afzetstromen.',
        );
        return;
    }

    const BAK_KG_DEFAULT = 500; // 1,5 m³ rotte peren ≈ 500 kg
    const totalKg = bakken * BAK_KG_DEFAULT;

    const admin = getSupabaseAdmin();
    const { error } = await admin.from('batch_events').insert({
        user_id: userId,
        batch_id: match.id,
        event_type: 'rot_uitval',
        event_date: new Date().toISOString().split('T')[0],
        kg: totalKg,
        details: {
            bakken,
            bak_kg_estimate: BAK_KG_DEFAULT,
            liters_per_bak: 1500,
            source: 'whatsapp',
            whatsapp_message_id: waMessageId,
        },
        notes: messageText,
    });

    if (error) {
        console.error('[Rot Uitval] Insert error:', error);
        await sendTextMessage(
            e164Phone,
            `Kon rot-uitval niet opslaan: ${error.message}`,
        );
        return;
    }

    const label = match.label ?? match.variety ?? 'partij zonder naam';
    await sendTextMessage(
        e164Phone,
        `🗑️ Rot-uitval geregistreerd: ${bakken} bak${bakken === 1 ? '' : 'ken'} (~${totalKg} kg) bij "${label}".\n\nKun je in CropNode de exacte kg's nog aanpassen.`,
    );
}
