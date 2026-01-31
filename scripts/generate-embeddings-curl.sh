#!/bin/bash
# Generate CTGB Embeddings using curl for Supabase and Node.js for embeddings
# This works around Node.js v24 ECONNRESET issues with Cloudflare

set -e

# Load env vars
source .env.local 2>/dev/null || true

SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL}"
SUPABASE_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY}"
LIMIT="${1:-10}"
TEMP_DIR="/tmp/embeddings-$$"

mkdir -p "$TEMP_DIR"

echo "==================================="
echo "CTGB Embeddings Generator (curl)"
echo "==================================="
echo "Limit: $LIMIT products"
echo ""

# Check existing embeddings count
echo "Checking existing embeddings..."
EXISTING=$(curl -s "${SUPABASE_URL}/rest/v1/ctgb_regulation_embeddings?select=count" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Prefer: count=exact" | jq -r '.[0].count // 0')
echo "Existing embeddings: $EXISTING"

# Get existing product numbers (unique)
curl -s "${SUPABASE_URL}/rest/v1/ctgb_regulation_embeddings?select=product_toelatingsnummer" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  | jq -r '.[].product_toelatingsnummer' | sort -u > "$TEMP_DIR/existing.txt" 2>/dev/null || touch "$TEMP_DIR/existing.txt"

echo "Products with embeddings: $(wc -l < "$TEMP_DIR/existing.txt" | tr -d ' ')"

# Fetch CTGB products (sanitize control characters)
echo ""
echo "Fetching CTGB products..."
curl -s "${SUPABASE_URL}/rest/v1/ctgb_products?select=toelatingsnummer,naam,werkzame_stoffen,gebruiksvoorschriften&gebruiksvoorschriften=not.is.null&limit=${LIMIT}" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  | perl -pe 's/[\x00-\x08\x0B\x0C\x0E-\x1F]//g' > "$TEMP_DIR/products.json"

PRODUCT_COUNT=$(jq 'length' "$TEMP_DIR/products.json")
echo "Fetched $PRODUCT_COUNT products"

# Process each product
echo ""
echo "Processing products..."

TOTAL_GENERATED=0
ERRORS=0

for i in $(seq 0 $((PRODUCT_COUNT - 1))); do
  PRODUCT=$(jq ".[$i]" "$TEMP_DIR/products.json")
  NUMMER=$(echo "$PRODUCT" | jq -r '.toelatingsnummer')
  NAAM=$(echo "$PRODUCT" | jq -r '.naam')

  # Skip if already processed
  if grep -q "^${NUMMER}$" "$TEMP_DIR/existing.txt" 2>/dev/null; then
    echo "  Skipping $NAAM (already processed)"
    continue
  fi

  VOORSCHRIFTEN_COUNT=$(echo "$PRODUCT" | jq '.gebruiksvoorschriften | length')
  echo "  Processing $NAAM: $VOORSCHRIFTEN_COUNT voorschriften"

  # Save product for Node.js processing
  echo "$PRODUCT" > "$TEMP_DIR/current_product.json"

  # Generate embeddings using Node.js
  npx tsx -e "
import { config } from 'dotenv';
config({ path: '.env.local' });
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import * as fs from 'fs';

const ai = genkit({ plugins: [googleAI()] });

async function main() {
  const product = JSON.parse(fs.readFileSync('$TEMP_DIR/current_product.json', 'utf8'));
  const embeddings = [];

  for (const v of product.gebruiksvoorschriften || []) {
    const parts = [];
    parts.push('Product: ' + product.naam);
    if (product.werkzame_stoffen?.length) parts.push('Werkzame stoffen: ' + product.werkzame_stoffen.join(', '));
    if (v.gewas) parts.push('Gewas: ' + v.gewas);
    if (v.doelorganisme) parts.push('Doelorganisme: ' + v.doelorganisme);
    if (v.dosering) parts.push('Dosering: ' + v.dosering);
    if (v.maxToepassingen) parts.push('Maximum toepassingen: ' + v.maxToepassingen);
    if (v.veiligheidstermijn) parts.push('Veiligheidstermijn (VGT): ' + v.veiligheidstermijn);
    if (v.interval) parts.push('Interval: ' + v.interval);
    if (v.locatie) parts.push('Locatie: ' + v.locatie);

    const content = parts.join('\n');

    try {
      const result = await ai.embed({ embedder: 'googleai/text-embedding-004', content });
      const embedding = Array.isArray(result) && result[0]?.embedding ? result[0].embedding : result;

      embeddings.push({
        product_toelatingsnummer: product.toelatingsnummer,
        product_naam: product.naam,
        content,
        content_type: 'gebruiksvoorschrift',
        gewas: v.gewas || null,
        doelorganisme: v.doelorganisme || null,
        dosering: v.dosering || null,
        veiligheidstermijn: v.veiligheidstermijn || null,
        max_toepassingen: v.maxToepassingen || null,
        locatie: v.locatie || null,
        interval: v.interval || null,
        embedding: '[' + embedding.join(',') + ']'
      });

      // Rate limiting
      await new Promise(r => setTimeout(r, 100));
    } catch (err) {
      console.error('Embedding error:', err.message);
    }
  }

  fs.writeFileSync('$TEMP_DIR/embeddings.json', JSON.stringify(embeddings));
  console.log('Generated ' + embeddings.length + ' embeddings');
}

main().catch(console.error);
" 2>&1 || {
    echo "    Node.js embedding generation failed"
    ERRORS=$((ERRORS + 1))
    continue
  }

  # Check if embeddings were generated
  if [ ! -f "$TEMP_DIR/embeddings.json" ] || [ "$(jq 'length' "$TEMP_DIR/embeddings.json" 2>/dev/null)" = "0" ]; then
    echo "    No embeddings generated"
    continue
  fi

  EMBED_COUNT=$(jq 'length' "$TEMP_DIR/embeddings.json")
  TOTAL_GENERATED=$((TOTAL_GENERATED + EMBED_COUNT))

  # Insert embeddings in small batches of 3
  BATCH_SIZE=3
  INSERTED=0

  for batch_start in $(seq 0 $BATCH_SIZE $((EMBED_COUNT - 1))); do
    batch_end=$((batch_start + BATCH_SIZE))
    BATCH=$(jq ".[$batch_start:$batch_end]" "$TEMP_DIR/embeddings.json")
    BATCH_LEN=$(echo "$BATCH" | jq 'length')

    if [ "$BATCH_LEN" = "0" ]; then
      continue
    fi

    HTTP_CODE=$(curl -s --connect-timeout 30 --max-time 60 -o /dev/null -w "%{http_code}" -X POST \
      "${SUPABASE_URL}/rest/v1/ctgb_regulation_embeddings" \
      -H "apikey: ${SUPABASE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_KEY}" \
      -H "Content-Type: application/json" \
      -H "Prefer: return=minimal" \
      -d "$BATCH")

    if [ "$HTTP_CODE" = "201" ]; then
      INSERTED=$((INSERTED + BATCH_LEN))
    else
      # Retry once
      sleep 2
      HTTP_CODE=$(curl -s --connect-timeout 30 --max-time 60 -o /dev/null -w "%{http_code}" -X POST \
        "${SUPABASE_URL}/rest/v1/ctgb_regulation_embeddings" \
        -H "apikey: ${SUPABASE_KEY}" \
        -H "Authorization: Bearer ${SUPABASE_KEY}" \
        -H "Content-Type: application/json" \
        -H "Prefer: return=minimal" \
        -d "$BATCH")

      if [ "$HTTP_CODE" = "201" ]; then
        INSERTED=$((INSERTED + BATCH_LEN))
      else
        echo "    Batch insert failed (HTTP $HTTP_CODE)"
        ERRORS=$((ERRORS + BATCH_LEN))
      fi
    fi

    # Small delay between batches
    sleep 0.3
  done

  echo "    Inserted $INSERTED/$EMBED_COUNT embeddings"

  # Small delay between products
  sleep 1
done

# Final count
echo ""
echo "==================================="
echo "Summary"
echo "==================================="
echo "Total generated: $TOTAL_GENERATED"
echo "Errors: $ERRORS"

FINAL_COUNT=$(curl -s "${SUPABASE_URL}/rest/v1/ctgb_regulation_embeddings?select=count" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Prefer: count=exact" | jq -r '.[0].count // 0')
echo "Total in database: $FINAL_COUNT"

# Cleanup
rm -rf "$TEMP_DIR"

echo ""
echo "Done!"
