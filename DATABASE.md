# Database Overzicht — CropNode

> Supabase PostgreSQL database met pgvector voor embeddings.
> **Project URL:** `<your-project>.supabase.co`

---

## Connectie

```bash
# Supabase CLI (geinstalleerd via brew)
supabase --version  # 2.75.0

# Direct PostgreSQL
postgresql://postgres:[PASSWORD]@db.<your-project>.supabase.co:5432/postgres

# JavaScript Client
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
```

---

## Tabel Overzicht

### Actuele Data (feb 2025)

| Tabel | Rows | Beschrijving |
|-------|------|--------------|
| `parcels` | 13 | Hoofdpercelen (fysieke grenzen) |
| `sub_parcels` | 32 | Subpercelen/blokken (werkeenheid) |
| `logbook` | 26 | Conceptregistraties (draft) |
| `spuitschrift` | - | Bevestigde spuitregistraties |
| `parcel_history` | - | Historische spuitdata per perceel |
| `ctgb_products` | 1047 | CTGB gewasbeschermingsmiddelen |
| `active_substances` | 22 | Werkzame stoffen |
| `product_aliases` | 50 | Productnaam aliassen (AI parsing) |
| `task_types` | 5 | Taaktypen met uurtarieven |
| `task_logs` | - | Urenregistraties |
| `active_task_sessions` | - | Actieve timers |
| `pests_diseases` | 17 | Ziekten & plagen encyclopedie |
| `field_signals` | 0 | Veldobservaties (social feed) |
| `research_papers` | 0 | Onderzoeksdocumenten |
| `profiles` | 1 | Gebruikersprofielen |
| `smart_input_feedback` | 0 | User learning loop data |
| `inventory_movements` | 79 | Voorraadmutaties |
| `fertilizers` | 1791 | Meststoffen database |
| `soil_samples` | 0 | Bodemanalyses |
| `production_history` | 0 | Productie/oogst historie |
| `storage_cells` | - | Koelcellen |
| `storage_positions` | - | Posities in koelcellen |

---

## Schema Details

### Kern Tabellen

#### `parcels` — Hoofdpercelen
```sql
id TEXT PRIMARY KEY
name TEXT NOT NULL
area DECIMAL                    -- Totaal hectare
location JSONB                  -- {lat, lng}
geometry JSONB                  -- GeoJSON Polygon/MultiPolygon
source TEXT                     -- 'MANUAL' | 'RVO_IMPORT'
rvo_id TEXT                     -- Externe RVO identifier
user_id UUID → auth.users(id)
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

#### `sub_parcels` — Subpercelen/Blokken
```sql
id TEXT PRIMARY KEY
parcel_id TEXT → parcels(id) ON DELETE CASCADE
name TEXT                       -- Bloknaam (bijv. "V-haag")
crop TEXT NOT NULL              -- "Appel", "Peer"
variety TEXT NOT NULL           -- "Elstar", "Conference"
area FLOAT NOT NULL             -- Hectare (nauwkeurig voor dosering)

-- Gewogen structuren (JSONB arrays):
mutants JSONB                   -- [{value, percentage}]
rootstocks JSONB                -- [{value, percentage}]
interstocks JSONB               -- [{value, percentage}]
planting_years JSONB            -- [{value, percentage}]
planting_distances JSONB        -- [{value: {row, tree}, percentage}]

irrigation_type TEXT            -- 'Ja met fertigatie', 'Ja', 'Nee', 'Deels'
irrigation_percentage INT
frost_protection_type TEXT      -- 'Ja', 'Nee', 'Deels'
frost_protection_percentage INT
user_id UUID → auth.users(id)
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

#### `logbook` — Conceptregistraties
```sql
id TEXT PRIMARY KEY
raw_input TEXT                  -- Originele tekstinvoer
status TEXT                     -- 'Nieuw', 'Analyseren...', 'Te Controleren',
                                -- 'Akkoord', 'Waarschuwing', 'Fout', 'Afgekeurd'
date TIMESTAMPTZ                -- Spuitdatum
parsed_data JSONB               -- {plots: [], products: [{product, dosage, unit}]}
validation_message TEXT
original_logbook_id TEXT        -- Bij terugzetten van spuitschrift
user_id UUID → auth.users(id)
created_at TIMESTAMPTZ
```

#### `spuitschrift` — Bevestigde Registraties
```sql
id TEXT PRIMARY KEY
spuitschrift_id TEXT            -- Zelf-referentie
original_logbook_id TEXT        -- ID van originele logbook entry
original_raw_input TEXT
date TIMESTAMPTZ                -- Spuitdatum
plots TEXT[]                    -- Array van perceelnamen
products JSONB                  -- [{product, dosage, unit, targetReason?, doelorganisme?}]
validation_message TEXT
status TEXT                     -- 'Akkoord' | 'Waarschuwing'
user_id UUID → auth.users(id)
created_at TIMESTAMPTZ
```

#### `parcel_history` — Spuithistorie per Perceel
```sql
id TEXT PRIMARY KEY
log_id TEXT                     -- Originele logbook ID
spuitschrift_id TEXT            -- Spuitschrift entry ID
parcel_id TEXT
parcel_name TEXT
crop TEXT
variety TEXT
product TEXT
dosage DECIMAL
unit TEXT
date TIMESTAMPTZ
user_id UUID → auth.users(id)
```

---

### CTGB Product Database

#### `ctgb_products` — Gewasbeschermingsmiddelen
```sql
toelatingsnummer TEXT PRIMARY KEY
id TEXT NOT NULL
naam TEXT NOT NULL
status TEXT DEFAULT 'Valid'     -- 'Valid', 'Expired', 'Revoked'
vervaldatum TEXT
categorie TEXT                  -- 'Gewas', etc.
toelatingshouder TEXT
werkzame_stoffen TEXT[]         -- Array van actieve stoffen
samenstelling JSONB             -- {formuleringstype, stoffen: [{naam, casNummer, concentratie}]}
gebruiksvoorschriften JSONB     -- Zie structuur hieronder
etikettering JSONB              -- {ghsSymbolen[], hZinnen[], pZinnen[], signaalwoord}
search_keywords TEXT[]
last_synced_at TIMESTAMPTZ
```

**gebruiksvoorschriften JSONB structuur:**
```json
[{
  "gewas": "Appel",
  "doelorganisme": "Schurft (Venturia inaequalis)",
  "locatie": "Onbedekt",
  "toepassingsmethode": "Spuiten",
  "dosering": "2.25 kg/ha",
  "maxToepassingen": 8,
  "maxToepassingenPerTeeltcyclus": 8,
  "veiligheidstermijn": "21 dagen",
  "interval": "min. 7 dagen",
  "opmerkingen": ["..."],
  "wCodes": ["W1", "W2"]
}]
```

#### `active_substances` — Werkzame Stoffen
```sql
code TEXT PRIMARY KEY
name TEXT NOT NULL
name_en TEXT
cas_number TEXT
max_kg_per_year DECIMAL(10,4)
max_applications_per_year INTEGER
max_kg_per_application DECIMAL(10,4)
category TEXT                   -- 'Fungicide', 'Insecticide', etc.
mode_of_action TEXT
resistance_group TEXT
status TEXT DEFAULT 'active'
restriction_notes TEXT
```

#### `product_aliases` — Productnaam Aliassen
```sql
id UUID PRIMARY KEY
alias TEXT NOT NULL UNIQUE      -- Gebruikersnaam (bijv. "merpan")
official_name TEXT NOT NULL     -- Officiële CTGB naam
product_id TEXT                 -- Optionele link naar ctgb_products
usage_count INTEGER DEFAULT 0
confidence DECIMAL(3,2) DEFAULT 1.0
created_at TIMESTAMPTZ
```

---

### Team & Taken

#### `task_types` — Taaktypen
```sql
id UUID PRIMARY KEY
name TEXT NOT NULL UNIQUE       -- 'Snoeien', 'Dunnen', 'Plukken', 'Sorteren', 'Onderhoud'
default_hourly_rate DECIMAL(10,2) DEFAULT 25.00
user_id UUID → auth.users(id)
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

#### `task_logs` — Urenregistraties
```sql
id UUID PRIMARY KEY
start_date DATE NOT NULL
end_date DATE NOT NULL
days DECIMAL(5,2) NOT NULL      -- Werkdagen (Ma-Vr=1, Za=0.5, Zo=0)
sub_parcel_id TEXT → sub_parcels(id)
task_type_id UUID NOT NULL → task_types(id)
people_count INTEGER NOT NULL
hours_per_person DECIMAL(5,2) NOT NULL
total_hours DECIMAL(10,2) GENERATED ALWAYS AS (people_count * hours_per_person * days) STORED
notes TEXT
user_id UUID → auth.users(id)
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

#### `active_task_sessions` — Actieve Timers
```sql
id UUID PRIMARY KEY
task_type_id UUID NOT NULL → task_types(id)
sub_parcel_id TEXT → sub_parcels(id)
start_time TIMESTAMPTZ NOT NULL
people_count INTEGER NOT NULL
notes TEXT
user_id UUID → auth.users(id)
created_at TIMESTAMPTZ
```

---

### Voorraad & Meststoffen

#### `inventory_movements` — Voorraadmutaties
```sql
id UUID PRIMARY KEY
product_name TEXT NOT NULL
quantity DECIMAL NOT NULL
unit TEXT NOT NULL
type TEXT NOT NULL              -- 'addition', 'usage', 'correction'
date TIMESTAMPTZ NOT NULL
description TEXT
reference_id TEXT               -- Bijv. spuitschrift_id
user_id UUID → auth.users(id)
created_at TIMESTAMPTZ
```

#### `fertilizers` — Meststoffen Database
```sql
id UUID PRIMARY KEY
name TEXT NOT NULL
manufacturer TEXT
category TEXT                   -- 'Leaf', 'Fertigation', 'Soil'
unit TEXT                       -- 'L', 'kg'
composition JSONB               -- {N, P, K, MgO, SO3, CaO, S, Fe, Mn, Zn, Cu, B, Mo}
search_keywords TEXT[]
created_at TIMESTAMPTZ
```

---

### Research & Knowledge

#### `pests_diseases` — Ziekten & Plagen
```sql
id UUID PRIMARY KEY
name TEXT NOT NULL              -- 'Schurft', 'Fruitmot'
latin_name TEXT                 -- 'Venturia inaequalis'
type TEXT                       -- 'fungus', 'insect', 'bacteria', 'virus', 'mite', 'other'
crop TEXT                       -- 'apple', 'pear', 'both'
impact_level TEXT               -- 'low', 'medium', 'high', 'critical'
subtitle TEXT
hero_image_url TEXT
gallery_images JSONB            -- [{url, caption, stage}]
overwintering TEXT
infection_conditions TEXT
damage_threshold TEXT
lifecycle_timeline JSONB        -- [{month: 1-12, activity, intensity: 0-100}]
symptoms JSONB                  -- [{stage, description, imageUrl?}]
biological_control TEXT
cultural_control TEXT
chemical_control TEXT
tags TEXT[]
search_keywords TEXT[]
related_products TEXT[]         -- CTGB product IDs
external_links JSONB            -- [{title, url, source}]
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

#### `field_signals` — Veldobservaties
```sql
id UUID PRIMARY KEY
author_id UUID → auth.users(id)
content TEXT NOT NULL
media_url TEXT
visibility TEXT                 -- 'public', 'private'
tags TEXT[] NOT NULL            -- ['Appel', 'Peer', 'Schurft', 'Kanker', ...]
embedding VECTOR(768)           -- pgvector voor semantic search
likes_count INT DEFAULT 0
created_at TIMESTAMPTZ
```

#### `research_papers` — Onderzoeksdocumenten
```sql
id UUID PRIMARY KEY
title TEXT NOT NULL
summary_ai TEXT
content_url TEXT                -- PDF in storage bucket
category TEXT                   -- 'disease', 'storage', 'cultivation', 'general'
verdict TEXT                    -- 'practical', 'experimental', 'theoretical'
tags TEXT[]
embedding VECTOR(768)
created_at TIMESTAMPTZ
```

---

### Bodem & Productie

#### `soil_samples` — Bodemanalyses
```sql
id UUID PRIMARY KEY
sub_parcel_id TEXT → sub_parcels(id)
sample_date DATE NOT NULL
n_total DECIMAL
p_available DECIMAL
k_value DECIMAL
organic_matter DECIMAL
ph DECIMAL
pdf_url TEXT
raw_data JSONB
created_at TIMESTAMPTZ
```

#### `production_history` — Oogsthistorie
```sql
id UUID PRIMARY KEY
sub_parcel_id TEXT → sub_parcels(id)
year INTEGER NOT NULL
tonnage DECIMAL NOT NULL
size_distribution JSONB         -- {"70-75": 20, "75-80": 50, ...}
created_at TIMESTAMPTZ
```

---

### Opslag (Koelcelbeheer)

#### `storage_cells` — Koelcellen
```sql
id UUID PRIMARY KEY
name TEXT NOT NULL
width INTEGER                   -- Columns (crate positions)
depth INTEGER                   -- Rows (crate positions)
blocked_positions JSONB         -- [{row, col}]
status TEXT                     -- 'active', 'inactive', 'maintenance'
user_id UUID → auth.users(id)
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

#### `storage_positions` — Posities in Koelcellen
```sql
id UUID PRIMARY KEY
cell_id UUID → storage_cells(id)
row_index INTEGER
col_index INTEGER
variety TEXT
sub_parcel_id TEXT
date_stored TIMESTAMPTZ
quantity INTEGER
quality_class TEXT              -- 'Klasse I', 'Klasse II', 'Industrie'
notes TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

---

### User & Feedback

#### `profiles` — Gebruikersprofielen
```sql
id UUID PRIMARY KEY → auth.users(id)
email TEXT
full_name TEXT
company_name TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

#### `smart_input_feedback` — AI Learning Loop
```sql
id UUID PRIMARY KEY
type TEXT                       -- 'dosage', 'parcel_group', 'product_combo', 'correction'
key TEXT                        -- Bijv. productnaam of "product1+product2"
value TEXT                      -- Bijv. "1.5 kg/ha" of "appels"
frequency INTEGER DEFAULT 1
last_used TIMESTAMPTZ
metadata JSONB
user_id UUID → auth.users(id)
created_at TIMESTAMPTZ
```

#### `user_preferences` — Gebruikersvoorkeuren
```sql
id UUID PRIMARY KEY
alias TEXT                      -- Bijv. "captan"
preferred TEXT                  -- Bijv. "Captan 80 WDG"
user_id UUID → auth.users(id)
created_at TIMESTAMPTZ
```

---

## Views

| View | Beschrijving |
|------|--------------|
| `v_sprayable_parcels` | Flat view van sub_parcels met leesbare namen voor spuit-UI |
| `v_active_parcels` | Percelen met eerste subperceel info |
| `v_task_logs_enriched` | Task logs met taaktype en perceel namen + kosten |
| `v_active_task_sessions_enriched` | Actieve sessies met taaktype info |
| `v_storage_cells_summary` | Koelcellen met vullingsgraad en dominante ras |
| `v_substances_summary` | Werkzame stoffen met aantal producten |

---

## Row Level Security (RLS)

Alle user-owned tabellen hebben RLS enabled met `auth.uid()` check:

```sql
-- Voorbeeld policy
CREATE POLICY "Users can view own parcels" ON parcels
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own parcels" ON parcels
  FOR INSERT WITH CHECK (auth.uid() = user_id);
```

**Tabellen met RLS:**
- `parcels`, `sub_parcels`
- `logbook`, `spuitschrift`, `parcel_history`
- `task_types`, `task_logs`, `active_task_sessions`
- `inventory_movements`
- `field_signals`, `field_signal_reactions`
- `storage_cells`, `storage_positions`
- `profiles`, `user_preferences`, `smart_input_feedback`

**Publieke tabellen (geen RLS):**
- `ctgb_products`, `active_substances`, `product_aliases`
- `pests_diseases`, `fertilizers`
- `research_papers`

---

## Indexes

```sql
-- CTGB product search
CREATE INDEX idx_ctgb_products_naam ON ctgb_products USING gin(naam gin_trgm_ops);
CREATE INDEX idx_ctgb_products_search ON ctgb_products USING gin(search_keywords);

-- Perceel lookups
CREATE INDEX idx_sub_parcels_parcel_id ON sub_parcels(parcel_id);
CREATE INDEX idx_sub_parcels_variety ON sub_parcels(variety);

-- History queries
CREATE INDEX idx_parcel_history_date ON parcel_history(date DESC);
CREATE INDEX idx_parcel_history_parcel ON parcel_history(parcel_id);

-- Vector search (pgvector)
CREATE INDEX idx_field_signals_embedding ON field_signals USING ivfflat(embedding vector_cosine_ops);
CREATE INDEX idx_research_papers_embedding ON research_papers USING ivfflat(embedding vector_cosine_ops);
```

---

## Migraties

Database migraties worden beheerd via Supabase Dashboard of SQL scripts in `/sql/`:

```bash
# Via Supabase CLI (na setup)
supabase db push

# Of direct in SQL Editor
-- sql/001_initial_schema.sql
-- sql/002_add_storage.sql
```

---

## Backup & Restore

```bash
# Via Supabase Dashboard: Settings > Database > Backups
# Automatische dagelijkse backups (7 dagen retentie op Free tier)

# Manual export
pg_dump $SUPABASE_DB_URL > backup.sql
```

---

*Laatste update: februari 2025*
