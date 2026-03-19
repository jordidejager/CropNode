#!/bin/bash
# FASE 1 Save Script - saves all 10 registrations using curl with retries
# Uses known parsing results (10/10 PASS)

SB="https://djcsihpnidopxxuxumvj.supabase.co"
KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqY3NpaHBuaWRvcHh4dXh1bXZqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODM1OTcxNCwiZXhwIjoyMDgzOTM1NzE0fQ.VqnQH187m6qTD76gfJM9i0NxMq_n6EjD3Pnyhz02ocg"
USER_ID="3ec9943a-ccfc-4a1b-b433-90dbd0ae0617"
COOKIE=$(cat /tmp/sb_cookie.txt)

sb_curl() {
    local method=$1 table=$2 query=$3 data=$4
    local url="${SB}/rest/v1/${table}${query}"
    local attempt=0 max=3
    while [ $attempt -lt $max ]; do
        local result
        if [ -n "$data" ]; then
            result=$(curl -s --connect-timeout 10 --max-time 30 -X "$method" "$url" \
                -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
                -H "Content-Type: application/json" \
                -H "Prefer: return=representation" \
                -d "$data" 2>&1)
        else
            result=$(curl -s --connect-timeout 10 --max-time 30 -X "$method" "$url" \
                -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
                -H "Content-Type: application/json" 2>&1)
        fi
        if echo "$result" | grep -q '"id"'; then
            echo "$result"
            return 0
        fi
        if [ "$method" = "GET" ] && echo "$result" | grep -q '^\['; then
            echo "$result"
            return 0
        fi
        attempt=$((attempt + 1))
        [ $attempt -lt $max ] && sleep 2
    done
    echo "FAIL: $result" >&2
    return 1
}

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   FASE 1 SAVE: 10 registraties opslaan in database         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Get all sub_parcels for this user
echo "[1/3] Sub-percelen ophalen..."
PARCELS=$(sb_curl GET sub_parcels "?user_id=eq.${USER_ID}&select=id,name,crop,variety")
echo "  Ontvangen: $(echo "$PARCELS" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))') percelen"

# Step 2: Generate save data using Node.js (better JSON handling)
echo "[2/3] Registraties voorbereiden..."
node -e "
const parcels = $PARCELS;

const REGS = [
    { id: 'R01', date: '2026-03-03T10:00:00Z', input: '3 maart alle conference met merpan 0.7 kg',
      products: [{product:'Merpan Spuitkorrel',dosage:0.7,unit:'kg'}],
      filter: p => p.crop === 'Peer' && p.variety?.toLowerCase().includes('conference') },
    { id: 'R02', date: '2026-03-05T10:00:00Z', input: '5 maart alle appels met delan 0.5 kg',
      products: [{product:'Delan DF',dosage:0.5,unit:'kg'}],
      filter: p => p.crop === 'Appel' },
    { id: 'R03', date: '2026-03-10T10:00:00Z', input: '10 maart alle peren met merpan 0.7 kg en score 0.2L',
      products: [{product:'Merpan Spuitkorrel',dosage:0.7,unit:'kg'},{product:'Score 250 EC',dosage:0.2,unit:'L'}],
      filter: p => p.crop === 'Peer' },
    { id: 'R04', date: '2026-03-12T10:00:00Z', input: '12 maart alle appels met flint 0.15 kg en pirimor 0.5 kg',
      products: [{product:'FLINT',dosage:0.15,unit:'kg'},{product:'Pirimor',dosage:0.5,unit:'kg'}],
      filter: p => p.crop === 'Appel' },
    { id: 'R05', date: '2026-03-20T10:00:00Z', input: '20 maart alle conference met bellis 0.8 kg',
      products: [{product:'Bellis',dosage:0.8,unit:'kg'}],
      filter: p => p.crop === 'Peer' && p.variety?.toLowerCase().includes('conference') },
    { id: 'R06', date: '2026-03-22T10:00:00Z', input: '22 maart alle appels met regalis plus 1.25 kg',
      products: [{product:'Regalis Plus',dosage:1.25,unit:'kg'}],
      filter: p => p.crop === 'Appel' },
    { id: 'R07', date: '2026-03-28T10:00:00Z', input: '28 maart alle peren met scala 0.75L maar conference niet',
      products: [{product:'Scala',dosage:0.75,unit:'L'}],
      filter: p => p.crop === 'Peer' && !p.variety?.toLowerCase().includes('conference') },
    { id: 'R08', date: '2026-04-01T10:00:00Z', input: '1 april alle conference met merpan 0.7 kg, flint 0.15 kg en coragen 0.18L',
      products: [{product:'Merpan Spuitkorrel',dosage:0.7,unit:'kg'},{product:'FLINT',dosage:0.15,unit:'kg'},{product:'CORAGEN',dosage:0.18,unit:'L'}],
      filter: p => p.crop === 'Peer' && p.variety?.toLowerCase().includes('conference') },
    { id: 'R09', date: '2026-04-08T10:00:00Z', input: '8 april alle appels met nissorun 0.2L',
      products: [{product:'Nissorun vloeibaar',dosage:0.2,unit:'L'}],
      filter: p => p.crop === 'Appel' },
    { id: 'R10', date: '2026-04-10T10:00:00Z', input: '10 april alle peren met teldor 1.5 kg',
      products: [{product:'Teldor',dosage:1.5,unit:'kg'}],
      filter: p => p.crop === 'Peer' },
];

const output = { spuitschrift: [], parcel_history: [] };
const uid = '${USER_ID}';

for (const reg of REGS) {
    const matchedParcels = parcels.filter(reg.filter);
    const plotIds = matchedParcels.map(p => p.id);
    const sid = crypto.randomUUID();
    const eid = crypto.randomUUID();

    output.spuitschrift.push({
        id: eid, spuitschrift_id: sid, original_logbook_id: null,
        original_raw_input: reg.input, date: reg.date,
        plots: plotIds, products: reg.products,
        validation_message: null, status: 'Akkoord', user_id: uid,
    });

    for (const pid of plotIds) {
        const info = matchedParcels.find(p => p.id === pid);
        for (const prod of reg.products) {
            output.parcel_history.push({
                id: crypto.randomUUID(), log_id: null, spuitschrift_id: eid,
                parcel_id: pid, parcel_name: info?.name || pid,
                crop: info?.crop || null, variety: info?.variety || null,
                product: prod.product, dosage: prod.dosage, unit: prod.unit,
                date: reg.date, user_id: uid,
            });
        }
    }

    console.error(reg.id + ': ' + plotIds.length + ' percelen, ' + reg.products.length + ' product(en)');
}

console.error('Totaal: ' + output.spuitschrift.length + ' spuitschrift, ' + output.parcel_history.length + ' parcel_history');
require('fs').writeFileSync('/tmp/fase1_spuitschrift.json', JSON.stringify(output.spuitschrift));
require('fs').writeFileSync('/tmp/fase1_history.json', JSON.stringify(output.parcel_history));
console.log('OK');
" 2>&1

echo ""
echo "[3/3] Opslaan in database..."

# Save spuitschrift entries (one at a time for reliability)
echo "  Spuitschrift entries..."
SPUIT_OK=0
for i in $(seq 0 9); do
    ENTRY=$(node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/fase1_spuitschrift.json','utf8')); console.log(JSON.stringify(d[$i]))")
    RESULT=$(curl -s --connect-timeout 10 --max-time 30 -X POST "${SB}/rest/v1/spuitschrift" \
        -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
        -H "Content-Type: application/json" -H "Prefer: return=representation" \
        -d "$ENTRY" 2>&1)
    if echo "$RESULT" | grep -q '"id"'; then
        SPUIT_OK=$((SPUIT_OK + 1))
        DATE=$(echo "$RESULT" | python3 -c 'import sys,json; print(json.load(sys.stdin)[0]["date"][:10])' 2>/dev/null)
        echo "    ✅ R$(printf '%02d' $((i+1))) $DATE"
    else
        echo "    ❌ R$(printf '%02d' $((i+1))) FAILED: $(echo "$RESULT" | head -c 100)"
        # Retry once
        sleep 3
        RESULT=$(curl -s --connect-timeout 10 --max-time 30 -X POST "${SB}/rest/v1/spuitschrift" \
            -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
            -H "Content-Type: application/json" -H "Prefer: return=representation" \
            -d "$ENTRY" 2>&1)
        if echo "$RESULT" | grep -q '"id"'; then
            SPUIT_OK=$((SPUIT_OK + 1))
            echo "    ✅ R$(printf '%02d' $((i+1))) (retry OK)"
        fi
    fi
done
echo "  Spuitschrift: $SPUIT_OK/10"

# Save parcel_history in small batches (5 at a time)
echo "  Parcel history entries..."
TOTAL_HISTORY=$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/fase1_history.json','utf8')).length)")
BATCH_SIZE=5
HIST_OK=0
HIST_FAIL=0

for i in $(seq 0 $BATCH_SIZE $((TOTAL_HISTORY - 1))); do
    BATCH=$(node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/fase1_history.json','utf8')); console.log(JSON.stringify(d.slice($i, $i+$BATCH_SIZE)))")
    RESULT=$(curl -s --connect-timeout 10 --max-time 30 -X POST "${SB}/rest/v1/parcel_history" \
        -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
        -H "Content-Type: application/json" -H "Prefer: return=representation" \
        -d "$BATCH" 2>&1)
    if echo "$RESULT" | grep -q '"id"'; then
        COUNT=$(echo "$RESULT" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))' 2>/dev/null || echo "?")
        HIST_OK=$((HIST_OK + COUNT))
    else
        HIST_FAIL=$((HIST_FAIL + BATCH_SIZE))
        # Retry
        sleep 2
        RESULT=$(curl -s --connect-timeout 10 --max-time 30 -X POST "${SB}/rest/v1/parcel_history" \
            -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
            -H "Content-Type: application/json" -H "Prefer: return=representation" \
            -d "$BATCH" 2>&1)
        if echo "$RESULT" | grep -q '"id"'; then
            COUNT=$(echo "$RESULT" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))' 2>/dev/null || echo "0")
            HIST_OK=$((HIST_OK + COUNT))
            HIST_FAIL=$((HIST_FAIL - BATCH_SIZE))
        fi
    fi
done
echo "  Parcel history: $HIST_OK/$TOTAL_HISTORY saved"

echo ""
echo "═══════════════════════════════════════════"
echo "FASE 1 SAVE RESULTAAT"
echo "  Spuitschrift:    $SPUIT_OK/10"
echo "  Parcel history:  $HIST_OK/$TOTAL_HISTORY"
echo "═══════════════════════════════════════════"
