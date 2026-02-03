# CLAUDE.md - Research Hub

## Doel en Scope

Kennismanagement systeem voor fruitteelt met drie hoofdcomponenten: onderzoekspapers, ziekten/plagen encyclopedie, en veldsignalen (social feed). Bereidt RAG-infrastructuur voor met vector embeddings.

**Kernfunctionaliteit:**
- Research papers database met AI summaries
- Ziekten & plagen encyclopedie (20+ entries)
- Field Signals social feed voor team observaties
- Vector embeddings voor toekomstige semantic search

---

## Subpagina's

| Route | Doel |
|-------|------|
| `/research` | Main dashboard met papers en signals tabs |
| `/research/[id]` | Paper detail met PDF viewer en AI analyse |
| `/research/pests` | Ziekten/plagen overzicht |
| `/research/pests/[id]` | Individuele ziekte/plaag detail |

---

## Componenten en Verantwoordelijkheden

### Page Components

| Component | Locatie | Verantwoordelijkheid |
|-----------|---------|---------------------|
| `page.tsx` | `/research/page.tsx` | Server wrapper met Suspense |
| `client-page.tsx` | `/research/client-page.tsx` | Main dashboard, tabs, stats |
| `client-page.tsx` | `/research/[id]/client-page.tsx` | PDF viewer + AI analyse |
| `client-page.tsx` | `/research/pests/client-page.tsx` | Pests overzicht grid |
| `client-page.tsx` | `/research/pests/[id]/client-page.tsx` | Pest detail view |

### Domain Components

| Component | Locatie | Verantwoordelijkheid |
|-----------|---------|---------------------|
| `UploadModal` | `/src/components/domain/research/upload-modal.tsx` | PDF upload met metadata |
| `CreateSignalForm` | `/src/components/domain/research/signals/create-signal-form.tsx` | Signal invoer formulier |
| `SignalCard` | `/src/components/domain/research/signals/signal-card.tsx` | Signal feed item |

---

## Supabase Tabellen

### Research Papers

```sql
research_papers
├── id UUID PRIMARY KEY
├── title TEXT NOT NULL
├── summary_ai TEXT              -- AI-gegenereerde samenvatting
├── content_url TEXT             -- PDF in storage bucket
├── category research_category   -- 'disease', 'storage', 'cultivation', 'general'
├── verdict research_verdict     -- 'practical', 'experimental', 'theoretical'
├── tags TEXT[]
├── embedding VECTOR(768)        -- Voor RAG (prepared)
└── created_at TIMESTAMPTZ
```

### Pests & Diseases

```sql
pests_diseases
├── id UUID PRIMARY KEY
├── name TEXT NOT NULL           -- 'Schurft', 'Fruitmot'
├── latin_name TEXT              -- 'Venturia inaequalis'
├── type pest_type               -- 'fungus', 'insect', 'bacteria', 'virus', 'mite', 'other'
├── crop crop_type               -- 'apple', 'pear', 'both'
├── impact_level impact_level    -- 'low', 'medium', 'high', 'critical'
├── subtitle TEXT
├── hero_image_url TEXT
├── gallery_images JSONB
├── overwintering TEXT           -- Overwinteringsinfo
├── infection_conditions TEXT    -- Besmettingscondities
├── damage_threshold TEXT        -- Schadedrempel
├── lifecycle_timeline JSONB     -- 12-maanden activiteit
├── symptoms JSONB               -- [{stage, description}]
├── biological_control TEXT
├── cultural_control TEXT
├── chemical_control TEXT
├── tags TEXT[]
├── search_keywords TEXT[]
├── related_products TEXT[]      -- CTGB product IDs
├── external_links JSONB
└── created_at, updated_at
```

### Field Signals

```sql
field_signals
├── id UUID PRIMARY KEY
├── author_id UUID → auth.users
├── content TEXT NOT NULL
├── media_url TEXT               -- Bijlage (foto/PDF)
├── visibility TEXT              -- 'public', 'private'
├── tags TEXT[] NOT NULL         -- Min 1 tag required
├── embedding VECTOR(768)        -- Voor RAG (prepared)
├── likes_count INT DEFAULT 0    -- Denormalized
└── created_at TIMESTAMPTZ

field_signal_reactions
├── id UUID PRIMARY KEY
├── signal_id UUID → field_signals
├── user_id UUID → auth.users
├── type TEXT                    -- 'like', 'comment'
├── content TEXT                 -- Comment tekst
├── created_at TIMESTAMPTZ
└── UNIQUE(signal_id, user_id, type)
```

---

## Business Rules

### Research Paper Categories

| Category | Beschrijving | Kleur |
|----------|--------------|-------|
| `disease` | Ziekte/plaag management | Rood |
| `storage` | Bewaring en koeling | Blauw |
| `cultivation` | Teelttechnieken | Groen |
| `general` | Overige landbouw | Grijs |

### Research Verdict Types

| Verdict | Beschrijving | Kleur |
|---------|--------------|-------|
| `practical` | Veldgetest, direct toepasbaar | Emerald |
| `experimental` | Lab/proefstadium, veelbelovend | Amber |
| `theoretical` | Conceptueel/simulatie | Blauw |

### Pest/Disease Taxonomie

**Types (pest_type):**
- `fungus` - Schimmels (Schurft, Meeldauw, Kanker)
- `insect` - Insecten (Fruitmot, Bladluis)
- `bacteria` - Bacteriën
- `virus` - Virussen
- `mite` - Mijten (Spintmijt)
- `other` - Overige

**Crops (crop_type):**
- `apple` - Alleen appel
- `pear` - Alleen peer
- `both` - Beide gewassen

**Impact Levels:**
- `critical` (Rood) - 0-tolerantie, directe actie
- `high` (Oranje) - Preventieve maatregelen essentieel
- `medium` (Geel) - Monitoren en beheren
- `low` (Groen) - Minimale zorg

### Field Signal Tags

Beschikbare tags:
```typescript
['Appel', 'Peer', 'Schurft', 'Kanker', 'Bemesting', 'Nieuws', 'Waarschuwing']
```

**Validatie:** Minimaal 1 tag verplicht bij aanmaken

### Lifecycle Timeline

12-maanden activiteitsdata:
```typescript
lifecycleTimeline: [
  { month: 'Jan', activity: 0 },    // Inactief
  { month: 'Feb', activity: 0 },
  { month: 'Mar', activity: 30 },   // Beginnend
  { month: 'Apr', activity: 70 },   // Actief
  { month: 'May', activity: 100 },  // Piek
  // ...
]
```

### Symptom Stages

Progressie tracking:
```typescript
symptoms: [
  { stage: 'early', description: 'Eerste tekenen...' },
  { stage: 'developing', description: 'Voortschrijdend...' },
  { stage: 'advanced', description: 'Ernstige schade...' }
]
```

---

## State Management

### React Query Hooks

```typescript
// Research Papers
usePapers() → ResearchPaper[]
usePaper(id) → ResearchPaper

// Pests & Diseases
usePestsDiseases() → PestDisease[]
usePestDisease(id) → PestDisease

// Field Signals
useFieldSignals() → FieldSignal[]
```

### Signal Interactions

```typescript
// Like toggle (optimistic update)
toggleFieldSignalLikeAction(signalId, userId, isLiked)
  - isLiked=true: delete reaction
  - isLiked=false: add reaction
  - Trigger updates likes_count automatically

// Create signal
addFieldSignal({
  content: string,
  tags: string[],
  media_url?: string,
  visibility: 'public' | 'private'
})
```

---

## Data Flow

### Paper Upload Flow

```
Upload Modal
    │
    ├─ User drags PDF
    ├─ Enters title, category, tags
    │
    └─ Submit
         │
         ├─1→ Upload PDF to storage bucket (research_pdfs)
         │
         ├─2→ Create research_papers record
         │
         └─3→ (Future) Generate AI summary + embedding
```

### Signal Feed Flow

```
Create Signal Form
    │
    ├─ User enters observation
    ├─ Selects tags (min 1)
    ├─ Optional: attach media
    │
    └─ Submit
         │
         ├─ addFieldSignal() → field_signals
         │
         └─ Invalidate feed cache
              │
              └─ New signal appears in feed
```

### Like Interaction Flow

```
User clicks heart icon
    │
    ├─ Optimistic UI update (toggle heart fill)
    │
    ├─ toggleFieldSignalLikeAction()
    │   ├─ If was liked: DELETE reaction
    │   └─ If was not liked: INSERT reaction
    │
    └─ Database trigger updates likes_count
```

---

## RAG/Embedding Infrastructure

### Current State

Vector embeddings zijn **prepared maar nog niet actief**:

**Embedding Service** (`/src/lib/embedding-service.ts`):
```typescript
// Model: Google AI text-embedding-004
// Dimensions: 768
// Batch size: 10 items met 1s delays

generateEmbedding(text: string): Promise<number[]>
generateEmbeddings(texts: string[]): Promise<number[][]>
```

**Database Support:**
- `research_papers.embedding` (VECTOR(768))
- `field_signals.embedding` (VECTOR(768))
- pgvector extension enabled

### Planned RAG Pipeline

```
1. Upload/Create content
    │
2. Extract text content
    │
3. Generate 768-dim embedding via Google AI
    │
4. Store in vector column
    │
5. Enable semantic search via match_*() RPC
    │
6. Power AgriBot queries:
   - "Wat zegt onderzoek over schurftbestrijding?"
   - "Zijn er veldobservaties over bewaarrot?"
```

---

## UI Patterns

### Research Dashboard

**Stats Cards:**
- Nieuw deze maand
- Totaal onderzoek
- Top categorie

**Papers Tab:**
- Tabel met sorteerbare kolommen
- Global search
- Category filter
- Verdict indicator (kleur stip)

**Signals Tab:**
- 2-kolom layout (feed + sidebar)
- Infinite scroll feed
- Trending tags sidebar

### Pest Overview Grid

**Filters:**
- Full-text search
- Crop filter (Apple/Pear/Both)
- Type filter (Fungal/Insect/Mite)
- Tab-based grouping

**PestCard:**
- Hero image of icon
- Impact badge (color-coded)
- Crop icons
- Lifecycle timeline bar
- Type badge

### Pest Detail View

**Tabs:**
1. **Biografie/Levenscyclus** - Overwintering, infectiecondities
2. **Symptomen** - Staged progression
3. **Bestrijding** - Biological/Cultural/Chemical
4. **Tijdlijn** - 12-month calendar
5. **Resources** - External links, related products

---

## Design Decisions

### Separate Encyclopedia
Ziekten/plagen als standalone module:
- Referentie onafhankelijk van registraties
- Educatief voor team
- Basis voor toekomstige AI advies

### Social Signals
Veldobservaties als social feed:
- Team kennisdeling
- Real-time updates
- Like/comment engagement
- Future: @mentions, threading

### Verdict Classification
3-tier systeem voor onderzoek:
- Practical: Direct toepasbaar
- Experimental: Veelbelovend maar niet bewezen
- Theoretical: Academisch/conceptueel

Helpt telers bij prioriteren van informatie.

### Lifecycle Timeline
12-maanden visualisatie:
- Seizoensgebonden planning
- Vooruit waarschuwen
- Integratie met spray scheduling (toekomst)

### Vector Embeddings Prepared
Infrastructure klaar voor RAG:
- Geen blocking voor launch
- Incrementeel activeren
- Semantic search over alle content

---

## Storage Configuration

### research_pdfs Bucket

```sql
-- Supabase Storage bucket
CREATE POLICY "Public read for authenticated"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'research_pdfs');

CREATE POLICY "Authenticated can upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'research_pdfs');
```

**Max file size:** 20MB
**Allowed types:** PDF

---

## Current Pest Data

### Appel Schimmels (5)
- Schurft (Venturia inaequalis) - Critical
- Meeldauw (Podosphaera leucotricha) - High
- Vruchtboomkanker (Nectria galligena) - High
- Gloeosporium (Neofabraea alba) - High (bewaarziekte)
- Phytophthora (P. cactorum) - Medium

### Appel Insecten (3)
- Fruitmot (Cydia pomonella) - Critical
- Appelbloedluis (Eriosoma lanigerum) - High
- Spintmijt (Panonychus ulmi) - Medium

### Peer Schimmels (3)
- Stemphylium (S. vesicarium) - Critical
- Perenkanker (Nectria galligena) - High

### Peer Insecten (4)
- Perenbladvlo (Cacopsylla pyri) - Critical
- Perenknopkever (Anthonomus pyri) - Medium
- Perenzaagwesp (Hoplocampa brevis) - Medium
- Perengalmug (Contarinia pyrivora) - Medium
