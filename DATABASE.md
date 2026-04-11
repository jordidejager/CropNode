# Database Overzicht — CropNode

> Supabase PostgreSQL database met pgvector voor embeddings.
> **Project URL:** `djcsihpnidopxxuxumvj.supabase.co`

---

## Tabel Overzicht

### Actuele Data (april 2026)

| Tabel | Rows | Beschrijving |
|-------|------|--------------|
| **Unified Products** | | |
| `products` | 2.910 | Unified entry point — alle producten (CTGB + meststoffen) |
| `product_aliases_unified` | 182 | Aliassen voor productherkenning (naam, werkzame stof, typo) |
| **CTGB Gewasbescherming** | | |
| `ctgb_products` | 1.047 | Gewasbeschermingsmiddelen met WG-voorschriften |
| `active_substances` | 110+ | Werkzame stoffen met FRAC/IRAC codes |
| `product_substances` | 370+ | Junction: product ↔ werkzame stof |
| `ctgb_usage_restrictions` | 2.281 | Gestructureerde restricties uit GV opmerkingen |
| `ctgb_regulation_embeddings` | 40 | pgvector embeddings voor semantic search |
| **Meststoffen** | | |
| `fertilizers` | 1.872 | Bladmeststoffen, strooimeststoffen, fertigatie |
| `fertilizer_aliases` | 133 | Legacy aliassen (gemigreerd naar product_aliases_unified) |
| **Registraties** | | |
| `spuitschrift` | ~30 | Bevestigde spuit-/bemestingsregistraties |
| `logbook` | ~26 | Conceptregistraties (draft) |
| `parcel_history` | ~701 | Historische toepassingsdata per perceel |
| `inventory_movements` | ~79 | Voorraadmutaties (verbruik/toevoeging) |
| **Percelen** | | |
| `parcels` | 13 | Hoofdpercelen (fysieke grenzen) |
| `sub_parcels` | 32 | Subpercelen/blokken (werkeenheid) |
| `parcel_groups` | - | Perceelgroepen voor batch-invoer |
| **Sync & Logging** | | |
| `sync_log` | - | Sync-run logging (bron, status, aantallen) |
| `product_changelog` | - | Per-product wijzigingshistorie |
| **Overige** | | |
| `soil_samples` | - | Bodemanalyses (Eurofins PDF parsing) |
| `production_history` | - | Oogsthistorie per perceel |
| `storage_cells` | - | Koelcellen |
| `storage_positions` | - | Posities in koelcellen |
| `task_types` | 5 | Taaktypen met uurtarieven |
| `task_logs` | - | Urenregistraties |
| `pests_diseases` | 17 | Ziekten & plagen encyclopedie |
| `field_signals` | - | Veldobservaties (social feed) |
| `kb_topics` | ~495 | Kennisbank artikelen |
| `profiles` | - | Gebruikersprofielen |

---

## Unified Product Database Architectuur

```
products (unified entry point, 2.910 records)
  ├── source='ctgb' → ctgb_products (detail via source_id=toelatingsnummer)
  └── source='fertilizer' → fertilizers (detail via source_id=fertilizer.id)

product_aliases_unified (182 aliassen)
  └── product_id → products.id

active_substances (110+ stoffen met FRAC/IRAC)
  └── product_substances (junction) → ctgb_products.toelatingsnummer

ctgb_usage_restrictions (2.281 gestructureerde restricties)
  └── product_toelatingsnummer → ctgb_products.toelatingsnummer
```

### `products` — Unified Entry Point
```sql
id UUID PRIMARY KEY
name TEXT NOT NULL
product_type TEXT            -- fungicide, insecticide, herbicide, bladmeststof, strooimeststof, etc.
source TEXT NOT NULL          -- 'ctgb', 'fertilizer', 'manual'
source_id TEXT                -- toelatingsnummer (ctgb) of fertilizer.id
status TEXT DEFAULT 'active'  -- active, expired, withdrawn
search_keywords TEXT[]
UNIQUE(source, source_id)
-- Indexes: trigram op name, GIN op search_keywords, btree op (source, source_id)
```

### `ctgb_products` — Gewasbeschermingsmiddelen (detail)
```sql
toelatingsnummer TEXT PRIMARY KEY
id TEXT NOT NULL              -- MST API ID
naam TEXT NOT NULL
status TEXT DEFAULT 'Valid'
vervaldatum TEXT
categorie TEXT
toelatingshouder TEXT
product_types TEXT[]          -- ['Fungicide'], ['Insecticide', 'Acaricide'], etc.
werkzame_stoffen TEXT[]       -- ['captan'], ['boscalid', 'pyraclostrobin']
samenstelling JSONB           -- {formuleringstype, stoffen: [{naam, casNummer, concentratie}]}
gebruiksvoorschriften JSONB   -- Array, zie structuur hieronder
etikettering JSONB            -- {ghsSymbolen[], hZinnen[], pZinnen[], signaalwoord}
embedding VECTOR(768)         -- pgvector voor semantic search
search_keywords TEXT[]
last_synced_at TIMESTAMPTZ
```

**gebruiksvoorschriften JSONB structuur (verrijkt):**
```json
{
  "gewas": "Appel, Japanse peer, Peer, Kweepeer, Mispel, Overige pitvruchten",
  "doelorganisme": "Appelschurft, Bewaarschurft, Schurft",
  "locatie": "Onbedekt",
  "toepassingsmethode": "Gewasbehandeling",
  "dosering": "0.71 kg/ha",
  "maxToepassingen": 15,
  "veiligheidstermijn": "28 dagen",
  "interval": "min. 7 dagen",
  "bbchVan": "51",
  "bbchTot": "85",
  "seizoenVan": 4,
  "seizoenTot": 8,
  "spuitvolumeMin": 450,
  "spuitvolumeMax": 592,
  "maxDoseringPerSeizoen": "15.4 kg/ha",
  "phiDagen": 28,
  "intervalDagen": 7,
  "opmerkingen": ["Dosering: 0,12% (120 g per 100 l water)..."],
  "wCodes": ["W1", "W2"]
}
```

### `active_substances` — Werkzame Stoffen
```sql
code TEXT PRIMARY KEY         -- 'captan', 'difenoconazool', etc.
name TEXT NOT NULL            -- Nederlandse naam
name_en TEXT                  -- Engelse naam
cas_number TEXT               -- CAS nummer
category TEXT                 -- Fungicide, Insecticide, Acaricide, Feromoon, Groeiregulator
resistance_group TEXT         -- FRAC/IRAC code (M4, 3, 11, 7, etc.)
mode_of_action TEXT           -- 'DMI triazool', 'QoI strobilurin', 'SDHI', etc.
max_applications_per_year INT
max_kg_per_year DECIMAL
status TEXT DEFAULT 'active'
```

### `product_aliases_unified` — Productherkenning
```sql
id UUID PRIMARY KEY
product_id UUID → products(id)
alias TEXT NOT NULL            -- 'captan', 'delan', 'kas', 'bitterzout', 'scoor' (typo)
alias_type TEXT                -- 'name', 'werkzame_stof', 'typo', 'abbreviation', 'merknaam'
source TEXT                    -- 'system', 'manual', 'user_correction', 'migrated'
confidence NUMERIC DEFAULT 1.0
usage_count INTEGER DEFAULT 0
-- Unique case-insensitive index on alias
```

### `ctgb_usage_restrictions` — Gestructureerde Restricties
```sql
id UUID PRIMARY KEY
product_toelatingsnummer TEXT
gv_index INTEGER              -- Index in de gebruiksvoorschriften array
gewas TEXT
restriction_type TEXT          -- bbch_stadiums, grondwater, concentratie, resistentie, drift, bufferzone
value TEXT                     -- Geextraheerde waarde (bijv. "BBCH 51-59 en BBCH 70-85")
raw_text TEXT                  -- Originele opmerkingstekst
parameters JSONB               -- Gestructureerde parameters
```

### `fertilizers` — Meststoffen (detail)
```sql
id TEXT PRIMARY KEY
name TEXT NOT NULL
manufacturer TEXT
category TEXT                  -- 'Leaf', 'Fertigation', 'Soil'
unit TEXT                      -- 'L', 'kg'
composition JSONB              -- {N, P, K, MgO, CaO, Fe, Mn, Zn, Cu, B, Mo, ...}
search_keywords TEXT[]
description TEXT               -- Auto-gegenereerde NL beschrijving
formulation TEXT               -- 'SL', 'SC', 'WG', etc.
density NUMERIC                -- Dichtheid vloeibaar (L↔kg conversie)
dosage_fruit TEXT              -- Doserings-advies fruitteelt
application_timing TEXT        -- Toepassingsperiode advies
composition_forms JSONB        -- Chemische vorm per element
```

---

## WhatsApp Bot Database Functies (RPC)

| Functie | Doel | Voorbeeld |
|---------|------|-----------|
| `fn_search_products(query, source?, max)` | Fuzzy zoeken over alle producten | "Score" → Score 250 EC |
| `fn_get_product_for_crop(product, gewas)` | Dosering/PHI/interval per gewas | "Merpan" + "appel" → 0.71 kg/ha, PHI 28d |
| `fn_find_products_for_organism(doel, gewas?)` | Reverse lookup: doelorganisme → producten | "schurft" + "peer" → 60 fungiciden |
| `fn_check_product_status(product)` | Toelatingscheck + vervaldatum | "Decis" → Toegelaten tot 2027 |

### Views
| View | Beschrijving |
|------|--------------|
| `v_product_card` | Complete productkaart (CTGB of meststof) voor AI context |
| `v_products_ctgb` | Products + CTGB details joined |
| `v_products_fertilizer` | Products + meststof details joined |
| `v_sprayable_parcels` | Subpercelen met leesbare namen voor spuit-UI |
| `v_products_with_substances` | Products + werkzame stoffen joined |
| `v_substances_summary` | Stoffen met aantal producten |

---

## Sync Infrastructuur

### Automatische Synchronisatie (Vercel Cron)
| Bron | Schedule | Endpoint |
|------|----------|----------|
| CTGB (MST API) | Wekelijks ma 03:00 | `/api/cron/sync-products?source=ctgb` |
| Meststoffen | Maandelijks 1e 04:00 | `/api/cron/sync-products?source=fertilizer` |

### `sync_log` — Sync Logging
```sql
id UUID PRIMARY KEY
source TEXT                    -- 'ctgb', 'fertilizer', 'all'
started_at TIMESTAMPTZ
completed_at TIMESTAMPTZ
status TEXT                    -- 'running', 'success', 'partial', 'failed'
products_added INTEGER
products_updated INTEGER
products_withdrawn INTEGER
errors JSONB
summary TEXT
triggered_by TEXT              -- 'manual', 'cron', 'webhook'
```

### Scripts
```bash
# Handmatige sync
npx tsx scripts/sync-products.ts                    # Sync unified products tabel
npx tsx scripts/sync-ctgb-supabase.ts               # Volledige CTGB re-sync van MST API

# Data verrijking
npx tsx scripts/enrich-ctgb-batch.ts --phase=1      # Fetch MST API → lokaal JSON
npx tsx scripts/enrich-ctgb-batch.ts --phase=2      # Schrijf naar Supabase
npx tsx scripts/enrich-fertilizers.ts               # Genereer meststof beschrijvingen
npx tsx scripts/parse-gv-restrictions.ts            # Parse restricties uit opmerkingen

# Rapportage
npx tsx scripts/product-quality-report.ts           # Data kwaliteitsrapport
npx tsx scripts/test-whatsapp-queries.ts            # WhatsApp readiness test
```

---

## Row Level Security (RLS)

**Publieke tabellen (leesbaar zonder authenticatie):**
- `ctgb_products`, `fertilizers`, `products`, `product_aliases_unified`
- `active_substances`, `product_substances`, `ctgb_usage_restrictions`
- `pests_diseases`, `kb_topics`

**User-owned tabellen (RLS met `auth.uid() = user_id`):**
- `parcels`, `sub_parcels`, `parcel_groups`
- `logbook`, `spuitschrift`, `parcel_history`
- `inventory_movements`, `soil_samples`, `production_history`
- `task_types`, `task_logs`, `active_task_sessions`
- `storage_cells`, `storage_positions`
- `profiles`, `user_preferences`, `smart_input_feedback`

---

## Migraties

Migraties staan in `supabase/migrations/` en worden gerund via de Supabase SQL Editor.
Nummering: `001_` t/m `045_`. Gebruik `IF NOT EXISTS` en `ON CONFLICT` voor idempotentie.

---

*Laatste update: april 2026*
