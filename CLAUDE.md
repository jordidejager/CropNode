# CropNode

Intelligent crop protection management app for Dutch fruit farming (apples & pears).

## ⚠️ Git Remotes — Read Before Pushing

This submodule has TWO remotes. **Only `cropnode` is deployed.**

- `cropnode` → `github.com/jordidejager/CropNode.git` — **the live repo, deployed by Vercel**
- `origin` → `github.com/jordidejager/AgrisprayerPro.git` — legacy/parallel mirror, NOT deployed

```bash
# Always push to cropnode for the live app
git push cropnode main
```

Pushing only to `origin` silently leaves Vercel out of date. If you must push to both, push `cropnode` last so the deploy reflects your latest commit. The parent repo (`/Users/jordidejager/studio`) tracks the submodule pointer — push that to its own `origin` as usual after updating the submodule.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router + Turbopack) |
| Language | TypeScript 5, React 19 |
| AI | Genkit + Google Gemini 2.5 Flash Lite (intent classification & parsing) |
| Embeddings | googleai/text-embedding-004 (768-dim vectors for RAG) |
| Database | Supabase (PostgreSQL + pgvector) |
| Auth | Supabase Auth (email/password, RLS on all user tables) |
| Data Fetching | TanStack React Query |
| UI | shadcn/ui + Radix UI, Tailwind CSS 3, Framer Motion |
| Maps | Leaflet + leaflet-draw |
| Charts | Recharts |
| Forms | react-hook-form + Zod |

## External APIs

| API | Purpose |
|-----|---------|
| Gemini API | AI parsing & embeddings (via Genkit) |
| PDOK Gewaspercelen | RVO parcel data (`api.pdok.nl/rvo/gewaspercelen/`) |
| PDOK Locatieserver | Address search (`api.pdok.nl/bzk/locatieserver/`) |
| Open-Meteo | Weather data — forecast + historical + multi-model (free, no key) |
| Meta Cloud API v21.0 | WhatsApp Business messaging (text, images, buttons, lists, location) |
| MapTiler Weather SDK | Precipitation forecast map layers for 8h/24h/48h/96h radar |
| QuickChart.io | Server-side Chart.js v4 → PNG for WhatsApp forecast charts |
| Buienradar | 2h radar animation GIF (gifuct-js client-side frame extraction) |

## Global Conventions

### Theming
- **Dark mode only** — enabled via `class="dark"` on root
- **Primary color**: Emerald (#10b981) for accents and CTAs
- Cards use semi-transparent backgrounds with subtle borders
- Emerald glow effects on hover states

### Naming
- Files: kebab-case (`smart-invoer-feed.tsx`)
- Components: PascalCase (`SmartInvoerFeed`)
- Database: snake_case (`sub_parcels`)
- TypeScript types: PascalCase (`SprayableParcel`)

### Component Organization
- `components/ui/` — shadcn/ui primitives
- `components/domain/` — feature-specific components
- `components/layout/` — sidebar, navigation
- Server Components by default, `'use client'` only when needed

### Mobile-First
- Breakpoints: sm (640), md (768), lg (1024), xl (1280)
- Min 44px tap targets
- Bottom sheets for mobile modals

## Key Design Decisions

- **Two-tier parcel system**: Parcels (physical boundaries) → Sub-parcels/blocks (work units for spray registrations with specific crop/variety combos)
- **Combined intent + parsing**: Single AI call does both intent classification and spray parsing (saves 50% API calls)
- **Deterministic CTGB validation**: No AI for regulation checks — pure TypeScript logic with 6 priority checks (crop auth, dosage, interval, seasonal max, substance cumulation, safety period)
- **Unified product database**: Single `products` table (2.910 records) as entry point for both CTGB gewasbeschermingsmiddelen and meststoffen. Detail tables `ctgb_products` and `fertilizers` linked via `source_id`. Unified `product_aliases_unified` replaces three separate alias systems. See `DATABASE.md` for full schema.
- **CTGB data enrichment**: Gebruiksvoorschriften contain BBCH growth stages, application timing (months), spray volume ranges, numeric PHI/interval, and max dosage per season — all from MST API re-sync.
- **Boomkwekerij filter**: GV entries with 8+ comma-separated crops are excluded from hardfruit view (prevents boomkwekerij listings from appearing as appel/peer dosages). Word-boundary regex prevents "aardappel" matching "appel".
- **Flattened Gemini output**: Gemini has 5-level nesting limit, so output uses comma-separated strings with post-processing
- **Feedback loop**: User corrections stored in `smart_input_feedback` to improve future parsing (product aliases, dosage preferences, parcel groups)
- **Work day weighting**: Mon-Fri = 1, Sat = 0.5, Sun = 0 (for task hour calculations)
- **Smart Input V2 hybrid**: First message uses fast pipeline (classify+parse in 1 call), follow-ups use AI Agent with tools. Client-side context caching reduces response from 6-12s to 1-3s.

## Auth Flow

- Login/register via Supabase Auth (email + password)
- Session stored in cookies with auto-refresh
- Middleware protects all routes under `(app)` route group
- RLS enforces `auth.uid()` on all user-owned tables
- Auth actions in `/src/lib/auth-actions.ts`

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_URL=

# Google AI (Gemini)
GOOGLE_API_KEY=

# Weather cron job auth
CRON_SECRET=

# FruitConsult scraper credentials (knowledge pipeline)
FRUITCONSULT_USER=
FRUITCONSULT_PASS=
```

## Database Migrations

Migrations live in `supabase/migrations/` as numbered SQL files (001-045+). Run via Supabase SQL Editor.

**Creating a new migration:**
1. Create `supabase/migrations/NNN_description.sql` (next number in sequence)
2. Write idempotent SQL (use `IF NOT EXISTS`, `OR REPLACE`, `ON CONFLICT` where possible)
3. Run in Supabase Dashboard > SQL Editor

## Product Database Scripts

```bash
# Sync unified products table from source tables
npx tsx scripts/sync-products.ts                    # All sources
npx tsx scripts/sync-products.ts --source=ctgb      # Only CTGB

# Full CTGB re-sync from MST API (2-phase, network-resilient)
npx tsx scripts/enrich-ctgb-batch.ts --phase=1      # Fetch API → local .ctgb-enrichment-cache.json
npx tsx scripts/enrich-ctgb-batch.ts --phase=2      # Write cache → Supabase

# Meststoffen beschrijvingen genereren
npx tsx scripts/enrich-fertilizers.ts

# Parse restricties (BBCH, drift, bufferzone) uit GV opmerkingen
npx tsx scripts/parse-gv-restrictions.ts

# Data quality rapport
npx tsx scripts/product-quality-report.ts

# WhatsApp bot readiness test (8 voorbeeldvragen)
npx tsx scripts/test-whatsapp-queries.ts
```

## Knowledge Base RAG Pipeline (`src/lib/knowledge/`)

CropNode's RAG-chatbot foundation. Scrapes external sources (currently FruitConsult), transforms content into our own CropNode-knowledge artikelen, embeds with Gemini text-embedding-004, and stores in `knowledge_articles` for semantic search.

**Architecture:**
```
Vercel cron (ma 06:00) → /api/knowledge/scrape (CRON_SECRET auth)
  → pipeline.ts → scrapers/fruitconsult.ts (ASP.NET login + cheerio)
  → transform.ts (Gemini herformulering, NL tone of voice, no source attribution)
  → validate.ts (Gemini quality check → blockers ⇒ status='needs_review')
  → embed.ts (text-embedding-004, 768-dim)
  → fuse.ts (find_fusion_candidate RPC, similarity > 0.90 ⇒ Gemini fusion)
  → INSERT/UPDATE knowledge_articles + knowledge_scrape_log
```

**Key files:**
- `sql/create_knowledge_articles.sql` — schema + RPCs (`match_knowledge_articles`, `find_fusion_candidate`)
- `src/lib/knowledge/types.ts` — Zod schemas + categorie/type/phase enums
- `src/lib/knowledge/scrapers/index.ts` — extensible scraper registry (later: dlv, wur, ctgb)
- `src/lib/knowledge/pipeline.ts` — orchestrator (idempotent via content_hash + scrape_log)
- `src/lib/knowledge/search.ts` — semantic search foundation for the chatbot
- `scripts/migrate-fruitconsult-history.ts` — one-off backfill from Python scraper JSON
- `scripts/cleanup-deprecated-kb.ts` — removes old `kb_topics`/`kb_products` tables

**Important rules:**
- **Never** store source URLs, organisatienamen, of FruitConsult-vermeldingen in `knowledge_articles`
- Content moet hergeformuleerd zijn — productnamen + doseringen exact, rest in eigen woorden
- `knowledge_scrape_log.scrape_source` mag wel `"fc"` bevatten (alleen operationeel)
- Alleen publieke bronnen (WUR/CTGB/RVO) krijgen `is_public_source=true` met bronvermelding

**Run commands:**
```bash
npm run knowledge:backfill                              # Full backfill (~2-3u)
npm run knowledge:backfill -- --limit 10                # Test met 10 artikelen
npm run knowledge:backfill -- --dry-run                 # Parse only

# Manual trigger (lokaal of via curl)
curl -X POST http://localhost:3000/api/knowledge/scrape \
  -H "Authorization: Bearer $CRON_SECRET"

# Search test
curl 'http://localhost:3000/api/knowledge/search?query=schurft+april&crops=appel'

# Cleanup deprecated tables (alleen na backfill geverifieerd)
CONFIRM_DELETE=yes npm run knowledge:cleanup
```

## WhatsApp Bot (`src/lib/whatsapp/`)

AI-powered WhatsApp assistant for fruit growers. Users link their phone number in Instellingen, then interact via WhatsApp for spray registrations, field notes, product queries, and weather forecasts.

### Architecture
```
Meta Webhook → /api/whatsapp/webhook/route.ts (HMAC verification)
  → message-handler.ts (state machine dispatcher)
  → routes to one of:
     ├─ weather-query-handler.ts   — "weersverwachting" / "14 daagse" / "wat wordt het weer"
     ├─ field-note-processor.ts    — "notitie:", "gezien", photo messages, GPS
     ├─ product-query-handler.ts   — "wat is delan", "dosering X op Y"
     └─ registration-processor.ts  — default: Gemini spray/fertilizer parsing
```

### Intent detection (deterministic, no AI)
- **Weather**: keywords `weersverwachting`, `14 daagse`, `wat wordt het weer`, `komende week weer`
- **Field note**: prefixes `notitie:`, `noteer:`, `memo:` or observation keywords `gezien`, `opgemerkt`
- **Product query**: patterns `wat is X`, `dosering X op Y`, `middelen tegen Z`
- **Spray registration**: everything else → Gemini pipeline

### Weather forecast flow
```
User: "weersverwachting"
  → resolveStationForUser() — parcel_weather_stations → first parcel with location
  → getBestMatchHourlyData() — best_match hourly from weather_data_hourly (admin client, bypasses RLS)
  → aggregatePerDay() — sum precip, min/max temp, circular-mean wind direction, beaufort
  → parallel:
     ├─ QuickChart POST /chart/create → short URL → sharp composite with CropNode logo → Supabase Storage
     └─ Gemini summarizeWeatherForecast() — 4-6 sentence Dutch summary (deterministic fallback if timeout)
  → sendImageMessage(chartUrl) + sendTextMessage(summary)
```

### State machine (conversation states)
`idle` → `awaiting_product_selection` → `awaiting_confirmation` → `awaiting_send_choice` / `awaiting_edit_choice` → `awaiting_edit_input`

State stored in `whatsapp_conversations` table (JSONB `pending_registration`), auto-expires after 30 minutes.

### Key gotchas
- **RLS**: Webhook has no cookie auth. All DB queries MUST use `getSupabaseAdmin()` (service-role client). The default `createClient()` returns zero rows for all user-owned tables.
- **Rate limiting**: 10 msg/min per phone (in-memory Map). Meta retries — dedup via `wa_message_id`.
- **24h window**: Free-form replies only within 24h of user's last message. After that, only template messages (costs money).
- **Image limits**: JPG/PNG max 5MB via HTTPS URL. Chart PNGs are ~80-120KB.

### Key files
```
src/lib/whatsapp/
  message-handler.ts          — State machine dispatcher (main entry point)
  weather-query-handler.ts    — 14-day forecast: chart + Gemini summary
  registration-processor.ts   — Gemini spray/fertilizer parsing
  field-note-processor.ts     — Field notes with photo/GPS support
  product-query-handler.ts    — CTGB product info queries
  confirmation-handler.ts     — Save spray registration to spuitschrift
  edit-handler.ts             — Edit pending registration fields
  product-selection-handler.ts — CTGB disambiguation (button replies)
  client.ts                   — Meta Cloud API (sendText, sendImage, sendButtons, sendList, uploadMedia)
  store.ts                    — Supabase lookups (phone→user, conversations, parcels)
  media.ts                    — Photo download from Meta → Supabase Storage upload
  format.ts                   — Message formatting helpers
  phone-utils.ts              — E.164 normalization (addPlus/stripPlus)
  types.ts                    — TypeScript interfaces

src/ai/flows/
  summarize-weather-forecast.ts — Genkit flow: aggregated metrics → Dutch summary

src/lib/weather/
  forecast-chart-url.ts       — QuickChart config builder + sharp logo composite
```

### Environment variables (WhatsApp-specific)
```env
WHATSAPP_PHONE_NUMBER_ID=     # Meta Business phone number ID
WHATSAPP_ACCESS_TOKEN=        # Meta Cloud API access token
WHATSAPP_VERIFY_TOKEN=        # Webhook verification token
WHATSAPP_APP_SECRET=          # HMAC signature verification
```

## Weather Hub (`/weer`)

Weather dashboard with multi-model forecasts, radar, and spray window detection.

### Data pipeline
```
Vercel cron (daily 06:00) → /api/weather/cron (CRON_SECRET)
  → refreshAllStations() → for each station:
     ├─ Open-Meteo forecast (best_match) → weather_data_hourly + weather_data_daily
     ├─ Open-Meteo multi-model (ECMWF, GFS, ICON-EU, MeteoFrance) → weather_data_hourly
     └─ Open-Meteo ensemble (51 members) → weather_ensemble_hourly
```

### Supabase row limits
PostgREST has a server-side max of 1000 rows per request (cannot be overridden by `.limit()`). Multi-model data for 14 days = ~1500-2000 rows. Solution: **pagination with `.range()`** — two parallel requests `range(0, 999)` + `range(1000, 2499)`.

### Rain forecast (RainForecast.tsx)
- **2h**: Buienradar animated GIF (gifuct-js frame extraction, `RadarPlayer.tsx`)
- **8h/24h/48h/96h**: MapTiler Weather SDK precipitation layer (`PrecipForecastMap.tsx`, lazy-loaded)
- Styled to match Buienradar: BACKDROP.DARK, no labels/symbols, interactive=false

### Key files
```
src/lib/weather/
  weather-service.ts          — All weather queries (forecast, multimodel, ensemble, hourly, daily)
  weather-constants.ts        — FORECAST_DAYS=16, model names, thresholds
  open-meteo-client.ts        — Open-Meteo API client (forecast, multi-model, ensemble, historical)
  ensure-weather-station.ts   — Auto-link parcels to weather stations
  forecast-chart-url.ts       — WhatsApp chart generation (QuickChart + sharp)

src/components/weather/
  RadarPlayer.tsx             — Buienradar 2h radar animation
  PrecipForecastMap.tsx       — MapTiler 8h-96h precipitation map
  RainForecast.tsx            — Tab container (2h/8h/24h/48h/96h)
  MultiModelPreview.tsx       — Compact 2x2 dashboard widget (14-day)
  expert/
    MultiModelChart.tsx       — Full-size multi-model comparison
    CombinedMultiModelChart.tsx — 2x2 grid (temp, precip, wind, humidity)
```

### Environment variables (Weather-specific)
```env
NEXT_PUBLIC_MAPTILER_API_KEY=  # MapTiler SDK (precipitation maps)
```

## Analytics Module (`/analytics`)

Bedrijfsanalyse dashboard met meerdere subpagina's via tab-navigatie. Alle data wordt gefilterd op `harvest_year` (oogstjaar) — het kernconcept dat kosten en opbrengsten groepeert over kalenderjaren heen.

### Oogstjaar-logica (`lib/analytics/harvest-year-utils.ts`)
- Jan-Okt registraties → `harvest_year = huidig jaar`
- Nov-Dec registraties → `harvest_year = volgend jaar` (voorbereiding volgende oogst)
- Database kolom `harvest_year INTEGER` op `spuitschrift`, `parcel_history`, `harvest_registrations`

### Subpagina's

**Seizoensdashboard** (`/analytics`) — Hoofdoverzicht per oogstjaar
- KPI's: inputkosten, kosten/ha, behandelingen, oogst (ton), kosten/ton
- Donut: kostenverdeling (gewasbescherming/bladmeststof/strooimeststof)
- Stacked bar: maandelijkse kosten
- Middelenanalyse: top 10 middelen, kosten per bespuiting, perceelkosten-tabel
- Oogst & opbrengst: kg/ha per perceel, per ras, kosten-batenratio, best/slechtst rendabel
- Perceelsvergelijking: radar chart met genormaliseerde waarden
- Weerimpact: neerslag vs behandelingen, temperatuursom (GDD)
- Export: CSV download (werkend), PDF/certificering/coöperatie (placeholder)

**Productie** (`/analytics/productie`) — Productiegeschiedenis & trends
- Data: `production_summaries` tabel (handmatig ingevoerd, per subperceel per oogstjaar) + `harvest_registrations` (dagelijkse oogstdata)
- Jaar-trendgrafiek, ras-verdeling, perceelvergelijking, ras-ranking
- Invoerformulier: per subperceel, gegroepeerd per hoofdperceel, auto-fill ras/hectares/kg-per-kist (peer=400, appel=350)

**Bemesting** (`/analytics/bemesting`) — Bodemkwaliteit uit grondmonsters
- Data: `soil_analyses` tabel (Eurofins PDF's, AI-geëxtraheerd via Gemini)
- Per hoofdperceel: org. stof, N-leverend, P-beschikbaar, P-Al, klei%, C/N-ratio
- Waardering-badges (Laag/Vrij laag/Goed/Vrij hoog/Hoog) met kleurcodering
- Overerving: grondmonster op hoofdperceel → geldt voor alle subpercelen
- Alle percelen altijd zichtbaar (ook zonder grondmonster)

**Ziektedruk** (`/analytics/ziektedruk`) — Schurft/ziektedruk monitoring
- Ascosporenrijping, infectieperiodes, graaddagen

**Inzichten** (`/analytics/inzichten`) — AI correlatie-engine
- API: `POST /api/analytics/inzichten/generate` — aggregeert alle bedrijfsdata → Gemini
- Gemini zoekt top 8-12 correlaties: productie × ras/onderstam/plantdichtheid/leeftijd, bodem × productie, weer × productie, infrastructuur × productie, uitschieters
- Gecacht in `insight_results` tabel (24h, data_hash invalidatie)
- Rate limiting: 1 call per 5 min per user
- Mini-charts per inzichtkaart (bar, lijn, scatter, waarde-highlight)

### Oogst & Opslag — Geschiedenis (`/oogst/geschiedenis`)
- Spreadsheet-grid: subpercelen als rijen, oogstjaren (2017-heden) als kolommen
- Gegroepeerd per hoofdperceel (op naam, niet ID — meerdere kadastrale percelen met dezelfde naam worden samengevoegd)
- Klik op lege cel → formulier opent met perceel/ras/hectares/jaar pre-filled
- Mini-sparklines per perceel (productietrend)
- Hergebruikt `HistoricalDataForm` component uit analytics/productie

### Key files
```
src/lib/analytics/
  harvest-year-utils.ts     — suggestHarvestYear(), getCurrentHarvestYear()
  types.ts                  — AnalyticsData, KPIData, filters, etc.
  queries.ts                — Supabase queries (spuitschrift, harvests, parcels, weather)
  calculations.ts           — KPI's, kostenverdeling, parcel costs, CSV export
  production-queries.ts     — production_summaries CRUD
  production-calculations.ts — yearly trends, variety ranking
  bemesting-queries.ts      — soil analyses aggregatie, hoofdperceel grouping

src/components/analytics/
  AnalyticsHero.tsx          — Premium header met CropNode logo + hero KPI's
  AnalyticsFilterBar.tsx     — Sticky filter: oogstjaar, percelen, datumbereik
  SeasonDashboard.tsx        — KPI cards + donut + bar charts
  CropProtectionAnalysis.tsx — Middelen, perceelkosten, behandelingstijdlijn
  FertilizerAnalysis.tsx     — Bemestingskosten, kg/ha per perceel
  HarvestYieldAnalysis.tsx   — Opbrengst, kwaliteit, kosten-baten
  ParcelComparison.tsx       — Radar chart vergelijking
  WeatherImpact.tsx          — Neerslag vs behandelingen, GDD
  ReportsExport.tsx          — CSV + placeholder exports
  shared/                    — KPICard, ChartCard, EmptyState, CountUpNumber
  bemesting/                 — SoilComparisonChart, NutrientRadarChart
  productie/                 — HistoricalDataForm, YearTrendChart, etc.
  inzichten/                 — InsightMiniChart

src/app/(app)/analytics/
  page.tsx                   — Seizoensdashboard
  layout.tsx                 — Tab navigatie (5 tabs)
  productie/page.tsx         — Productiegeschiedenis
  bemesting/page.tsx         — Bodemkwaliteit
  ziektedruk/page.tsx        — Ziektedruk monitoring
  inzichten/page.tsx         — AI inzichten

src/app/(app)/oogst/
  geschiedenis/page.tsx      — Productie-invoer grid
```

### Database tabellen (analytics-specifiek)
- `production_summaries` — Handmatige jaarlijkse productiecijfers per subperceel
- `insight_results` — Gecachte Gemini analyse-resultaten
- Kolom `harvest_year` op `spuitschrift`, `parcel_history`, `harvest_registrations`
- Kolom `unit_price` op `parcel_history` (voor kostenanalyse)

## Ziektedruk (Disease Pressure) — Analytics subpage

Infection risk modeling for apple scab (*Venturia inaequalis*) at `/analytics/ziektedruk`. Based on published peer-reviewed science (A-scab model, revised Mills table).

### Architecture

Three coupled submodels that simulate the primary infection season:

1. **Ascospore Maturation (PAM)** — Logistic curve on cumulative degree-days (base 0°C) since biofix. `PAM = 1 / (1 + exp(7.486 - 0.0152 × DD))`. Predicts what fraction of seasonal spores are mature.

2. **Infection Risk (Mills table)** — Per wet period: lookup severity based on avg temp × wet duration hours. Severity = Mills result directly (not derived from RIM). RIM = magnitude metric scaling by PAM.

3. **Incubation Period** — `≈ 230 / T_avg` days post-infection for symptom appearance.

### Key files

```
lib/disease-models/
├── types.ts                          — All TypeScript types
├── disease-service.ts                — Orchestration: weather fetch, calculate, cache
└── apple-scab/
    ├── mills-table.ts                — Static Mills table + lookup with interpolation
    ├── ascospore-maturation.ts       — Degree-days + PAM calculation
    ├── wet-period-detection.ts       — Wet period detection from hourly weather
    ├── infection-calculator.ts       — Combines all submodels → InfectionPeriod[]
    └── incubation.ts                 — Symptom date estimation

components/analytics/ziektedruk/
├── BiofixConfig.tsx                  — Parcel selector, biofix datepicker, inoculum toggle
├── SeasonProgress.tsx                — PAM bar + KPI cards
├── InfectionTimeline.tsx             — Recharts ComposedChart (PAM curve + infection bars)
├── InfectionTable.tsx                — Sortable infection events table
├── SeasonSummary.tsx                 — Summary KPI cards
└── ZiektedrukDisclaimer.tsx          — Dismissible disclaimer banner

app/api/analytics/ziektedruk/
├── route.ts                          — GET results (?force=1 to skip cache)
├── config/route.ts                   — POST biofix config (triggers recalculation)
└── recalculate/route.ts              — POST force recalculate
```

### Database tables

- `disease_model_config` — Per parcel/harvest_year: biofix_date, inoculum_pressure
- `disease_season_progress` — Daily PAM/DD snapshots (cache)
- `disease_infection_periods` — Calculated infection events (cache)

Migration: `supabase/migrations/043_disease_pressure.sql`

### Data flow

1. Weather data from existing `weather_data_hourly` table via `getHourlyRange()` (chunked, 31 days per fetch)
2. Server-side calculation in `disease-service.ts` → cached in DB (3-hour staleness)
3. Client fetches cached results via GET, renders Recharts timeline + table
4. Config POST triggers immediate recalculation

### Design decisions

- **Severity = Mills severity** (direct from table, not derived from RIM). Mills determines IF infection occurs. RIM scales magnitude by PAM.
- **Wet period start**: precipitation > 0mm OR RH ≥ 90%. Must contain at least 1 rain hour (spore discharge requires rain).
- **No Framer Motion** — Tailwind animations only, despite legacy mention in tech stack.
- **Extensible**: `disease_type` field supports future models (pear scab, fire blight, etc.)

## Perceelprofiel & Grondmonsteranalyse

### Perceelprofiel (`parcel_profiles` tabel)
Uitgebreid formulier per (sub)perceel met 10 secties:

1. **Aanplantgegevens** — plantjaar, gewas, ras (dropdown per gewas), onderstam(men) met % verdeling, bestuiversras + afstand, kloon/selectie
2. **Plantverband** — rijafstand, plantafstand, plantdichtheid (auto -10% koppakkers), aantal bomen
3. **Teeltsysteem** — slanke spil/V-haag/etc., boomhoogte, rijrichting
4. **Infrastructuur** — hagelnet, windscherm, steunconstructie
5. **Waterhuishouding** — irrigatie, fertigatie, beregening (nachtvorst+koel gecombineerd), waterbron
6. **Bodemkenmerken** — grondsoort, pH, org. stof, C-organisch, klei%, Pw-getal. **Auto-fill vanuit laatste grondmonster**
7. **Perceelhistorie** — voorgaand gewas (specifiek appel/peer), herinplant, verwachte rooidatum
8. **Ziekten & Plagen** — drukniveau per ziekte. Algemeen: schurft, vruchtboomkanker, bacterievuur, meeldauw, fruitmot. Appel-specifiek: appelbloesemkever, roze appelluis. Peer-specifiek: zwartvruchtrot, perenbladvlo
9. **Natuurlijke vijanden** — aanwezigheid van oorwormen, lieveheersbeestjes, gaasvliegen, roofmijten, sluipwespen, roofwantsen, zweefvliegen, spinnen
10. **Notities** — vrij tekstveld

**Flexibele koppeling:** `parcel_id` OF `sub_parcel_id` (CHECK constraint). Werkt voor zowel hoofdpercelen als subpercelen.

### Grondmonsteranalyse (`soil_analyses` tabel)
- **Upload** Eurofins Agro PDF → AI-extractie via Gemini (multimodal)
- Geëxtraheerde data: N-totaal, C/N-ratio, N-leverend vermogen, P-plantbeschikbaar, P-bodemvoorraad, P-Al, Pw-getal, org. stof, klei%, bulkdichtheid
- **Waarderingen** met kleur-badges (laag/vrij laag/goed/vrij hoog/hoog)
- **Bemestingsadviezen** (bodemgericht + gewasgericht)
- **RVO doorgave** waarden (P-Al, P-CaCl2, Pw-getal) met banner vóór 15 mei
- **Cascadering**: grondmonster op hoofdperceel valt automatisch door naar subpercelen
- Storage bucket: `soil-analysis-pdfs`

### Perceelbewerking
- **Inline edit** op perceelpagina: gewas, ras (dropdown met suggesties), oppervlakte
- **Cascading update**: wijziging werkt door naar `parcel_history`, `cell_sub_parcels`, en `v_sprayable_parcels`

### API Routes
- `GET/PUT /api/parcels/[id]/profile?type=parcel|sub_parcel`
- `GET /api/parcels/[id]/soil-analyses?type=...` — incl. inherited van hoofdperceel
- `POST .../upload`, `PUT/DELETE .../[analysisId]`, `POST .../apply-to-profile`

**RLS pattern:** Auth via cookie client, writes via `createServiceRoleClient()`.

## BRP Gewasrotatiehistorie

Gewashistorie (2009-2025) voor elk perceel in Nederland via PDOK.

- **Realtime**: PDOK OGC/WFS API voor huidig jaar
- **Historisch**: `brp_gewas_nationaal` tabel met centroids (GeoPackage imports)
- **Componenten**: `GewasrotatieTimeline`, `RvoParcelSheet` gewasrotatie
- **Import**: `python3 scripts/import-brp-nationaal.py` (vereist GDAL)

## Percelenlijst — Gegroepeerde Weergave

Collapsible accordion per hoofdperceel:
- Groep header: naam, gewas-badges, blokken, oppervlakte
- Tree-connector UI voor subpercelen
- Eye-knop → hoofdperceel overview met grondmonster upload
- Checkbox selectie op groep- en individueel niveau

## Development Commands

```bash
npm run dev              # Dev server (Turbopack)
npm run build            # Production build
npm run lint             # ESLint
npm run typecheck        # TypeScript check
npm run test:e2e         # Playwright E2E tests
npm run test:e2e:ui      # Playwright interactive UI
npm run test:e2e:headed  # Playwright with visible browser
npm run test:weather     # Weather Hub unit tests (32 tests)

# Smart Input V2 regression tests
npx tsx scripts/run-regression-tests.ts              # All 53 tests
npx tsx scripts/run-regression-tests.ts --verbose    # With details
npx tsx scripts/run-regression-tests.ts --category=simpel  # By category
```
