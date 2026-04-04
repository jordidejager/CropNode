# supabase-store.ts Refactor Plan

## Huidige situatie
- 4.056 regels, 111 exports in één bestand
- Onmogelijk om te navigeren, testen, of reviews te doen

## Doel
Split in domein-modules onder `src/lib/supabase/`:

| Module | Functies | ~Regels |
|--------|----------|---------|
| `queries/spuitschrift.ts` | getSpuitschrift*, addSpuitschrift*, deleteSpuitschrift*, updateSpuitschrift* | ~350 |
| `queries/logbook.ts` | getLogbook*, addLogbook*, deleteLogbook*, parcelHistory* | ~300 |
| `queries/parcels.ts` | getParcels, getSprayableParcels*, addParcel, updateParcel, deleteParcel, subParcels, groups, synonyms | ~600 |
| `queries/products.ts` | searchCtgb*, getCtgb*, getAllCtgb*, getFertilizers*, getProductAliases*, doelorganismen* | ~500 |
| `queries/storage.ts` | storageCells, complexes, positions, cellSubParcels, fill* | ~700 |
| `queries/harvest.ts` | getHarvestRegistrations, create/update/delete, seasons | ~300 |
| `queries/tasks.ts` | taskTypes, taskLogs, taskSessions | ~400 |
| `queries/misc.ts` | inventory, fieldSignals, userPreferences, syncLog | ~300 |
| `queries/auth.ts` | getCurrentUserId | ~50 |

## Migratie strategie (zero-breaking-changes)
1. Maak `src/lib/supabase/queries/*.ts` bestanden aan
2. Verplaats functies per domein
3. Update `supabase-store.ts` → re-export alles vanuit queries:
   ```ts
   export * from './supabase/queries/spuitschrift';
   export * from './supabase/queries/logbook';
   // etc.
   ```
4. Alle bestaande imports blijven werken
5. Geleidelijk imports updaten naar directe imports (per PR)

## Prioriteit
Laag urgentie, hoog impact op lange termijn. Plan: aparte PR per domein-module.
