/**
 * Temporary script to fetch multi-model and ensemble data for existing weather stations.
 * Run: npx tsx scripts/fetch-expert-data.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Import dynamically to avoid module issues
async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log('🔍 Finding weather stations...');
  const { data: stations, error: stationsError } = await supabase
    .from('weather_stations')
    .select('id, latitude, longitude, name');

  if (stationsError) {
    console.error('❌ Failed to fetch stations:', stationsError.message);
    process.exit(1);
  }

  if (!stations || stations.length === 0) {
    console.error('❌ No weather stations found');
    process.exit(1);
  }

  console.log(`✅ Found ${stations.length} station(s):`);
  for (const s of stations) {
    console.log(`   - ${s.name ?? 'Unnamed'} (${s.latitude}, ${s.longitude}) [${s.id}]`);
  }

  for (const station of stations) {
    console.log(`\n📡 Processing station: ${station.name ?? station.id}`);

    // --- Multi-model fetch ---
    console.log('  🌤️  Fetching multi-model data...');
    try {
      const { fetchMultiModelData, parseMultiModelResponse } = await import('../src/lib/weather/open-meteo-client');

      const response = await fetchMultiModelData(
        parseFloat(station.latitude),
        parseFloat(station.longitude)
      );

      const modelRows = parseMultiModelResponse(response, station.id);
      let totalMultiModel = 0;

      for (const [modelName, rows] of modelRows) {
        console.log(`    Model ${modelName}: ${rows.length} rows`);

        // Upsert in batches
        const BATCH_SIZE = 500;
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          const batch = rows.slice(i, i + BATCH_SIZE);
          const { error } = await supabase
            .from('weather_data_hourly')
            .upsert(batch, {
              onConflict: 'station_id,timestamp,model_name,is_forecast',
              ignoreDuplicates: false,
            });

          if (error) {
            console.error(`    ❌ Upsert error for ${modelName}:`, error.message);
          } else {
            totalMultiModel += batch.length;
          }
        }
      }
      console.log(`  ✅ Multi-model: ${totalMultiModel} records inserted (${modelRows.size} models)`);
    } catch (err) {
      console.error('  ❌ Multi-model fetch failed:', err);
    }

    // --- Ensemble fetch ---
    console.log('  🌊 Fetching ensemble data...');
    try {
      const { fetchEnsembleData, parseEnsembleResponse } = await import('../src/lib/weather/open-meteo-client');

      const response = await fetchEnsembleData(
        parseFloat(station.latitude),
        parseFloat(station.longitude)
      );

      const rows = parseEnsembleResponse(response, station.id);
      console.log(`    Parsed ${rows.length} ensemble rows`);

      if (rows.length === 0) {
        console.error('    ⚠️ No ensemble rows parsed — check key patterns');

        // Debug: show hourly keys
        const hourly = (response as Record<string, unknown>).hourly as Record<string, unknown> | undefined;
        if (hourly) {
          const keys = Object.keys(hourly).filter(k => k.includes('member'));
          console.log(`    Keys sample: ${keys.slice(0, 5).join(', ')}`);
        }
      } else {
        // Count by model
        const modelCounts = new Map<string, Set<number>>();
        for (const row of rows) {
          const model = row.model_name as string;
          if (!modelCounts.has(model)) modelCounts.set(model, new Set());
          modelCounts.get(model)!.add(row.member as number);
        }

        for (const [model, members] of modelCounts) {
          console.log(`    Model ${model}: ${members.size} members`);
        }

        // Upsert in batches
        const BATCH_SIZE = 500;
        let totalInserted = 0;

        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          const batch = rows.slice(i, i + BATCH_SIZE);
          const { error } = await supabase
            .from('weather_ensemble_hourly')
            .upsert(batch, {
              onConflict: 'station_id,timestamp,model_name,member',
              ignoreDuplicates: false,
            });

          if (error) {
            console.error(`    ❌ Ensemble upsert error:`, error.message);
          } else {
            totalInserted += batch.length;
          }
        }
        console.log(`  ✅ Ensemble: ${totalInserted} records inserted`);
      }
    } catch (err) {
      console.error('  ❌ Ensemble fetch failed:', err);
    }
  }

  // --- Verify ---
  console.log('\n📊 Verification:');

  const { data: multiModelCount } = await supabase
    .from('weather_data_hourly')
    .select('model_name')
    .neq('model_name', 'best_match')
    .limit(1000);

  if (multiModelCount) {
    const models = new Map<string, number>();
    for (const r of multiModelCount) {
      models.set(r.model_name, (models.get(r.model_name) ?? 0) + 1);
    }
    console.log('  Multi-model data:');
    for (const [model, count] of models) {
      console.log(`    ${model}: ${count}+ rows`);
    }
  }

  const { data: ensembleCount } = await supabase
    .from('weather_ensemble_hourly')
    .select('model_name, member')
    .limit(1000);

  if (ensembleCount) {
    const models = new Map<string, Set<number>>();
    for (const r of ensembleCount) {
      if (!models.has(r.model_name)) models.set(r.model_name, new Set());
      models.get(r.model_name)!.add(r.member);
    }
    console.log('  Ensemble data:');
    for (const [model, members] of models) {
      console.log(`    ${model}: ${members.size} members`);
    }
  }

  console.log('\n✅ Done!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
