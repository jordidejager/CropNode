# CLAUDE.md - CropNode

> Een intelligente gewasbeschermingsmanagement-applicatie voor Nederlandse fruitteelt (appels en peren).

## Techstack

### Core Framework
| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | Next.js (App Router + Turbopack) | 15.5.9 |
| Language | TypeScript | ^5 |
| React | React | ^19.2.1 |
| Runtime | Node.js | ES2017+ |

### AI & LLM
| Component | Technology | Purpose |
|-----------|-----------|---------|
| AI Framework | Genkit | ^1.20.0 |
| LLM Model | Google Gemini 2.5 Flash Lite | Intent classification & parsing |
| Embeddings | googleai/text-embedding-004 | 768-dim vectors voor RAG |
| Package | @genkit-ai/google-genai | ^1.20.0 |

### Database & Auth
| Component | Technology | Details |
|-----------|-----------|---------|
| Primary DB | Supabase (PostgreSQL) | Met pgvector voor embeddings |
| Auth | Supabase Auth | Email/password |
| Client | @supabase/supabase-js | ^2.90.1 |
| SSR | @supabase/ssr | ^0.8.0 |
| Query Client | TanStack React Query | ^5.90.18 |

### Frontend UI
| Component | Technology |
|-----------|-----------|
| UI Library | shadcn/ui + Radix UI |
| Styling | Tailwind CSS ^3.4.1 |
| Animations | Framer Motion ^12.26.2 |
| Icons | lucide-react ^0.475.0 |
| Maps | Leaflet ^1.9.4 + leaflet-draw |
| Charts | Recharts ^2.15.1 |
| Forms | react-hook-form + Zod |

### External APIs
| API | Doel | Endpoint |
|-----|------|----------|
| Gemini API | AI parsing & embeddings | Via Genkit |
| PDOK Gewaspercelen | RVO parcel data | `api.pdok.nl/rvo/gewaspercelen/` |
| PDOK Locatieserver | Adres zoeken | `api.pdok.nl/bzk/locatieserver/` |

---

## Database Structuur

### Core Tabellen

#### `parcels` - Hoofdpercelen (fysieke/juridische grenzen)
```sql
id TEXT PRIMARY KEY
name TEXT NOT NULL
area DECIMAL                    -- Totaal hectare
location JSONB                  -- {lat, lng}
geometry JSONB                  -- GeoJSON Polygon/MultiPolygon
source TEXT                     -- 'MANUAL' of 'RVO_IMPORT'
rvo_id TEXT                     -- Externe RVO identifier
user_id UUID → auth.users(id)
```

#### `sub_parcels` - Subpercelen/Blokken (werkeenheid voor spuitregistraties)
```sql
id TEXT PRIMARY KEY
parcel_id TEXT → parcels(id) ON DELETE CASCADE
name TEXT                       -- Bloknaam (bijv. "V-haag")
crop TEXT NOT NULL              -- "Appel", "Peer"
variety TEXT NOT NULL           -- "Elstar", "Conference"
area FLOAT NOT NULL             -- Hectare (nauwkeurig voor dosering)
-- Gewogen structuren (JSONB arrays):
mutants JSONB                   -- [{value, percentage}]
rootstocks JSONB
interstocks JSONB
planting_years JSONB
planting_distances JSONB        -- [{value: {row, tree}, percentage}]
irrigation_type TEXT
irrigation_percentage INT
frost_protection_type TEXT
frost_protection_percentage INT
user_id UUID → auth.users(id)
```

#### `logbook` - Conceptregistraties (draft stage)
```sql
id TEXT PRIMARY KEY
raw_input TEXT                  -- Originele tekstinvoer
status TEXT                     -- 'Nieuw', 'Analyseren...', 'Te Controleren', 'Waarschuwing', 'Akkoord', 'Fout', 'Afgekeurd'
date TIMESTAMPTZ
parsed_data JSONB               -- {plots: [], products: [{product, dosage, unit}]}
validation_message TEXT
original_logbook_id TEXT
user_id UUID → auth.users(id)
```

#### `spuitschrift` - Bevestigde spuitregistraties
```sql
id TEXT PRIMARY KEY
spuitschrift_id TEXT
original_logbook_id TEXT
original_raw_input TEXT
date TIMESTAMPTZ
plots TEXT[]
products JSONB                  -- [{product, dosage, unit}]
validation_message TEXT
status TEXT
user_id UUID → auth.users(id)
```

#### `parcel_history` - Historische spuitdata per perceel
```sql
id TEXT PRIMARY KEY
log_id TEXT
spuitschrift_id TEXT
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

### CTGB Product Database

#### `ctgb_products` - Gewasbeschermingsmiddelen database
```sql
toelatingsnummer TEXT PRIMARY KEY
id TEXT NOT NULL
naam TEXT NOT NULL
status TEXT DEFAULT 'Valid'
vervaldatum TEXT
categorie TEXT                  -- Fungicide, Insecticide, etc.
toelatingshouder TEXT
werkzame_stoffen TEXT[]         -- Array van actieve stoffen
samenstelling JSONB
gebruiksvoorschriften JSONB     -- [{gewas, doelorganisme, dosering, maxToepassingen, veiligheidstermijn, interval}]
etikettering JSONB              -- GHS symbolen, H-zinnen
search_keywords TEXT[]
```

#### `active_substances` - Werkzame stoffen
```sql
code TEXT PRIMARY KEY
name TEXT NOT NULL
name_en TEXT
cas_number TEXT
max_kg_per_year DECIMAL(10,4)
max_applications_per_year INTEGER
max_kg_per_application DECIMAL(10,4)
category TEXT
mode_of_action TEXT
resistance_group TEXT
status TEXT DEFAULT 'active'
restriction_notes TEXT
```

#### `product_aliases` - Productnaam aliassen (voor AI parsing)
```sql
id UUID PRIMARY KEY
alias TEXT NOT NULL UNIQUE      -- Gebruikersnaam (bijv. "merpan")
official_name TEXT NOT NULL     -- Officiële naam
product_id TEXT
usage_count INTEGER DEFAULT 0
confidence DECIMAL(3,2) DEFAULT 1.0
```

### Team & Taken

#### `task_types` - Taaktypen met uurtarieven
```sql
id UUID PRIMARY KEY
name TEXT NOT NULL UNIQUE       -- 'Snoeien', 'Dunnen', 'Plukken', 'Sorteren', 'Onderhoud'
default_hourly_rate DECIMAL(10,2) DEFAULT 25.00
user_id UUID → auth.users(id)
```

#### `task_logs` - Urenregistraties
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
```

#### `active_task_sessions` - Actieve timers
```sql
id UUID PRIMARY KEY
task_type_id UUID NOT NULL → task_types(id)
sub_parcel_id TEXT → sub_parcels(id)
start_time TIMESTAMPTZ NOT NULL
people_count INTEGER NOT NULL
notes TEXT
```

### Research & Knowledge

#### `pests_diseases` - Ziekten & plagen encyclopedie
```sql
id UUID PRIMARY KEY
name TEXT NOT NULL              -- 'Schurft', 'Fruitmot'
latin_name TEXT                 -- 'Venturia inaequalis'
type pest_type                  -- 'fungus', 'insect', 'bacteria', 'virus', 'mite', 'other'
crop crop_type                  -- 'apple', 'pear', 'both'
impact_level impact_level       -- 'low', 'medium', 'high', 'critical'
subtitle TEXT
hero_image_url TEXT
gallery_images JSONB
overwintering TEXT
infection_conditions TEXT
damage_threshold TEXT
lifecycle_timeline JSONB        -- 12-maanden activiteitstijdlijn
symptoms JSONB                  -- [{stage, description}]
biological_control TEXT
cultural_control TEXT
chemical_control TEXT
tags TEXT[]
search_keywords TEXT[]
related_products TEXT[]         -- CTGB product IDs
external_links JSONB
```

#### `field_signals` - Veldobservaties (social feed)
```sql
id UUID PRIMARY KEY
author_id UUID → auth.users(id)
content TEXT NOT NULL
media_url TEXT
visibility TEXT                 -- 'public', 'private'
tags TEXT[] NOT NULL            -- ['Appel', 'Peer', 'Schurft', 'Kanker', 'Bemesting', 'Nieuws', 'Waarschuwing']
embedding vector(768)
likes_count INT DEFAULT 0
```

#### `research_papers` - Onderzoeksdocumenten
```sql
id UUID PRIMARY KEY
title TEXT NOT NULL
summary_ai TEXT
content_url TEXT                -- PDF in storage bucket
category research_category      -- 'disease', 'storage', 'cultivation', 'general'
verdict research_verdict        -- 'practical', 'experimental', 'theoretical'
tags TEXT[]
embedding VECTOR(768)
```

### Views

- `v_sprayable_parcels` - Flat view van sub_parcels met leesbare namen
- `v_active_parcels` - Percelen met eerste subperceel info
- `v_task_logs_enriched` - Task logs met type en perceel namen
- `v_substances_summary` - Actieve stoffen met productaantallen

---

## Globale Conventies

### Emerald Dark Mode Theming
- **Primaire kleur**: Emerald (#10b981) voor accenten en CTAs
- **Dark mode**: Standaard enabled via `class="dark"`
- **Achtergrond**: `hsl(var(--background))` - donkergrijs
- **Cards**: Semi-transparante achtergrond met subtiele borders
- **Glow effects**: Emerald glow op hover states

### Mobile-First Design
- Responsive breakpoints: sm (640px), md (768px), lg (1024px), xl (1280px)
- Grid layouts: 1 kolom mobiel → 2-4 kolommen desktop
- Touch-friendly: Minimaal 44px tap targets
- Bottom sheets voor mobiele modals

### Chat-Style Layout
- Smart Input gebruikt chat-bubble interface
- User messages: links uitgelijnd, blauw
- Bot responses: rechts uitgelijnd, groen/emerald
- Streaming responses met typing indicators

### Component Patterns
- shadcn/ui componenten in `/src/components/ui/`
- Domain-specifieke componenten in `/src/components/domain/`
- Layout componenten in `/src/components/layout/`
- Server Components standaard, `'use client'` waar nodig

### Naamconventies
- Bestanden: kebab-case (`smart-invoer-feed.tsx`)
- Componenten: PascalCase (`SmartInvoerFeed`)
- Database: snake_case (`sub_parcels`)
- TypeScript types: PascalCase (`SprayableParcel`)

---

## Auth Flow

### Supabase Auth Implementatie
1. **Login**: Email + password via `supabase.auth.signInWithPassword()`
2. **Register**: Email + password met validatie via `supabase.auth.signUp()`
3. **Session**: Opgeslagen in cookies, auto-refresh
4. **Middleware**: Protected routes onder `(app)` route group

### Protected Routes
```
/app, /command-center, /parcels, /crop-care, /research,
/perceelhistorie, /bedrijf-dashboard, /team-tasks, /profile
```

### Auth Actions (`/src/lib/auth-actions.ts`)
- `login()` - Supabase password sign-in
- `register()` - Sign-up met email validatie
- `logout()` - Sign out en redirect naar login

### Row Level Security (RLS)
- Alle user-owned tabellen hebben RLS enabled
- `auth.uid()` check voor CRUD operaties
- Service role key voor admin operaties

---

## Subscription Tiers

> **Huidige status**: Geen subscription systeem geïmplementeerd. Alle geauthenticeerde gebruikers hebben gelijke toegang.

Indien gewenst in de toekomst:
- `profiles` tabel uitbreiden met `tier` kolom
- Feature gates implementeren in middleware
- Payment provider integratie (Stripe)

---

## Mapstructuur Overzicht

```
src/
├── ai/                          # AI/Genkit flows en prompts
│   ├── flows/                   # AI agent flows
│   │   ├── classify-and-parse-spray.ts  # Combined intent + parsing
│   │   ├── intent-router.ts     # Intent classificatie
│   │   └── parse-spray-application.ts   # Spray parsing V1/V2
│   ├── prompts/                 # Systeem prompts
│   ├── schemas/                 # Zod schemas voor intents
│   └── genkit.ts               # Genkit configuratie
│
├── app/                         # Next.js App Router
│   ├── (app)/                   # Protected routes group
│   │   ├── command-center/      # Command center + smart input
│   │   ├── crop-care/           # Logs, producten, voorraad
│   │   ├── parcels/             # Perceel beheer (list/map)
│   │   ├── research/            # Knowledge hub + pests
│   │   ├── team-tasks/          # Urenregistratie
│   │   └── profile/             # Gebruikersprofiel
│   ├── api/                     # API routes
│   │   ├── analyze-input/       # AI parsing endpoint
│   │   ├── validate/            # CTGB validatie
│   │   ├── ctgb/search/         # Product zoeken
│   │   └── chat/                # Streaming chat
│   └── login/                   # Auth pages
│
├── components/
│   ├── ui/                      # shadcn/ui primitives (40+)
│   ├── layout/                  # Sidebar, navigation
│   └── domain/                  # Feature-specifieke componenten
│
├── hooks/                       # Custom React hooks
│   └── use-data.ts             # Data fetching hooks
│
├── lib/                         # Utility libraries
│   ├── supabase/               # Supabase client & middleware
│   ├── validation/             # CTGB validatie engine
│   ├── supabase-store.ts       # Database operaties (59.6KB)
│   ├── ctgb-validator.ts       # CTGB validatie logica
│   ├── correction-service.ts   # Correctie detectie
│   ├── feedback-service.ts     # User learning loop
│   └── types.ts                # TypeScript definities
│
└── middleware.ts               # Auth middleware
```

---

## Key Design Decisions

### 1. Two-Tier Parcel System
Percelen (main) → Sub-parcelen (blokken). Sub-parcelen zijn de werkeenheid voor spuitregistraties omdat ze specifieke gewas/ras combinaties vertegenwoordigen.

### 2. Combined Intent + Parsing (Punt 7)
Eén AI call die zowel intent classificatie als spray parsing doet, bespaart 50% API calls en latency.

### 3. Flattened Schema Output
Gemini heeft een 5-level nesting limiet. Oplossing: comma-separated strings in output die post-processing naar nested structuur converteren.

### 4. Deterministic CTGB Validation
Geen AI voor regelvalidatie - pure TypeScript logica met 6 prioriteitschecks: crop authorization, dosage, interval, seasonal maxima, substance cumulation, safety period.

### 5. Feedback Loop Learning
User correcties worden opgeslagen in `smart_input_feedback` tabel om toekomstige parsing te verbeteren (product aliassen, dosering voorkeuren, perceel groepen).

### 6. Work Day Weighting
Task logging: Ma-Vr = 1 dag, Za = 0.5 dag, Zo = 0 dagen. Automatische berekening van werkdagen in datumbereik.

---

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_DB_URL=postgresql://...

# Google AI (Gemini)
GOOGLE_API_KEY=AIza...

# Firebase (legacy, optioneel)
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_API_KEY=...
```

---

## Development Commands

```bash
npm run dev        # Start dev server (Turbopack)
npm run build      # Production build
npm run lint       # ESLint
npm run typecheck  # TypeScript check
npm test           # Playwright tests
```

---

## Related CLAUDE.md Files

- `/src/app/(app)/command-center/CLAUDE.md` - Smart Input feature
- `/src/app/(app)/parcels/CLAUDE.md` - Perceel beheer
- `/src/app/(app)/crop-care/CLAUDE.md` - Gewasbescherming & logs
- `/src/app/(app)/research/CLAUDE.md` - Research Hub & pests
- `/src/app/(app)/team-tasks/CLAUDE.md` - Urenregistratie
