# Slimme Invoer - Technische Documentatie

> Laatste update: 3 februari 2026

Dit document beschrijft de volledige werking van de "Slimme Invoer" functionaliteit in het AgriBot Command Center. Het systeem verwerkt natuurlijke taal invoer van gebruikers en zet deze om naar gestructureerde registraties, queries en acties.

---

## Inhoudsopgave

1. [Architectuur Overzicht](#1-architectuur-overzicht)
2. [Intent Classificatie Systeem](#2-intent-classificatie-systeem)
3. [Spray Application Parsing](#3-spray-application-parsing)
4. [Product Alias Resolution](#4-product-alias-resolution)
5. [Perceel Groep Resolutie](#5-perceel-groep-resolutie)
6. [Correctie Detectie (Multi-turn)](#6-correctie-detectie-multi-turn)
7. [AI Agent voor Complexe Vragen](#7-ai-agent-voor-complexe-vragen)
8. [RAG Service (Semantisch Zoeken)](#8-rag-service-semantisch-zoeken)
9. [CTGB Validatie](#9-ctgb-validatie)
10. [Processing Phases & Streaming](#10-processing-phases--streaming)
11. [Frontend Componenten](#11-frontend-componenten)
12. [Praktijkvoorbeeld: Complete Flow](#12-praktijkvoorbeeld-complete-flow)
13. [Bestandsoverzicht](#13-bestandsoverzicht)

---

## 1. Architectuur Overzicht

De slimme invoer functionaliteit is gebouwd in **drie lagen** met duidelijke scheiding van verantwoordelijkheden:

### 1.1 Frontend Layer (UI & Componenten)

| Component | Bestand | Functie |
|-----------|---------|---------|
| Smart Input Page | `/src/app/(app)/command-center/smart-input/page.tsx` | Hoofdpagina, state management, streaming |
| Smart Invoer Feed | `/src/components/smart-invoer-feed.tsx` | Chat-achtige weergave van invoer en responses |
| Command Bar | `/src/components/command-bar.tsx` | Input textarea met mode selector |
| Mode Selector | `/src/components/mode-selector.tsx` | 4 invoer-modi met specifieke acties |

### 1.2 API Layer (Server-side Processing)

| Endpoint | Bestand | Functie |
|----------|---------|---------|
| Analyze Input | `/src/app/api/analyze-input/route.ts` | Centrale verwerkingspipeline |

### 1.3 AI/Services Layer

| Service | Bestand | Functie |
|---------|---------|---------|
| Intent Router | `/src/ai/flows/intent-router.ts` | Classificeert gebruikersintentie |
| Spray Parser | `/src/ai/flows/parse-spray-application.ts` | Parseert bespuitingsregistraties |
| AgriBot Agent | `/src/ai/flows/agribot-agent.ts` | Agent met tool-calling voor complexe vragen |
| RAG Service | `/src/lib/rag-service.ts` | Semantisch zoeken in CTGB database |
| Validation Service | `/src/lib/validation-service.ts` | CTGB wetgeving validatie |

---

## 2. Intent Classificatie Systeem

### 2.1 Ondersteunde Intent Types

Het systeem herkent **9 verschillende intent types**:

| Intent | Beschrijving | Voorbeelden |
|--------|-------------|-------------|
| `REGISTER_SPRAY` | Registratie van een bespuiting | "Gespoten met Captan op de appels" |
| `QUERY_PRODUCT` | Vraag over producten/middelen | "Welke fungicides kan ik gebruiken?" |
| `QUERY_HISTORY` | Vraag over spuitgeschiedenis | "Wanneer heb ik voor het laatst gespoten?" |
| `QUERY_REGULATION` | Vraag over CTGB regels | "Wat is de VGT van Decis?" |
| `NAVIGATE` | Navigatie naar pagina/perceel | "Ga naar de Elstar" |
| `CONFIRM` | Bevestiging | "Ja", "Klopt", "OK" |
| `CANCEL` | Annulering | "Stop", "Nee", "Annuleer" |
| `CLARIFY` | Vraag om uitleg | "Wat bedoel je?" |
| `MODIFY_DRAFT` | Aanpassing aan bestaande draft | "Verander de dosering naar 2L" |

### 2.2 Twee-fase Classificatie Strategie

#### Fase 1: Pre-classificatie (Signaalwoorden)

De eerste fase is **volledig regelgebaseerd** en kost 0 tokens:

```typescript
// Signaalwoorden per intent type
const INTENT_SIGNALS = {
  REGISTER_SPRAY: [
    'gespoten', 'spuiten', 'bespuiting', 'bespoten',
    'vandaag', 'gisteren', 'vanochtend', 'vanmiddag',
    'l/ha', 'kg/ha', 'liter', 'kilo'
  ],
  QUERY_PRODUCT: [
    'welke middelen', 'wat kan ik', 'alternatieven',
    'waarmee', 'tegen', 'voor bestrijding'
  ],
  QUERY_HISTORY: [
    'hoeveel', 'wanneer', 'laatste keer',
    'dit jaar', 'overzicht', 'historie'
  ],
  QUERY_REGULATION: [
    'vgt', 'veiligheidstermijn', 'wachttijd',
    'dosering', 'maximum', 'mag ik', 'voorschrift'
  ]
};
```

**Detectie-algoritme:**
1. Tekst wordt genormaliseerd (lowercase, whitespace trimmen)
2. Check op aanwezigheid van signaalwoorden
3. Tel matches per intent type
4. Hoogste score met drempelwaarde wint

#### Fase 2: AI Classificatie (Fallback)

Alleen als pre-filter **onduidelijk** is (confidence < 0.7):

- Compact Genkit prompt (~100 tokens)
- Gebruikt `gemini-2.0-flash` model
- Combineert resultaat met pre-filter voor boost

```typescript
// AI classificatie schema
const IntentSchema = z.object({
  intent: z.enum([
    'REGISTER_SPRAY', 'QUERY_PRODUCT', 'QUERY_HISTORY',
    'QUERY_REGULATION', 'NAVIGATE', 'CONFIRM', 'CANCEL',
    'CLARIFY', 'MODIFY_DRAFT'
  ]),
  confidence: z.number().min(0).max(1),
  entities: z.object({
    products: z.array(z.string()).optional(),
    parcels: z.array(z.string()).optional(),
    date: z.string().optional(),
    dosage: z.number().optional()
  }).optional()
});
```

---

## 3. Spray Application Parsing

### 3.1 V2 Parser Capabilities

De spray parser (V2) ondersteunt **complexe, natuurlijke taal invoer**:

**Input voorbeelden:**
```
"Gisteren 2L Captan op alle peren, maar de Conference niet"
"Alle appels met Merpan, maar de Kanzi ook met Score"
"Fruit met Score, Lucas halve dosering"
"Behalve de Conference"
```

**Output structuur:**
```typescript
interface ParsedSprayApplication {
  registrations: Array<{
    plots: string[];           // Perceel IDs
    products: Array<{
      product: string;         // Product naam
      dosage: number;          // Dosering waarde
      unit: string;            // Eenheid (L, kg, ml)
    }>;
    label: string;             // Beschrijving voor UI
    reason?: 'base' | 'exception' | 'addition' | 'reduced_dosage';
  }>;
  date: string;                // ISO date string
  notes?: string;              // Optionele notities
}
```

### 3.2 Variatie Detectie

Het systeem herkent **variatie-patronen** in de tekst:

| Patroon | Type | Voorbeeld |
|---------|------|-----------|
| `maar ... niet` | Exception | "maar de Conference niet" |
| `behalve` | Exception | "behalve de Elstar" |
| `uitgezonderd` | Exception | "uitgezonderd perceel A" |
| `ook met` | Addition | "maar de Kanzi ook met Score" |
| `halve dosering` | Reduced | "Lucas halve dosering" |
| `zonder` | Exception | "alles zonder Decis" |

### 3.3 Datum Parsing

Ondersteunde datum-formaten:

| Invoer | Resultaat |
|--------|-----------|
| "vandaag" | Huidige datum |
| "gisteren" | Datum - 1 dag |
| "eergisteren" | Datum - 2 dagen |
| "afgelopen maandag" | Vorige maandag |
| "3 dagen geleden" | Datum - 3 dagen |
| "15 januari" | 15-01-{huidig jaar} |
| "15-01-2026" | Exacte datum |

---

## 4. Product Alias Resolution

### 4.1 Vijf-niveau Resolutie Hiërarchie

Het systeem lost product-aliassen op in **5 stappen** (van hoog naar laag confidence):

| Niveau | Methode | Confidence | Voorbeeld |
|--------|---------|------------|-----------|
| 1 | Exacte match CTGB | 100% | "Merpan Spuitkorrel" → direct |
| 2 | Statische alias mapping | 95% | "captan" → "Merpan Spuitkorrel" |
| 3 | Gebruikersvoorkeur | 90% | Eerdere correcties/keuzes |
| 4 | Historische data | 80% | Recent gebruikte variant |
| 5 | Partial match CTGB | 60% | Eerste woord overeenkomst |

### 4.2 Statische Alias Database

160+ voorgeprogrammeerde aliassen in `/src/lib/product-aliases.ts`:

```typescript
const PRODUCT_ALIASES: Record<string, string> = {
  // Fungicides
  'captan': 'Merpan Spuitkorrel',
  'merpan': 'Merpan Spuitkorrel',
  'luna': 'Luna Sensation',
  'luna sensation': 'Luna Sensation',
  'score': 'Score 250 EC',
  'bellis': 'Bellis',

  // Insecticides
  'decis': 'Decis EC',
  'karate': 'Karate Zeon',
  'calypso': 'Calypso',

  // Herbicides
  'roundup': 'Roundup',
  'basta': 'Basta',

  // ... 150+ meer
};
```

### 4.3 Fuzzy Matching

Voor niet-exacte matches:

```typescript
// Levenshtein distance voor typo's
'capton' → 'captan' → 'Merpan Spuitkorrel'

// Starts-with matching
'mer' → 'Merpan Spuitkorrel'

// Werkzame stof matching
'captan-middel' → Zoek producten met werkzame stof 'Captan'
```

---

## 5. Perceel Groep Resolutie

### 5.1 Groepsaanduiding Detectie

Het systeem herkent **groepsaanduidingen** in tekst:

| Patroon | Regex | Resultaat |
|---------|-------|-----------|
| "alle appels" | `/alle?\s+(appels?)/i` | Alle percelen met gewas 'Appel' |
| "alle peren" | `/alle?\s+(peren?)/i` | Alle percelen met gewas 'Peer' |
| "de Elstar" | `/de\s+(elstars?)/i` | Alle percelen met ras 'Elstar' |
| "alles" | `/\b(alles\|alle\s+percelen?)\b/i` | Alle actieve percelen |
| "het fruit" | `/\b(fruit\|fruitteelt)\b/i` | Alle fruitpercelen |

### 5.2 Gewas-naar-Perceel Mapping

```typescript
const CROP_MAPPINGS: Record<string, string[]> = {
  'appel': ['appel', 'apple', 'appels', 'pitfruit'],
  'peer': ['peer', 'pear', 'peren', 'conference', 'doyenne'],
  'kers': ['kers', 'cherry', 'kersen'],
  'pruim': ['pruim', 'plum', 'pruimen'],
  'fruit': ['appel', 'peer', 'kers', 'pruim']  // Supercategorie
};
```

### 5.3 Ras-specifieke Selectie

```typescript
// "De Elstar" → alle percelen met ras='Elstar'
const varietyPatterns = {
  'elstar': /elstars?/i,
  'jonagold': /jonagolds?/i,
  'braeburn': /braeburns?/i,
  'golden': /golden(\s*delicious)?/i,
  'conference': /conferences?/i,
  'doyenne': /doyenn[ée]/i
};
```

---

## 6. Correctie Detectie (Multi-turn)

### 6.1 Ondersteunde Correctie Types

Het systeem detecteert en verwerkt **correcties in vervolgberichten**:

| Type | Trigger woorden | Actie |
|------|-----------------|-------|
| `remove_last_plot` | "niet dat perceel", "niet die" | Verwijder laatste perceel |
| `remove_last_product` | "niet dat middel" | Verwijder laatste product |
| `remove_specific_plot` | "verwijder de elstar" | Verwijder specifiek perceel |
| `remove_specific_product` | "verwijder captan" | Verwijder specifiek product |
| `update_dosage` | "maak het 1.5 kg" | Update dosering |
| `update_date` | "niet vandaag, gisteren" | Update datum |
| `cancel_all` | "stop", "annuleer" | Annuleer alles |
| `confirm` | "ja", "klopt" | Bevestig registratie |
| `undo` | "ongedaan maken" | Herstel laatste actie |

### 6.2 Negatie Patroon Herkenning

```typescript
const NEGATION_PATTERNS = [
  /^nee\b/,              // Start met "nee"
  /^niet\b/,             // Start met "niet"
  /toch\s*niet/,         // "toch niet"
  /eigenlijk\s*niet/,    // "eigenlijk niet"
  /\bniets?\b.*$/,       // Eindigt op "niet"
  /maar\s*niet/,         // "maar niet"
  /hoeft\s*niet/,        // "hoeft niet"
  /laat\s*maar/,         // "laat maar"
  /vergeet/              // "vergeet"
];
```

### 6.3 Context-aware Correcties

Het systeem houdt **conversatie-context** bij:

```typescript
interface ConversationContext {
  lastRegistration: ParsedSprayApplication | null;
  lastMentionedPlots: string[];
  lastMentionedProducts: string[];
  pendingCorrections: Correction[];
}

// Voorbeeld flow:
// 1. "2L Captan op alle appels"
// 2. "Niet de Elstar" → Verwijdert Elstar uit registratie
// 3. "En ook Score" → Voegt Score toe aan zelfde registratie
```

---

## 7. AI Agent voor Complexe Vragen

### 7.1 Agent Capabilities

De AgriBot Agent handelt vragen af die **tool-calling** vereisen:

```
"Wanneer heb ik voor het laatst Captan gebruikt op de Elstar?"
"Welke fungicides heb ik dit jaar het meest gebruikt?"
"Wat is de dosering van Decis en wanneer heb ik het laatst gebruikt?"
```

### 7.2 Beschikbare Tools

| Tool | Functie | Parameters |
|------|---------|------------|
| `searchProducts` | Zoek CTGB producten | query, filters |
| `getProductDetails` | Volledige product info | productId |
| `getSprayHistory` | Spuitgeschiedenis | parcelId?, dateRange? |
| `getParcelInfo` | Perceel informatie | parcelId |
| `searchRegulations` | Semantisch zoeken CTGB | query |

### 7.3 Tool Calling Flow

```
1. Gebruiker: "Wat is de VGT van Captan op appel?"

2. Agent denkt: "Ik moet productdetails ophalen"

3. Agent roept tool: searchProducts({ query: "Captan" })

4. Tool resultaat: [{ id: "123", naam: "Merpan Spuitkorrel", ... }]

5. Agent roept tool: getProductDetails({ productId: "123" })

6. Tool resultaat: { veiligheidstermijn: "21 dagen", gewassen: [...] }

7. Agent antwoordt: "De veiligheidstermijn van Captan (Merpan) op appel is 21 dagen."
```

### 7.4 Conversation Memory

De agent ondersteunt **context-aware vervolgvragen**:

```
Gebruiker: "Wat is de VGT van Captan?"
Agent: "De VGT van Captan is 21 dagen op appel."

Gebruiker: "En op peer?"
Agent: (begrijpt dat "peer" verwijst naar eerder genoemde Captan)
       "Op peer is de VGT van Captan ook 21 dagen."

Gebruiker: "En Luna?"
Agent: (nieuwe product query)
       "De VGT van Luna Sensation is 14 dagen op appel en peer."
```

---

## 8. RAG Service (Semantisch Zoeken)

### 8.1 Embedding Generatie

Het systeem gebruikt **vector embeddings** voor semantisch zoeken:

```typescript
// Google's text-embedding-004 model
const EMBEDDING_MODEL = 'text-embedding-004';
const EMBEDDING_DIMENSIONS = 768;

// Embedding input samenstelling
function createEmbeddingText(usage: ProductUsage): string {
  return [
    usage.productNaam,
    usage.werkzameStoffen?.join(', '),
    usage.gewas,
    usage.doelorganisme,
    `Dosering: ${usage.dosering}`,
    `VGT: ${usage.veiligheidstermijn}`,
    usage.opmerkingen
  ].filter(Boolean).join(' | ');
}
```

### 8.2 Vector Similarity Search

```typescript
// Supabase RPC function
const { data } = await supabase.rpc('match_product_usages', {
  query_embedding: embedding,
  match_threshold: 0.4,
  match_count: 10
});

// Resultaat bevat:
interface ProductUsageMatch {
  productId: string;
  productNaam: string;
  toelatingsnummer: string;
  gewas: string;
  doelorganisme: string;
  dosering: string;
  veiligheidstermijn: string;
  maxToepassingen: number;
  interval: number;
  similarity: number;  // 0-1 score
}
```

### 8.3 Gebruik in Queries

```
Query: "Kan ik vlak voor oogst nog spuiten met Captan?"

1. Genereer embedding voor query
2. Zoek vergelijkbare product_usages
3. Filter op relevante gewassen
4. Analyseer VGT en oogstdatum
5. Genereer antwoord met context
```

---

## 9. CTGB Validatie

### 9.1 Validatie Checks

Het systeem valideert bespuitingen tegen **CTGB-wetgeving**:

| Check | Beschrijving | Ernst |
|-------|-------------|-------|
| Toelating | Is product toegelaten voor dit gewas? | Error |
| Dosering | Overschrijdt dosering het maximum? | Error |
| VGT | Is veiligheidstermijn gerespecteerd? | Warning |
| Max toepassingen | Seizoenslimiet overschreden? | Error |
| Interval | Minimale interval tussen toepassingen? | Warning |
| Werkzame stof | Cumulatief maximum per seizoen? | Warning |

### 9.2 Teelt-hiërarchie

```typescript
const CROP_HIERARCHY: Record<string, string[]> = {
  'appel': ['appel', 'appels', 'pitvruchten', 'pitfruit', 'vruchtbomen', 'fruit'],
  'peer': ['peer', 'peren', 'pitvruchten', 'vruchtbomen', 'fruit'],
  'kers': ['kers', 'kersen', 'steenvruchten', 'vruchtbomen', 'fruit'],
  'pruim': ['pruim', 'pruimen', 'steenvruchten', 'vruchtbomen', 'fruit']
};

// Als product toegelaten is voor 'pitvruchten',
// geldt dit ook voor 'appel' en 'peer'
```

### 9.3 Validatie Resultaat

```typescript
interface ValidationResult {
  isValid: boolean;
  flags: Array<{
    type: 'error' | 'warning' | 'info';
    code: string;
    message: string;
    details?: Record<string, any>;
  }>;
  matchedTargets: Map<string, {
    productId: string;
    gewas: string;
    dosering: string;
    vgt: string;
  }>;
}

// Voorbeeld flags:
// { type: 'error', code: 'NOT_ALLOWED', message: 'Product X is niet toegelaten voor gewas Y' }
// { type: 'warning', code: 'VGT_WARNING', message: 'Let op: VGT van 21 dagen' }
// { type: 'info', code: 'MAX_APPLICATIONS', message: 'Nog 2 toepassingen mogelijk dit seizoen' }
```

---

## 10. Processing Phases & Streaming

### 10.1 Processing Phases

De UI toont **real-time voortgang** tijdens verwerking:

| Phase | Beschrijving | UI Indicator |
|-------|-------------|--------------|
| `idle` | Standaard staat | - |
| `searching` | Zoeken naar producten/percelen | Search icon, spinner |
| `context_ready` | Context geladen, aliassen gevonden | Sparkles icon |
| `extracting` | AI analyseert intent | Brain icon |
| `validating` | CTGB regels checken | Shield icon |
| `agent_thinking` | Agent beslist welke tools | Lightbulb icon |
| `agent_tool_call` | Tool wordt uitgevoerd | Tool-specific icon |
| `complete` | Verwerking klaar | Check icon |
| `error` | Fout opgetreden | Alert icon |

### 10.2 Agent State Tracking

```typescript
interface AgentState {
  isActive: boolean;
  currentTool: string | null;
  toolHistory: Array<{
    tool: string;
    status: 'calling' | 'done';
    duration?: number;
  }>;
  answer: string | null;
}

// Tool display labels
const TOOL_LABELS: Record<string, { label: string; icon: LucideIcon }> = {
  'searchProducts': { label: 'Producten zoeken', icon: Search },
  'getProductDetails': { label: 'Productdetails ophalen', icon: Database },
  'getSprayHistory': { label: 'Spuithistorie ophalen', icon: History },
  'getParcelInfo': { label: 'Perceelinformatie ophalen', icon: MapPin },
  'searchRegulations': { label: 'Regelgeving zoeken', icon: FileText }
};
```

### 10.3 Streaming Response

```typescript
// Server-sent events voor real-time updates
const stream = new ReadableStream({
  async start(controller) {
    // Phase updates
    sendEvent(controller, { type: 'phase', phase: 'searching' });

    // Partial results
    sendEvent(controller, { type: 'partial', data: partialResult });

    // Agent tool calls
    sendEvent(controller, {
      type: 'agent_tool',
      tool: 'searchProducts',
      status: 'calling'
    });

    // Final result
    sendEvent(controller, { type: 'complete', data: finalResult });
  }
});
```

---

## 11. Frontend Componenten

### 11.1 Mode Selector

4 invoer-modi met specifieke functionaliteit:

| Mode | Icon | Placeholder | Quick Actions |
|------|------|-------------|---------------|
| `registration` | Tractor | "Beschrijf je bespuiting..." | "Vandaag gespoten", "Gisteren..." |
| `product_info` | FlaskConical | "Vraag over producten..." | "Welke middelen", "VGT van..." |
| `workforce` | Timer | "Uren registreren..." | "2 uur snoeien", "Team A..." |
| `research` | Microscope | "Onderzoeksvraag..." | "Vergelijk middelen", "Alternatieven" |

### 11.2 Smart Invoer Feed

Chat-achtige weergave met:

- **Gebruikersinvoer** (rechts, blauw)
- **Systeem responses** (links, grijs)
- **Processing indicators** (geanimeerd)
- **Agent tool history** (collapsible)
- **Registration cards** (interactief)

### 11.3 Registration Group Card

Weergave van gegroepeerde registraties:

```
┌─────────────────────────────────────────┐
│ 3 februari 2026                         │
├─────────────────────────────────────────┤
│ ● Alle peren (3 percelen)               │
│   └─ Merpan Spuitkorrel - 2 L/ha        │
│                                         │
│ ○ Conference (uitgezonderd)             │
│   └─ Geen behandeling                   │
├─────────────────────────────────────────┤
│ [Opslaan als Concept]  [Bevestigen]     │
└─────────────────────────────────────────┘
```

---

## 12. Praktijkvoorbeeld: Complete Flow

### Input: "Gisteren 2L Captan op alle peren, maar de Conference niet"

```
┌──────────────────────────────────────────────────────────────┐
│ STAP 1: INTENT CLASSIFICATION                                │
├──────────────────────────────────────────────────────────────┤
│ Pre-filter detecteert:                                       │
│ - "gisteren" → datum indicator                               │
│ - "2L" → dosering                                            │
│ - "Captan" → product                                         │
│ - "alle peren" → perceel groep                               │
│                                                              │
│ Resultaat: REGISTER_SPRAY (confidence: 0.95)                 │
│ → Geen AI call nodig                                         │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ STAP 2: PARCEL RESOLUTION                                    │
├──────────────────────────────────────────────────────────────┤
│ Detectie: "alle peren" → groep keyword                       │
│ Resolutie: Match alle percelen met gewas='peer'              │
│                                                              │
│ Resultaat: ["peren-1", "peren-2", "conference-1"]            │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ STAP 3: PRODUCT ALIAS RESOLUTION                             │
├──────────────────────────────────────────────────────────────┤
│ Input: "Captan"                                              │
│ Check: Statische alias mapping                               │
│                                                              │
│ Resultaat: "Merpan Spuitkorrel" (confidence: 95%)            │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ STAP 4: SPRAY APPLICATION PARSING (V2)                       │
├──────────────────────────────────────────────────────────────┤
│ Variatie detectie: "maar ... niet" patroon gevonden          │
│                                                              │
│ AI extraheert:                                               │
│ {                                                            │
│   registrations: [                                           │
│     {                                                        │
│       plots: ["peren-1", "peren-2"],                         │
│       products: [{                                           │
│         product: "Merpan Spuitkorrel",                       │
│         dosage: 2,                                           │
│         unit: "L"                                            │
│       }],                                                    │
│       label: "Peren (behalve Conference)",                   │
│       reason: "base"                                         │
│     },                                                       │
│     {                                                        │
│       plots: ["conference-1"],                               │
│       products: [],                                          │
│       label: "Conference (niet bespoten)",                   │
│       reason: "exception"                                    │
│     }                                                        │
│   ],                                                         │
│   date: "2026-02-02"                                         │
│ }                                                            │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ STAP 5: CTGB VALIDATION                                      │
├──────────────────────────────────────────────────────────────┤
│ Checks:                                                      │
│ ✓ Merpan Spuitkorrel toegelaten voor Peer                    │
│ ✓ Dosering 2 L/ha binnen maximum (3 L/ha)                    │
│ ⚠ VGT: 21 dagen - Let op bij nadering oogst                  │
│ ✓ Nog 4 toepassingen mogelijk dit seizoen                    │
│                                                              │
│ Resultaat: isValid=true, 1 warning                           │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ STAP 6: UI UPDATE (STREAMING)                                │
├──────────────────────────────────────────────────────────────┤
│ Phase: searching → context_ready → extracting →              │
│        validating → complete                                 │
│                                                              │
│ Weergave: Registration Group Card met 2 units                │
│ - "Peren (behalve Conference)" met Merpan                    │
│ - "Conference (niet bespoten)"                               │
│                                                              │
│ Acties: [Opslaan als Concept] [Bevestigen]                   │
└──────────────────────────────────────────────────────────────┘
```

---

## 13. Bestandsoverzicht

### Core AI/Processing

| Bestand | Functie |
|---------|---------|
| `/src/ai/genkit.ts` | Genkit configuratie en setup |
| `/src/ai/flows/intent-router.ts` | Intent classificatie logica |
| `/src/ai/flows/parse-spray-application.ts` | Spray parsing V2 |
| `/src/ai/flows/agribot-agent.ts` | Agent met tool calling |
| `/src/ai/schemas/intents.ts` | Intent types en signaalwoorden |
| `/src/ai/tools/agribot-tools.ts` | Tool definities voor agent |
| `/src/ai/prompts/agribot-v2.ts` | Agent prompts |

### Services

| Bestand | Functie |
|---------|---------|
| `/src/app/api/analyze-input/route.ts` | Centrale analyse pipeline |
| `/src/lib/rag-service.ts` | Semantisch zoeken |
| `/src/lib/embedding-service.ts` | Vector embeddings |
| `/src/lib/validation-service.ts` | CTGB validatie |
| `/src/lib/correction-service.ts` | Correctie detectie |
| `/src/lib/product-aliases.ts` | Product alias resolutie |
| `/src/lib/parcel-resolver.ts` | Perceel groep resolutie |

### Frontend Components

| Bestand | Functie |
|---------|---------|
| `/src/app/(app)/command-center/smart-input/page.tsx` | Hoofdpagina |
| `/src/components/smart-invoer-feed.tsx` | Chat feed |
| `/src/components/smart-result-card.tsx` | Resultaat weergave |
| `/src/components/command-bar.tsx` | Input balk |
| `/src/components/mode-selector.tsx` | Mode selector |
| `/src/components/registration-group-card.tsx` | Gegroepeerde registraties |

### Tests

| Bestand | Functie |
|---------|---------|
| `/e2e/smart-input-flow.spec.ts` | E2E smart input tests |
| `/e2e/grouped-registrations.spec.ts` | Grouped registrations tests |
| `/e2e/ctgb-validation.spec.ts` | CTGB validatie tests |
| `/scripts/test-smart-input-v2.ts` | Direct V2 parsing tests |

---

## Samenvatting

De Slimme Invoer functionaliteit is een **geavanceerd NLP-systeem** dat:

1. **Natuurlijke taal** omzet naar gestructureerde data
2. **Multi-turn conversaties** ondersteunt met correctie-detectie
3. **Complexe variaties** herkent ("alle X behalve Y")
4. **Real-time feedback** geeft via streaming
5. **CTGB-wetgeving** valideert
6. **Semantisch zoekt** in product databases
7. **Tool-calling** gebruikt voor complexe queries

Het systeem is ontworpen voor **snelheid** (pre-classificatie zonder AI calls), **nauwkeurigheid** (5-niveau product resolutie), en **gebruiksgemak** (natuurlijke taal invoer met directe visuele feedback).
