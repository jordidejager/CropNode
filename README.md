# Studio — AgriSprayer Pro

**AgriSprayer Pro** is het vlaggenschip-product binnen het **Studio** ecosysteem. Het is een state-of-the-art webapplicatie ontworpen om agrarische bedrijven te ontlasten bij de administratie van gewasbescherming.

Door de kracht van **Generatieve AI (Google Gemini)** te combineren met een **deterministische CTGB-validatie-engine**, biedt de app een unieke ervaring: praat tegen je spuitschrift, en de app regelt de rest. Alles verpakt in een hoogwaardige, **Emerald Dark Mode** interface.

---

## Belangrijkste Functionaliteiten

### Multi-Modal Command Center
De kern van de applicatie. Eén intelligente command-bar met vier gespecialiseerde modi:

| Mode | Icoon | Functie |
|------|-------|---------|
| **Registratie** | Tractor | Spuitregistraties invoeren via natuurlijke taal |
| **Product Check** | Flask | Direct CTGB product informatie opzoeken |
| **Urenregistratie** | Timer | Start/stop timers voor teamtaken |
| **Research Hub** | Microscope | AI-gestuurde kennisbank voor gewasbescherming |

#### Registratie Mode (AI-First)
- **Natuurlijke Taal:** Type zoals je praat: *"Vandaag alle peren gespoten met Merpan en Score"*
- **Streaming AI:** Zie de AI live mee-denken terwijl de invoer wordt geanalyseerd
- **Multi-turn Context:** Correcties zoals *"Oja, en ook nog 0.5L Zwavel"* worden direct toegevoegd
- **Groepselectie:** *"Alle peren"*, *"De Conference"* worden automatisch gematched

#### Product Check Mode
- **Directe Zoekfunctie:** Zoek op productnaam, toelatingsnummer of werkzame stof
- **Gebruiksvoorschriften:** Bekijk per gewas de toegestane dosering, toepassingen en veiligheidstermijnen
- **W-codes & Etikettering:** Inzicht in veiligheidsvoorschriften

#### Urenregistratie Mode
- **Timer Functie:** *"Start snoeien"* → start een timer voor de taak
- **Stop & Registreer:** *"Stop"* → stopt de timer en registreert de uren automatisch
- **Team Integratie:** Gekoppeld aan Team Tasks pagina

#### Research Hub Mode
- **RAG-gestuurde AI:** Stel vragen over ziektes, plagen en bestrijding
- **Tool-gebruik:** De AI doorzoekt automatisch relevante bronnen

### CTGB Validatie-Engine
Veiligheid en wetgeving staan centraal. Elke registratie wordt automatisch getoetst aan de officiële CTGB-database.
- **Toelatingscheck:** Mag dit product op dit gewas?
- **Doseringcontrole:** Is de ingevoerde dosis binnen de wettelijke limieten?
- **Interval & Cumulatie:** Houdt rekening met eerdere bespuitingen en minimale intervallen
- **Status Systeem:** `Akkoord`, `Waarschuwing` of `Afgekeurd`

### Perceelbeheer
Een gedetailleerd overzicht van alle percelen.
- **Boomstructuur:** Beheer percelen met onderliggende sub-percelen (rassen/plantjaren)
- **RVO/BRP Integratie:** Officiële perceelgrenzen via PDOK API
- **Kaartweergave:** Interactieve Leaflet kaart met perceelgrenzen
- **Historie:** Volledige spuithistorie per (sub-)perceel

### Voorraadbeheer
- **Automatisch Verbruik:** Voorraad wordt bijgewerkt na bevestigde registratie
- **CTGB Database:** Doorzoekbare database met actuele toelatingsinformatie

---

## Technologie Stack

| Categorie | Technologie |
|-----------|-------------|
| **Frontend** | Next.js 15 (App Router + Turbopack) |
| **Taal** | TypeScript |
| **AI** | Genkit + Google Gemini 2.0 Flash |
| **Database** | Supabase (PostgreSQL) |
| **Caching** | TanStack Query v5 (60s staleTime) + Server-side caching |
| **Styling** | Tailwind CSS + shadcn/ui + Framer Motion |
| **Kaarten** | Leaflet + PDOK |

### Netwerk Resilience
De applicatie is geoptimaliseerd voor gebruik op instabiele verbindingen (5G hotspot):
- **Retry Mechanisme:** Automatische retries met exponential backoff
- **Keep-alive Connections:** Persistente verbindingen naar Supabase
- **Server-side Caching:** CTGB producten gecached voor snellere responses

---

## Projectstructuur

```
src/
├── ai/                 # Genkit flows en AI logica
│   ├── flows/          # Agent flows (intent-router, agribot-agent)
│   ├── prompts/        # AI prompts
│   ├── schemas/        # Intent schemas
│   └── tools/          # AI tools
├── app/                # Next.js App Router
│   ├── (app)/          # Beveiligde routes
│   │   ├── command-center/   # Smart Input & Timeline
│   │   ├── parcels/          # Perceelbeheer
│   │   ├── crop-care/        # Spuitschrift & Voorraad
│   │   └── team-tasks/       # Urenregistratie
│   └── api/            # Backend endpoints
│       ├── analyze-input/    # Multi-modal AI endpoint
│       ├── validate/         # CTGB validatie
│       └── ctgb/             # Product search
├── components/         # React componenten
│   ├── ui/             # shadcn basis componenten
│   ├── domain/         # Domein-specifieke componenten
│   ├── command-bar.tsx # Multi-modal command bar
│   ├── mode-selector.tsx     # Mode switching met Framer Motion
│   └── product-info-card.tsx # Product informatie display
├── hooks/              # React hooks
│   └── use-data.ts     # TanStack Query hooks
└── lib/                # Core logica
    ├── supabase.ts     # Client met retry logic
    ├── supabase-store.ts     # Database functies
    ├── server-cache.ts       # Server-side caching
    ├── ctgb-validator.ts     # Validatie-engine
    └── rag-service.ts        # AI context service
```

---

## Database Schema (Supabase)

De applicatie gebruikt Supabase (PostgreSQL) als database. Hieronder een overzicht van alle tabellen:

### Kern Tabellen

| Tabel | Doel | Belangrijkste Kolommen |
|-------|------|------------------------|
| **spuitschrift** | Bevestigde spuitregistraties | `id`, `date`, `plots[]`, `products` (JSONB), `status`, `validation_message` |
| **logbook** | Ruwe invoer/draft registraties | `id`, `raw_input`, `parsed_data` (JSONB), `status`, `date` |
| **parcels** | Hoofdpercelen | `id`, `name`, `crop`, `area`, `geometry` (JSONB), `rvo_id` |
| **sub_parcels** | Sub-percelen (rassen/plantjaren) | `id`, `parcel_id`, `variety`, `plant_year`, `area` |
| **parcel_history** | Spuithistorie per perceel | `id`, `parcel_id`, `product`, `dosage`, `date`, `log_id` |
| **production_history** | Productie/oogst historie | `id`, `parcel_id`, `year`, `yield`, `quality` |

### Product & Voorraad

| Tabel | Doel | Belangrijkste Kolommen |
|-------|------|------------------------|
| **ctgb_products** | CTGB gewasbeschermingsmiddelen | `toelatingsnummer` (PK), `naam`, `status`, `werkzame_stoffen[]`, `gebruiksvoorschriften` (JSONB), `etikettering` (JSONB) |
| **ctgb_regulation_embeddings** | Vector embeddings voor RAG search | `id`, `product_naam`, `gewas`, `embedding` (VECTOR) |
| **fertilizers** | Meststoffen database | `id`, `name`, `manufacturer`, `category`, `composition` (JSONB) |
| **inventory_movements** | Voorraadmutaties | `id`, `product_name`, `quantity`, `type` (inkoop/verbruik), `date` |
| **product_aliases** | Product synoniemen/afkortingen | `alias`, `official_name`, `confidence`, `usage_count` |
| **product_usages** | Product gebruiksdata | `id`, `product_id`, `usage_count`, `last_used` |
| **active_substances** | Werkzame stoffen referentie | `code` (PK), `name`, `category`, `max_applications_per_year` |
| **product_substances** | Koppeltabel product-stof | `product_id`, `substance_code`, `concentration` |

### Team & Taken

| Tabel | Doel | Belangrijkste Kolommen |
|-------|------|------------------------|
| **task_types** | Soorten werk (snoeien, plukken, etc.) | `id`, `name`, `default_hourly_rate` |
| **task_logs** | Urenregistraties | `id`, `start_date`, `end_date`, `sub_parcel_id`, `task_type_id`, `people_count`, `hours_per_person`, `total_hours` |
| **active_task_sessions** | Actieve timer sessies | `id`, `task_type_id`, `started_at`, `user_id` |

### Research & AI

| Tabel | Doel | Belangrijkste Kolommen |
|-------|------|------------------------|
| **research_papers** | Onderzoeksdocumenten | `id`, `title`, `summary_ai`, `category`, `verdict`, `embedding` (VECTOR) |
| **pests_diseases** | Ziektes en plagen database | `id`, `name`, `type`, `crops[]`, `symptoms`, `treatments` |
| **soil_samples** | Bodemanalyses | `id`, `parcel_id`, `date`, `ph`, `nutrients` (JSONB) |
| **conversations** | Chat sessies/drafts | `id`, `status`, `draft_data` (JSONB), `chat_history` (JSONB) |
| **user_preferences** | Gebruikersvoorkeuren/aliassen | `id`, `alias`, `preferred` |

### Views

| View | Doel |
|------|------|
| **v_task_logs_enriched** | Task logs met perceel- en taaktype info |
| **v_active_task_sessions_enriched** | Actieve sessies met taaktype info |
| **v_sprayable_parcels** | Percelen beschikbaar voor bespuiting |
| **v_substances_summary** | Werkzame stoffen met aantal producten |
| **v_products_with_substances** | Producten met gekoppelde stoffen |
| **v_pests_diseases_summary** | Ziektes/plagen overzicht |

### JSONB Structuren

**ctgb_products.gebruiksvoorschriften:**
```json
[{
  "gewas": "Appel",
  "doelorganisme": "Schurft",
  "dosering": "2.25 kg/ha",
  "maxToepassingen": 8,
  "veiligheidstermijn": "21 dagen",
  "interval": "min. 7 dagen",
  "wCodes": ["W1", "W2"]
}]
```

**spuitschrift.products:**
```json
[{
  "product": "Merpan spuitkorrel",
  "dosage": 2.25,
  "unit": "kg/ha",
  "targetReason": "Schurft"
}]
```

---

## Aan de slag

### 1. Omgeving instellen
Maak een `.env.local` bestand:
```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
GOOGLE_GENAI_API_KEY=...
```

### 2. Database setup
```bash
# Voer de SQL scripts uit in Supabase SQL Editor
# sql/setup_all.sql bevat alle benodigde tabellen

# Sync CTGB producten
npx tsx scripts/sync-ctgb-supabase.ts
```

### 3. Installatie & Development
```bash
npm install
npm run dev
```
De applicatie is bereikbaar op `http://localhost:3000`.

---

## Roadmap
- [ ] Offline Mode voor registraties in het veld
- [ ] RVO Koppeling voor automatische export
- [ ] Voice input voor hands-free registratie
- [ ] Push notificaties voor veiligheidstermijnen

---

*Studio — Ontwikkeld met passie voor de agrarische sector door Jordi de Jager.*
