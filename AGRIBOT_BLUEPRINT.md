# 🤖 AgriBot Masterplan

> **Estafette-document** — Dit bestand dient als kennisoverdracht tussen AI-sessies.
> Laatste update: 2026-01-24 (Sessie 14 — Fase 2.7 COMPLEET: V2 Grouped Registrations)

---

## 📍 Current Focus

### ✅ Fase 2.7: V2 Grouped Registrations — COMPLEET

**Doel:** Ondersteuning voor complexe invoer met variaties zoals:
- "Alle appels met Merpan, maar de Kanzi ook met Score"
- "Alle peren met Captan, behalve de Conference"
- "Fruit met Score, Lucas halve dosering"

**Status:** GEÏMPLEMENTEERD

| Sub-taak | Status | Beschrijving |
|----------|--------|--------------|
| 2.7.1 Data Model | ✅ COMPLEET | Types voor grouped registrations |
| 2.7.2 AI V2 Parsing | ✅ COMPLEET | AI prompt met variatie-support |
| 2.7.3 Variation Detection | ✅ COMPLEET | Detectie van "maar", "behalve", etc. |
| 2.7.4 UI Component | ✅ COMPLEET | RegistrationGroupCard met accordion |
| 2.7.5 Confirmation Flow | ✅ COMPLEET | Individuele en bulk confirmatie |

---

### 2.7.1 Data Model ✅ COMPLEET

**Nieuwe types in `src/lib/types.ts`:**

```typescript
// Individuele registratie unit binnen een groep
export type SprayRegistrationUnit = {
  id: string;
  plots: string[];           // Specifieke percelen voor deze unit
  products: ProductEntry[];  // Specifieke producten/doseringen
  label?: string;            // "Alle appels (behalve Kanzi)"
  status: 'pending' | 'confirmed';
};

// Groep van gerelateerde registraties
export type SprayRegistrationGroup = {
  groupId: string;
  date: Date;
  rawInput: string;
  units: SprayRegistrationUnit[];
};
```

---

### 2.7.2 AI V2 Parsing ✅ COMPLEET

**Locatie:** `src/ai/flows/parse-spray-application.ts`

**V2 Output Schema:**
```typescript
const SprayApplicationOutputSchemaV2 = z.object({
  registrations: z.array(RegistrationUnitSchema),
  date: z.string().optional(),
});
```

**Prompt bevat specifieke instructies voor:**
- Herkenning van "maar", "behalve", "uitgezonderd", "zonder"
- Splitsing in meerdere registraties met labels
- Onderscheid tussen base/exception/addition/reduced_dosage

---

### 2.7.3 Variation Detection ✅ COMPLEET

**Locatie:** `src/app/api/analyze-input/route.ts`

**Trigger Patterns:**
```typescript
const variationPatterns = [
    { pattern: /\bbehalve\b/, label: 'behalve' },
    { pattern: /\buitgezonderd\b/, label: 'uitgezonderd' },
    { pattern: /\bniet de\b/, label: 'niet de' },
    { pattern: /\bzonder de?\b/, label: 'zonder' },
    { pattern: /\bmaar\b.*\b(ook|extra|nog)\b/, label: 'maar...ook' },
    { pattern: /\bhalve\s*dosering\b/, label: 'halve dosering' },
];
```

**Fix toegepast:** `isLikelySprayRegistration()` in `src/ai/schemas/intents.ts` uitgebreid met:
- "[gewas] met [product]" patronen
- Variatie-patronen om te voorkomen dat deze naar de agent gaan

---

### 2.7.4 UI Component ✅ COMPLEET

**Locatie:** `src/components/registration-group-card.tsx`

**Features:**
- Accordion-style met collapsible units
- Kleur-gecodeerde status per unit (Akkoord/Waarschuwing/Afgekeurd)
- Individuele [Bevestig] knop per unit
- [Bewerk] en [Verwijder] knoppen per unit
- "Bevestig Alles" bulk knop onderaan
- "Annuleer" knop om alles te resetten

---

### 2.7.5 Confirmation Flow ✅ COMPLEET

**Server Actions (`src/app/actions.ts`):**

```typescript
// Individuele unit bevestigen
export async function confirmSingleUnit(
    unit: SprayRegistrationUnit,
    date: Date,
    rawInput: string
): Promise<{ success: boolean; spuitschriftId?: string }>

// Alle units tegelijk bevestigen
export async function confirmAllUnits(
    group: SprayRegistrationGroup
): Promise<{ success: boolean; results: Array<...> }>
```

**Database:** Elke unit wordt als losse `spuitschrift` entry opgeslagen (geen aparte groups tabel).

**Stream Message Type:**
```typescript
{ type: 'grouped_complete'; group: SprayRegistrationGroup; reply: string }
```

---

### Testing

**Test Suite:** `scripts/test-smart-input-v2.ts`

```bash
npx tsx scripts/test-smart-input-v2.ts
```

**E2E Tests:** `e2e/grouped-registrations.spec.ts`

```bash
npm run test:e2e -- grouped-registrations.spec.ts
```

---

### ✅ Fase 2.6: Robustness & Conversation Flow — COMPLEET

**Doel:** AgriBot binnen 1 maand volledig operationeel en fool-proof.

**Status:** ALLE SUB-TAKEN VOLTOOID

| Sub-taak | Status | Beschrijving |
|----------|--------|--------------|
| 2.6.1 Defensive Validation | ✅ COMPLEET | API mag NOOIT crashen (500 error) |
| 2.6.2 Context Awareness | ✅ COMPLEET | Bot onthoudt `chat_history`, begrijpt referenties |
| 2.6.3 Slot Filling | ✅ COMPLEET | Vraag om missende info i.p.v. gokken/crashen |
| 2.6.4 Confirmation Loop | ✅ COMPLEET | Samenvatting tonen vóór database opslag |

---

### 2.6.1 Defensive Validation ✅ COMPLEET

**Probleem:** API crashte met 500 errors door undefined values.

**Alle fixes toegepast:**

**Validator & Parcel Fixes:**
- ✅ `validation-service.ts`: `ValidationContext` uitgebreid met `crop` veld
- ✅ `validation-service.ts`: Alle check functies gebruiken `ctx.crop` i.p.v. `ctx.parcel.crop`
- ✅ `parcel-resolver.ts`: `getParcelCrop()` en `getParcelVariety()` helpers toegevoegd
- ✅ `parcel-resolver.ts`: `resolveParcelGroup()` checkt nu sub-parcels
- ✅ `/api/validate/route.ts`: Geoptimaliseerde product fetching

**API Error Handling:**
- ✅ `src/lib/api-utils.ts`: Nieuwe utility met `apiError()`, `apiSuccess()`, `handleUnknownError()`
- ✅ `/api/validate/route.ts`: Zod schema validation, graceful fallback responses
- ✅ `/api/analyze-input/route.ts`: Zod validation, defensive database fetches, categorized errors
- ✅ `/api/generate-embeddings/route.ts`: Consistent error responses
- ✅ `/api/ctgb/search/route.ts`: Already had good error handling

**Resultaat:** API routes crashen niet meer met 500 errors. Alle errors worden netjes afgevangen en teruggegeven aan de frontend.

---

### 2.6.2 Context Awareness ✅ COMPLEET

**Probleem:** Bot "vergeet" vorige berichten in de conversatie.

**Implementatie:**

**Frontend (`src/app/(app)/page.tsx`):**
- ✅ `chatHistory` state toegevoegd voor conversatie tracking
- ✅ Elk user message wordt opgeslagen met timestamp
- ✅ Assistant responses worden ook opgeslagen
- ✅ Laatste 10 berichten worden meegestuurd naar API

**API (`/api/analyze-input/route.ts`):**
- ✅ `chatHistory` veld toegevoegd aan input schema
- ✅ `buildChatContext()` functie bouwt context voor AI prompt
- ✅ Chat history wordt opgenomen in system prompt

**Resultaat:** Bot begrijpt nu referenties zoals "dat perceel" of "die dosering" uit eerdere berichten.

---

### 2.6.3 Slot Filling ✅ COMPLEET

**Probleem:** "Spuit Captan" crashte of gokte omdat perceel ontbreekt.

**Implementatie:**

**Frontend (`src/app/(app)/page.tsx`):**
- ✅ `SlotRequest` interface voor slot filling requests
- ✅ `currentSlotRequest` state voor pending questions
- ✅ Handler voor `slot_request` stream messages
- ✅ Suggestions worden dynamisch aangepast op basis van slot request

**API (`/api/analyze-input/route.ts`):**
- ✅ `checkMissingSlots()` functie detecteert ontbrekende info
- ✅ Checked voor: plots, products, dosage
- ✅ `slot_request` stream message met vraag en suggesties
- ✅ Slot request bevat huidige draft voor context

**Flow:**
```
User: "Spuit Captan"
Bot:  "Op welk perceel wil je dit toepassen?"
      [Alle appels] [Perceel Noord] [Perceel Zuid] [...]

User: "Alle appels"
Bot:  "Welke dosering voor Captan?"
      [1 kg/ha] [1.5 kg/ha] [2 kg/ha] [2.5 L/ha]
```

**Resultaat:** Bot vraagt nu om missende info in plaats van te crashen of te gokken.

---

### 2.6.4 Confirmation Loop ✅ COMPLEET

**Probleem:** Registraties werden direct opgeslagen zonder bevestiging.

**Implementatie:**

**State & Types (`src/app/(app)/page.tsx`):**
- ✅ `DraftStatus` type: `'idle' | 'editing' | 'confirming' | 'saving' | 'saved'`
- ✅ `ConfirmationData` interface met alle te bevestigen data
- ✅ `draftStatus` en `confirmationData` state
- ✅ `handleConfirmSave`, `handleCancelConfirmation`, `handleEditConfirmation` handlers

**Confirmation Card Component (`src/components/confirmation-card.tsx`):**
- ✅ Toont samenvatting: datum, percelen, middelen, doseringen, totalen
- ✅ Validation status badge (Akkoord/Waarschuwing/Afgekeurd)
- ✅ Validation flags met kleuren (error/warning/info)
- ✅ Drie knoppen: [Bevestigen] [Aanpassen] [Annuleren]
- ✅ Loading state tijdens opslaan

**Flow:**
```
User: "2L Captan op alle appels"
      ↓
[AI parseert input]
      ↓
[Validation check]
      ↓
┌────────────────────────────────────────────────────────┐
│  ✓ Bevestig Registratie                    [Akkoord]  │
│                                                         │
│  Datum:     maandag 20 januari 2026                    │
│  Percelen:  [Elstar Noord] [Elstar Zuid] [+3 meer]     │
│             Totaal: 4.3 ha                             │
│                                                         │
│  Middelen:                                             │
│  ┌─────────────────────────────────────────────┐       │
│  │ Captan 80 WG              [2 L/ha]          │       │
│  │ Totaal: 8.6 L                               │       │
│  └─────────────────────────────────────────────┘       │
│                                                         │
│  [✓ Bevestigen]  [✎ Aanpassen]  [✗]                   │
└────────────────────────────────────────────────────────┘
```

**Resultaat:** Registraties worden pas opgeslagen na expliciete bevestiging door de gebruiker.

---

### Fase 2 Samenvatting ✅ VOLLEDIG COMPLEET

| Sub-fase | Status | Beschrijving |
|----------|--------|--------------|
| 2.1 Genkit Tools | ✅ | `searchProducts`, `getProductDetails`, `getSprayHistory`, `getParcelInfo` |
| 2.2 RAG Embeddings | ✅ | Granular embeddings in `product_usages`, `match_product_usages()` RPC |
| 2.3 Tool Orchestration | ✅ | `agribotAgent` flow met tool calling |
| 2.4 Frontend Feedback | ✅ | Real-time tool status in UI |
| 2.5 API Integratie | ✅ | Semantic search in `/api/analyze-input` |
| **2.6 Robustness** | ✅ | Defensive validation, context awareness, slot filling, confirmation loop |

### Volgende: Fase 3 — Community & Data

**Fase 2.6 is volledig compleet! Klaar voor Fase 3:**
- [ ] 3.1 Conversatie UX (Smart Input, Learning from Feedback)
- [ ] 3.2 Field Signals (social feed voor landbouw)

---

## 🗣️ Fase 3.1: Conversatie UX

**Doel:** Bot die niet alleen passief onthoudt, maar actief leert van correcties en helpt bij invoer.

| Sub-taak | Status | Beschrijving |
|----------|--------|--------------|
| 3.1.1 Multi-turn Corrections | ✅ DONE | "Nee, niet die" → verwijder laatste item |
| 3.1.2 Undo Support | ✅ DONE | "Ongedaan maken" → herstel vorige staat |
| 3.1.3 Context References | ✅ DONE (2.6.2) | "dat perceel", "die dosering" → begrijpt referenties |
| **3.1.4 Guided Slot Filling** | ✅ DONE | Smart input met knoppen voor ontbrekende velden |
| **3.1.5 Learning from Feedback** | ✅ DONE | Sla correcties op als user preferences |

---

### 3.1.4 Guided Slot Filling (Smart Input)

**Probleem:** Huidige slot filling vraagt wel naar missende info, maar is nog niet smart genoeg.

**Gewenste UX:**
```
User: "Spuit Captan"

Bot:  "Op welk perceel wil je Captan spuiten?"
      ┌────────────────────────────────────┐
      │ 🍎 Appels    │ 🍐 Peren    │ Meer │
      └────────────────────────────────────┘

User: [klikt Appels]

Bot:  "Welke dosering? Standaard voor Captan op appel: 2 kg/ha"
      ┌─────────────────────────────────────────────┐
      │ 2 kg/ha (standaard) │ 1.5 kg/ha │ Anders... │
      └─────────────────────────────────────────────┘

User: [klikt 2 kg/ha]

Bot:  [Toont Confirmation Card]
```

**Implementatie:**

1. **Smart Suggestions per Slot:**
   ```typescript
   interface SlotSuggestion {
     slot: 'plots' | 'products' | 'dosage' | 'date';
     suggestions: Array<{
       label: string;
       value: string;
       isDefault?: boolean;      // Markeer aanbevolen keuze
       source?: 'ctgb' | 'user_preference' | 'history';
     }>;
   }
   ```

2. **Context-Aware Defaults:**
   - Perceel suggesties: Gebaseerd op gewas in product context (Captan → appels/peren)
   - Dosering suggesties: Uit CTGB voorschriften + user preferences
   - Datum: Vandaag als default

3. **Quick Action Buttons:**
   - Render suggesties als klikbare buttons in de chat
   - Button click = automatisch handleSend() met die waarde

**Te wijzigen bestanden:**
- `src/app/api/analyze-input/route.ts` → Smarter `checkMissingSlots()`
- `src/app/(app)/page.tsx` → Render suggestion buttons
- `src/components/slot-suggestion-buttons.tsx` → Nieuwe component

---

### 3.1.5 Learning from Feedback (Adaptive)

**Probleem:** Bot leert niet van correcties. Elke sessie begint from scratch.

**Gewenste UX:**
```
User: "2 kg Captan op de elstar"
Bot:  [Maakt draft met 2 kg/ha]

User: "Nee, gebruik altijd 1.2 kg hier"
Bot:  "Begrepen! Ik heb aangepast naar 1.2 kg/ha.
       Wil je dat ik dit onthou voor Captan op Elstar?"
      ┌──────────────────────────────┐
      │ ✓ Ja, onthoud │ Nee, eenmalig │
      └──────────────────────────────┘

User: [klikt "Ja, onthoud"]
Bot:  "Opgeslagen! Volgende keer stel ik 1.2 kg/ha voor bij Captan op Elstar."
```

**Implementatie:**

1. **User Preferences Schema (Supabase):**
   ```sql
   CREATE TABLE user_preferences (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID REFERENCES users(id),
     preference_type TEXT NOT NULL,  -- 'default_dosage', 'preferred_product', 'alias'
     context JSONB NOT NULL,         -- { product: 'Captan', crop: 'appel', variety: 'elstar' }
     value JSONB NOT NULL,           -- { dosage: 1.2, unit: 'kg' }
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW(),
     usage_count INT DEFAULT 1       -- Track hoe vaak dit gebruikt wordt
   );
   ```

2. **Correction Detection:**
   ```typescript
   interface CorrectionPattern {
     triggers: string[];           // "nee", "niet", "altijd", "gebruik liever"
     extractValue: (input: string) => { field: string; value: any } | null;
   }

   // Voorbeelden:
   // "Nee, 1.2 kg" → { field: 'dosage', value: { amount: 1.2, unit: 'kg' } }
   // "Gebruik altijd Delan hier" → { field: 'product', value: 'Delan' }
   ```

3. **Preference Application Flow:**
   ```
   User input → Extract slots → Check user_preferences for matches
                                      ↓
                              Found preference?
                              ├── Yes → Apply as default, mark as "(jouw voorkeur)"
                              └── No → Use CTGB default
   ```

4. **Learning Prompt:**
   - Na een correctie: Vraag of dit opgeslagen moet worden
   - Track `usage_count` om populaire preferences te identificeren
   - Na X keer dezelfde correctie: Suggereer automatisch opslaan

**Te wijzigen bestanden:**
- `supabase/migrations/xxx_user_preferences.sql` → Schema
- `src/lib/supabase-store.ts` → CRUD voor preferences
- `src/lib/preference-service.ts` → Nieuwe service
- `src/app/api/analyze-input/route.ts` → Integratie met slot filling

---

### 3.1 Architectuur Overzicht

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          CONVERSATIE FLOW                                │
│                                                                          │
│  User Input ─► Intent Detection ─► Slot Extraction ─► Slot Filling      │
│       │              │                    │                 │            │
│       │              │                    ▼                 ▼            │
│       │              │         ┌──────────────────┐  ┌──────────────┐   │
│       │              │         │ checkMissingSlots │  │ Apply User   │   │
│       │              │         │ (enhanced)        │  │ Preferences  │   │
│       │              │         └────────┬─────────┘  └──────┬───────┘   │
│       │              │                  │                    │           │
│       │              │                  ▼                    │           │
│       │              │         ┌──────────────────┐         │           │
│       │              │         │ Generate Smart   │◄────────┘           │
│       │              │         │ Suggestions      │                      │
│       │              │         └────────┬─────────┘                      │
│       │              │                  │                                │
│       ▼              ▼                  ▼                                │
│  ┌─────────────────────────────────────────────────────────────┐        │
│  │                      CHAT INTERFACE                          │        │
│  │  ┌─────────────────────────────────────────────────────┐    │        │
│  │  │ Bot: "Op welk perceel?"                              │    │        │
│  │  │     [🍎 Appels] [🍐 Peren] [Handmatig]              │    │        │
│  │  └─────────────────────────────────────────────────────┘    │        │
│  └─────────────────────────────────────────────────────────────┘        │
│                              │                                           │
│                              ▼                                           │
│  ┌─────────────────────────────────────────────────────────────┐        │
│  │                   LEARNING LAYER                             │        │
│  │  Correctie gedetecteerd? ─► "Wil je dit onthouden?"         │        │
│  │                     │                                        │        │
│  │                     ▼                                        │        │
│  │            user_preferences (Supabase)                       │        │
│  └─────────────────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### Fase 2.2 Samenvatting: Granular RAG

**Architectuur:**
```
product_usages tabel
├── id, product_id (FK)
├── product_naam, toelatingsnummer
├── gewas, doelorganisme, dosering, veiligheidstermijn
├── content, embedding vector(768)

Query Flow:
User → generateEmbedding() → match_product_usages() → Top-10 voorschriften → AI antwoord
```

**Geïntegreerd in:**
- `src/lib/rag-service.ts` — `searchProductUsages()`, `getRelevantProductUsages()`, `buildProductUsageContext()`
- `src/app/api/analyze-input/route.ts` — `handleQueryProduct()`, `handleQueryRegulation()`

**Voorbeeldqueries die nu werken:**
- "Middel tegen schurft in peer" → Vindt specifieke voorschriften
- "Wat is de VGT van Captan op appel?" → Vindt exacte regelgeving
- "Dosering Delan voor peer" → Vindt juiste dosering per gewas

---

## 🧠 Context & Architecture

### AgriBot Architecture (na Fase 1.3)

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                  │
│  src/components/command-bar.tsx                                  │
│  └── POST /api/analyze-input                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    /api/analyze-input/route.ts                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ 0. classifyIntent() ─► Intent Recognition (pre-filter + AI) │ │
│  │    ├── stream: { type: 'intent', intent, confidence }       │ │
│  │    │                                                         │ │
│  │ 1. BRANCH on intent:                                         │ │
│  │    ├── CONFIRM/CANCEL ─► Direct response                    │ │
│  │    ├── CLARIFY/NAVIGATE ─► Help response (stub)             │ │
│  │    ├── QUERY_* ─► Query handlers (stub)                     │ │
│  │    └── REGISTER_SPRAY/MODIFY_DRAFT ─► Spray flow ↓          │ │
│  │                                                              │ │
│  │ 2. extractSearchTerms() ─► Keyword extraction (no AI)       │ │
│  │ 3. resolveProductAlias() ─► Map korte namen                 │ │
│  │ 4. detectParcelGroups() ─► "alle peren" → sub_parcel IDs    │ │
│  │ 5. getRelevantProducts() ─► RAG: Top-5 CTGB producten       │ │
│  │ 6. ai.generateStream() ─► Spray extraction (Gemini)         │ │
│  │ 7. mergeDrafts() ─► Combine met previousDraft               │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SUPABASE (Database)                          │
│  - ctgb_products (gewasbeschermingsmiddelen)                     │
│  - product_usages (embeddings per voorschrift)                   │
│  - field_signals (adviseur posts + embeddings) ← PLANNED         │
│  - signal_actions (verified teler acties) ← PLANNED              │
│  - parcels (hoofdlocaties: "Jachthoek", "Boomgaard Noord")       │
│  - sub_parcels (blokken: crop_type + variety, bijv. Peer/Conf.)  │
│  - logbook_entries (spuitregistraties → sub_parcel_ids)          │
│  - user_preferences (aliassen, correcties)                       │
└─────────────────────────────────────────────────────────────────┘
```

### Genkit Configuratie

```typescript
// src/ai/genkit.ts
export const ai = genkit({
  plugins: [googleAI()],
  model: 'googleai/gemini-2.5-flash-lite',
});
```

### Wat werkt al goed

| Feature | Locatie | Status |
|---------|---------|--------|
| RAG voor producten | `src/lib/rag-service.ts` | ✅ Semantic search via `match_product_usages()` |
| Multi-turn drafts | `/api/analyze-input` | ✅ Werkt (add/remove/update) |
| Parcel groep detectie | `src/lib/parcel-resolver.ts` | ✅ Werkt (queries `sub_parcels`) |
| Product alias mapping | `src/lib/product-aliases.ts` | ✅ Werkt |
| Streaming responses | `/api/analyze-input` | ✅ Werkt |
| Zod schema validatie | Genkit flows | ✅ Werkt |

### Wat ontbreekt voor AgriBot

| Feature | Prioriteit | Complexiteit |
|---------|------------|--------------|
| Intent Recognition | 🔴 HOOG | Laag |
| Multi-intent routing | 🔴 HOOG | Medium |
| Tool calling (Genkit) | 🟡 MEDIUM | Medium |
| Vraag-antwoord over data | 🟡 MEDIUM | Medium |
| CTGB kennis RAG | 🟡 MEDIUM | Hoog |
| Conversational memory | 🟢 LAAG | Medium |
| Personality/tone | 🟢 LAAG | Laag |

---

## 🛣️ Roadmap

### [x] Fase 1: Begrip (Intent Recognition) ✅ COMPLEET

**Doel:** De bot begrijpt WAT de gebruiker wil.

- [x] **1.1** Definieer `IntentType` enum: ✅ `src/ai/schemas/intents.ts`
  - 9 intent types gedefinieerd
  - Zod schemas voor input/output
  - Pre-classificatie functie met signaalwoorden
  - Confidence scoring

- [x] **1.2** Maak `IntentRouter` Genkit flow: ✅ `src/ai/flows/intent-router.ts`
  - Twee-staps classificatie (pre-filter + AI fallback)
  - Compact prompt (<100 tokens)
  - Fallback logica voor edge cases
  - Helper functies (isQueryIntent, isActionIntent)

- [x] **1.3** Refactor `/api/analyze-input` om router te gebruiken: ✅
  - Intent classificatie als PHASE 0 (voor alle andere processing)
  - Nieuw StreamMessage type: `intent` (streamed naar frontend)
  - Branch logica per intent type geïmplementeerd
  - Stub handlers voor CONFIRM, CANCEL, CLARIFY, NAVIGATE, QUERY_*
  - REGISTER_SPRAY en MODIFY_DRAFT → bestaande flow behouden

- [x] **1.4** Parameter extraction per intent-type: ✅
  - `QueryProductParams` — productName, crop, targetOrganism, category
  - `QueryHistoryParams` — period, productName, parcelName
  - `QueryRegulationParams` — productName, regulationType, crop
  - `NavigateParams` — target, name, id
  - `classifyIntentWithParams()` flow extraheert intent + params in één call
  - Query handlers verbonden met Supabase (searchCtgbProducts, getLogbookEntries, etc.)

### [x] Fase 2: Connectie (Tools & RAG) ✅ COMPLEET

**Doel:** De bot kan data ophalen en acties uitvoeren.

- [x] **2.1** Definieer Genkit Tools: ✅ `src/ai/tools/agribot-tools.ts`
  - `searchProducts(query)` — Zoek CTGB producten
  - `getProductDetails(productName)` — Volledige productinfo
  - `getSprayHistory(filters)` — Spuithistorie met filtering
  - `getParcelInfo(parcelName)` — Perceel informatie
  - **BELANGRIJK:** `detectParcelGroups()` queries `sub_parcels` tabel (niet `parcels`)
    - Fruitteelt data-hiërarchie: `parcels` = locatie, `sub_parcels` = blokken met `crop_type` + `variety`
    - Input: "alle Conference" → Output: `sub_parcel_ids[]` waar `variety = 'Conference'`
    - Supabase query: `sub_parcels.select('id').eq('crop_type', X).eq('variety', Y)`

- [x] **2.2** RAG voor CTGB kennisbank: ✅ `src/lib/embedding-service.ts` + `sql/create_ctgb_embeddings.sql`
  - ✅ pgvector SQL schema met HNSW index
  - ✅ Embedding service (Google AI text-embedding-004, 768 dim)
  - ✅ `searchRegulations` tool voor de agent
  - ✅ Embedding generatie script (`scripts/generate-embeddings-curl.sh`)
  - ✅ 21 embeddings gegenereerd (test set)
  - ✅ `match_regulations()` Supabase RPC functie getest en werkend

- [x] **2.3** Tool orchestration: ✅ `src/ai/flows/agribot-agent.ts`
  - `agribotAgent` flow met tool calling
  - `agribotAgentStream` voor real-time feedback
  - `isComplexQuery()` detectie voor agent routing
  - Streaming events: thinking, tool_call, tool_result, answer

- [x] **2.4** Frontend Agent Feedback: ✅ `src/app/(app)/page.tsx` + `src/components/smart-invoer-feed.tsx`
  - `StreamMessage` types uitgebreid met `agent_thinking`, `agent_tool_call`, `agent_tool_result`, `agent_answer`
  - `AgentState` interface voor tracking van tool history
  - `ProcessingPhase` uitgebreid met `agent_thinking` en `agent_tool_call`
  - Real-time visuele feedback:
    - 🧠 "Aan het nadenken..." (agent_thinking)
    - 🔍 Tool-specifieke labels: "Producten zoeken", "Spuithistorie ophalen", etc.
    - ✅ Groene checkmarks voor voltooide tools
  - Tool history badges met status animaties

### [ ] Fase 3: Community & Data

**Doel:** De bot voelt natuurlijk, leert van de community, en genereert waardevolle data.

#### 3.1 Conversatie UX

- [ ] **3.1.1** Conversation memory:
  - Context window management
  - Summarization voor lange sessies

- [ ] **3.1.2** Confirmation flows:
  - "Bedoel je perceel X of Y?"
  - "Wil je dit opslaan?"

- [ ] **3.1.3** Personality:
  - Tone: Professioneel maar toegankelijk
  - Domeinkennis tonen zonder arrogant te zijn
  - Nederlandse landbouwtaal

#### 3.2 Field Signals 📡 (NEW)

**Concept:** Een "Social Feed" voor de landbouw. Adviseurs posten actueel advies, telers zetten dit met één klik om in een taak.

**User Flow:**
```
┌──────────────────────────────────────────────────────────────┐
│  ADVISEUR                                                     │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 🌿 "Hoge schurftdruk verwacht deze week.               │  │
│  │     Nu preventief spuiten met Captan of Delan."        │  │
│  │                                                         │  │
│  │     🍐 Peer  🍎 Appel  📅 15 jan 2026                  │  │
│  └────────────────────────────────────────────────────────┘  │
│                              │                                │
│                              ▼                                │
│  TELER                                                        │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  [📋 Maak Taak]  [✅ Direct Registreren]  [💬 Reageer] │  │
│  └────────────────────────────────────────────────────────┘  │
│                              │                                │
│                              ▼                                │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  → Spuitregistratie aangemaakt                         │  │
│  │  → "Verified Action" = Training data voor AI           │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**Architectuur Impact:**

| Component | Beschrijving |
|-----------|--------------|
| **Data Flow** | Advies → Teler Klik → Spuitregistratie = "Verified Action" |
| **Training Data** | Elke klik genereert hoogwaardige labeled data |
| **Vector Search** | Field Signals krijgen embedding voor RAG |
| **Navigatie** | Research Hub → "Live Feed" |

**Database:**
```
field_signals tabel
├── id
├── advisor_id (FK → users)
├── content (advies tekst)
├── crops[] (relevante gewassen)
├── threat (schurft, luis, etc.)
├── recommended_products[]
├── urgency (low/medium/high)
├── embedding vector(768)  ← voor RAG
├── created_at
└── expires_at

signal_actions tabel (Verified Actions)
├── id
├── signal_id (FK → field_signals)
├── user_id (FK → users)
├── action_type (task/registration/dismiss)
├── logbook_entry_id (FK, nullable)
└── created_at
```

**AgriBot Integratie:**
- Query: "Wat adviseren experts deze week over schurft?"
- Tool: `searchFieldSignals(query)` → semantic search over signals
- Output: Recente relevante adviezen met context

**Voordelen:**
1. **Telers:** Actueel advies van experts, één-klik actie
2. **Adviseurs:** Direct bereik naar klanten
3. **AI:** Verified Actions = hoogwaardige training data
4. **Platform:** Netwerk-effecten, community building

---

## 📝 Dev Log

### Sessie 13 — 2026-01-20

**Start Fase 2.6: Robustness & Conversation Flow**

Nieuwe kritieke fase toegevoegd met als doel: AgriBot binnen 1 maand volledig operationeel en fool-proof.

**Bugs gefixed:**

1. **TypeError Crash in Validator** (`validation-service.ts`):
   - Probleem: `ctx.parcel.crop.toLowerCase()` crashte omdat crop in sub-parcels zit, niet op parcel level
   - Fix: `ValidationContext` uitgebreid met `crop: string` veld
   - Alle check functies (`checkCropAllowed`, `checkDosage`, etc.) gebruiken nu `ctx.crop`
   - Toegevoegd: `getParcelCrop()` helper die ook sub-parcels checkt

2. **Verkeerde Perceel Selectie** (`parcel-resolver.ts`):
   - Probleem: "alle appels" selecteerde ook peren omdat `p.crop` leeg was
   - Fix: `getParcelCrop()` en `getParcelVariety()` helpers toegevoegd
   - `resolveParcelGroup()` en `buildParcelContextWithGroups()` checken nu sub-parcels
   - Debug logging toegevoegd voor troubleshooting

3. **Trage Validatie** (`/api/validate/route.ts`):
   - Probleem: `getAllCtgbProducts()` haalde 1000+ producten op (~9 sec)
   - Fix: Nieuwe `getCtgbProductsByNames()` functie haalt alleen benodigde producten op
   - Resultaat: Validatie is nu <1 seconde

**Fase 2.6 Roadmap gedefinieerd:**

| Sub-taak | Status | Beschrijving |
|----------|--------|--------------|
| 2.6.1 Defensive Validation | 🔄 IN PROGRESS | API mag NOOIT crashen |
| 2.6.2 Context Awareness | ⏳ TODO | Chat history memory |
| 2.6.3 Slot Filling | ⏳ TODO | Vraag om missende info |
| 2.6.4 Confirmation Loop | ⏳ TODO | Bevestiging vóór opslag |

**Volgende stappen:**
1. Alle API routes voorzien van try/catch met graceful errors
2. Zod input validation op alle endpoints
3. Null checks in alle tools en services

---

### Sessie 12 — 2026-01-20

**Fase 2 Volledig Afgerond: RAG + API Integratie**

Drie belangrijke ontwikkelingen in deze sessie:

**1. RAG Service Geüpdatet (Fase 2.2 ✅ COMPLEET)**

De `src/lib/rag-service.ts` is aangepast om de nieuwe granular embeddings te gebruiken:

```typescript
// Nieuwe functies toegevoegd:
searchProductUsages(query, options)      // Semantic search
getRelevantProductUsages(userInput)      // Convenience wrapper
buildProductUsageContext(matches)        // Context builder
```

De semantic search via `match_product_usages()` RPC is nu geïntegreerd. Oude keyword-based functies zijn behouden voor backward compatibility.

**2. Field Signals Concept — Social Feed voor Landbouw**

Een nieuwe module is toegevoegd aan de roadmap: Field Signals.

**Kernidee:**
Adviseurs posten actueel advies ("Hoge schurftdruk, nu spuiten"), telers zetten dit met één klik om in een spuitregistratie. Deze "Verified Actions" genereren hoogwaardige training data voor de AI.

**Toegevoegd aan Fase 3:**
- `field_signals` tabel met embeddings voor RAG
- `signal_actions` tabel voor tracking van teler-acties
- AgriBot tool: `searchFieldSignals(query)`
- Navigatie: Research Hub → "Live Feed"

**Data Flywheel:**
```
Expert Advies → Teler Actie → Verified Data → Betere AI → Meer Vertrouwen → Meer Acties
```

**Volgende stappen voor Field Signals:**
1. Database schema ontwerpen
2. Advisor posting interface
3. Teler feed component
4. RAG integratie

**3. API Integratie (Fase 2.5 ✅ COMPLEET)**

Semantic search geïntegreerd in `/api/analyze-input/route.ts`:

```typescript
// handleQueryProduct() - nu met semantic search
const usageMatches = await searchProductUsages(searchQuery, { threshold: 0.35, limit: 10 });

// handleQueryRegulation() - nu met semantic search
const usageMatches = await searchProductUsages(searchQuery, { threshold: 0.3, limit: 8 });
```

**Verbeteringen:**
- Product queries tonen nu gewas-specifieke voorschriften
- Regelgeving queries tonen VGT, dosering, interval per gewas
- Fallback naar keyword search als semantic search geen resultaten geeft
- Rijkere response data voor frontend

---

### Sessie 11 — 2026-01-19

**Architectuur Wijziging: Granular Embeddings (Chunking)**

De embedding strategie is fundamenteel gewijzigd voor betere zoekresultaten.

**Probleem met vorige aanpak:**
- 1 embedding per product was te grof
- Een product als "Captan" heeft 50+ voorschriften voor verschillende gewassen/plagen
- Query "middel tegen schurft in peer" matchte het hele product, niet het specifieke voorschrift

**Nieuwe aanpak: Chunking per Gebruiksvoorschrift**

| Aspect | Oud | Nieuw |
|--------|-----|-------|
| Tabel | `ctgb_products.embedding` | `product_usages` |
| Granulariteit | 1 per product | 1 per gewas/plaag combo |
| Search | `search_products_by_embedding()` | `match_product_usages()` |
| Nauwkeurigheid | Laag (vindt product) | Hoog (vindt voorschrift) |

**Implementatie:**

1. **Nieuwe tabel `product_usages`:**
   - `product_id` — FK naar `ctgb_products`
   - `gewas`, `doelorganisme`, `dosering`, `veiligheidstermijn`, etc.
   - `content` — tekst voor embedding
   - `embedding` — vector(768)

2. **Generatie script:**
   - `scripts/generate-embeddings.ts`
   - Gebruikt `@google/generative-ai` SDK (niet Genkit)
   - Developer draait lokaal vanwege Node.js v24 issues

3. **RPC functie:**
   - `match_product_usages(query_embedding, threshold, limit)`
   - Retourneert voorschriften met similarity score

**Volgende stap:**
- RAGService aanpassen om `match_product_usages()` te gebruiken
- Wacht op data population door developer

---

### Sessie 10 — 2026-01-19

**Nieuwe Aanpak: Simplified RAG met Direct Product Embeddings**

Vanwege persistente Node.js v24 ECONNRESET issues met Supabase is de strategie gewijzigd naar een gebruiker-gedreven embedding generatie.

**Belangrijke wijzigingen:**

1. **Embedding kolom op ctgb_products** (niet aparte tabel):
   - Vereenvoudigt architectuur
   - Geen joins nodig bij zoeken
   - Direct product lookup

2. **Standalone script met @google/generative-ai**:
   - Geen Genkit dependency voor embeddings
   - Directe Google AI SDK (stabieler)
   - Robuuste error handling en rate limiting

3. **Service Role Key vereist**:
   - Anon key kan niet schrijven naar ctgb_products
   - Gebruiker moet service role key toevoegen

**Nieuwe bestanden:**

1. `sql/add_embedding_column.sql` — Database migratie:
   - pgvector extension
   - embedding kolom (768 dim)
   - HNSW index voor snelle search
   - `search_products_by_embedding()` functie

2. `scripts/generate-product-embeddings.ts` — Generatie script:
   - Gebruikt @google/generative-ai SDK
   - Batch processing met rate limiting
   - Progress logging
   - --limit en --batch flags

**Volgende stappen (voor gebruiker):**
1. `npm install @google/generative-ai`
2. Service role key toevoegen aan .env.local
3. SQL migratie uitvoeren
4. Script draaien

---

### Sessie 9 — 2026-01-18

**Gevalideerd: Fase 2.2 — RAG Volledig Werkend**

De RAG implementatie voor CTGB kennisbank is nu volledig getest en werkend. Semantic search over gebruiksvoorschriften werkt correct.

**Bugfixes:**

1. **Genkit embed() API fix** (`src/lib/embedding-service.ts`, `scripts/generate-embeddings.ts`):
   - Genkit retourneert `[{ embedding: number[] }]` i.p.v. `number[]`
   - Fix: `result[0].embedding` in plaats van direct `result`

2. **Node.js v24 ECONNRESET workaround**:
   - Probleem: Node.js v24 heeft intermittente ECONNRESET errors met Supabase/Cloudflare
   - Workaround: `scripts/generate-embeddings-curl.sh` gebruikt curl voor Supabase calls
   - Curl werkt stabiel, Node.js fetch faalt sporadisch

**Nieuwe bestanden:**

1. **scripts/generate-embeddings-curl.sh** — Shell-based generator:
   - Gebruikt curl voor betrouwbare Supabase connecties
   - Node.js alleen voor Google AI embedding generatie
   - Robuuster dan pure Node.js script voor Node v24

2. **src/app/api/generate-embeddings/route.ts** — API endpoint:
   - GET: Stats (embedding count, product count)
   - POST: Generate embeddings (met limit parameter)
   - Alternatief voor standalone script

**Validatie:**

Test query: "Wat is de veiligheidstermijn van Moddus op tarwe?"
- Resultaat: 5 relevante voorschriften gevonden
- Similarity scores: 55-56%
- Product: Moddus Evo (correct!)
- Gewassen: Wintertarwe, Wintergerst, Winterrogge (semantisch relevant)

**Database status:**
- 21 embeddings gegenereerd (Moddus Evo: 18, Molluxx: 3)
- `match_regulations()` functie werkt correct
- pgvector HNSW index actief

**Volgende stappen:**
1. Meer embeddings genereren (1000+ producten)
2. Agent integratie testen in de UI
3. Start Fase 3: Conversation UX

---

### Sessie 8 — 2026-01-18

**Geïmplementeerd: Fase 2.2 — RAG voor CTGB Kennisbank**

Semantic search over CTGB gebruiksvoorschriften is nu geïmplementeerd. De agent kan vragen beantwoorden als "Mag ik Captan gebruiken vlak voor de oogst?" door relevante voorschriften op te zoeken via vector similarity.

**Nieuwe bestanden:**

1. **sql/create_ctgb_embeddings.sql** — Database schema:
   - `ctgb_regulation_embeddings` tabel met 768-dim vectors
   - pgvector extension met HNSW index voor snelle similarity search
   - `match_regulations()` functie voor semantic search met filters
   - RLS policies voor veilige toegang

2. **src/lib/embedding-service.ts** — Embedding service:
   - `generateEmbedding()` — Google AI text-embedding-004 (768 dim)
   - `voorschriftToText()` — Convert voorschrift naar embedding-vriendelijke tekst
   - `searchRegulations()` — Semantic search met threshold en filters
   - `processProduct()` — Batch verwerk producten naar embeddings

3. **scripts/generate-embeddings.ts** — Generatie script:
   - Verwerkt alle CTGB producten met gebruiksvoorschriften
   - Batch processing met rate limiting
   - Incremental: skipt producten met bestaande embeddings
   - Flags: `--clear` (reset), `--limit N` (testing)

**Wijzigingen:**

4. **src/ai/tools/agribot-tools.ts** — Nieuwe tool:
   - `searchRegulationsTool` — Semantic search over CTGB kennisbank
   - Input: query + optionele filters (gewas, product)
   - Output: relevante voorschriften met similarity score

5. **src/ai/flows/agribot-agent.ts** — System prompt update:
   - Tool 5: `searchRegulations` toegevoegd
   - Instructie voor regelgevingsvragen
   - Voorbeelden voor VGT en "mag ik X gebruiken" vragen

**Technische keuzes:**
- text-embedding-004 (768 dim) i.p.v. text-embedding-ada-002 (1536 dim) — betere price/performance
- HNSW index i.p.v. IVFFlat — sneller voor queries, iets langzamer om te bouwen
- Aparte tabel voor embeddings i.p.v. kolom op ctgb_products — één product kan meerdere voorschriften hebben
- Similarity threshold 0.4 — balans tussen recall en precision

**Volgende stappen:**
1. Run SQL migration in Supabase
2. `npx tsx scripts/generate-embeddings.ts` om embeddings te genereren
3. Test met voorbeeldvragen

---

### Sessie 7 — 2026-01-18

**Geïmplementeerd: Fase 2.4 — Frontend Agent Feedback**

De AgriBot agent werkte al (Fase 2.1 + 2.3), maar de gebruiker zag niets van wat er gebeurde - een "black box" ervaring. Nu krijgt de gebruiker real-time feedback.

**Wijzigingen:**

1. **page.tsx** — Stream handling uitgebreid:
   - `StreamMessage` type uitgebreid met `agent_thinking`, `agent_tool_call`, `agent_tool_result`, `agent_answer`
   - `AgentState` interface toegevoegd voor tracking
   - `ProcessingPhase` uitgebreid met `agent_thinking` en `agent_tool_call`
   - Event handlers voor alle agent events

2. **smart-invoer-feed.tsx** — Visuele feedback:
   - `TOOL_LABELS` mapping: tool names → Nederlandse labels + iconen
   - Tool history badges met status animaties
   - Groene checkmarks (✅) voor voltooide tools
   - Pulserende animaties voor actieve tools

**UX Flow:**
```
User: "Wanneer heb ik Captan gebruikt op de Elstar?"
       ↓
[🧠 Aan het nadenken...] → Agent analyseert je vraag
       ↓
[🔍 Producten zoeken] → Data wordt opgehaald...
       ↓
[✅ Producten zoeken] [📜 Spuithistorie ophalen] → In progress
       ↓
[✅ Producten zoeken] [✅ Spuithistorie ophalen]
       ↓
Toast: "AgriBot antwoord: Je hebt Captan 3x gebruikt..."
```

**Technische keuzes:**
- Tool history als array met status tracking (`calling` → `done`)
- Early return voor agent queries (geen spray registration flow)
- Toast notificatie voor agent antwoorden (tijdelijk, later in feed)

**Volgende sessie:**
- Fase 2.2: RAG voor CTGB kennisbank (pgvector embeddings)
- Of: Agent antwoorden in feed i.p.v. toast

---

### Sessie 6 — 2026-01-18

**Correctie: Data-hiërarchie voor Fruitteelt**

De architectuur bevatte een fout in stap 4 (`detectParcelGroups`).

**Probleem:** De lookup ging naar `parcels`, maar biologische data (gewas/ras) zit op `sub_parcels` niveau.

**Fruitteelt Data-hiërarchie:**
```
parcels (hoofdlocatie)
  └── sub_parcels (blokken)
        ├── crop_type: "Peer", "Appel", "Kers"
        └── variety: "Conference", "Elstar", "Kordia"
```

**Correcties doorgevoerd:**
1. Architectuurdiagram: `detectParcelGroups()` output is nu `sub_parcel_ids[]`
2. Database sectie: `sub_parcels` tabel expliciet gedocumenteerd
3. Roadmap 2.1: Supabase query voorbeeld toegevoegd voor `sub_parcels` filtering
4. Feature tabel: Verduidelijkt dat parcel resolver `sub_parcels` bevraagt

**Voorbeeld:**
- Input: "Spuit alle Conference"
- Query: `sub_parcels.select('id').eq('variety', 'Conference')`
- Output: `['sp-001', 'sp-003', 'sp-007']` (sub_parcel IDs)

---

### Sessie 5 — 2026-01-18

**Geïmplementeerd: Fase 2.1 + 2.3 — Tool Calling & Agent**

1. **Genkit Tools** (`src/ai/tools/agribot-tools.ts`):
   - `searchProductsTool` — Zoek producten op naam/gewas/doelorganisme
   - `getProductDetailsTool` — Volledige productinfo met gebruiksvoorschriften
   - `getSprayHistoryTool` — Spuithistorie met filters (product, perceel, periode)
   - `getParcelInfoTool` — Perceel info met optionele history

2. **AgriBot Agent** (`src/ai/flows/agribot-agent.ts`):
   - `agribotAgent` — Genkit flow met tool calling
   - `agribotAgentStream` — Streaming versie met real-time events
   - System prompt met instructies voor tool gebruik
   - Automatische tool execution en result formatting

3. **API Integratie** (`src/app/api/analyze-input/route.ts`):
   - `handleAgentQuery()` — Streamt agent events naar frontend
   - `isComplexQuery()` — Detecteert wanneer agent nodig is
   - Nieuwe StreamMessage types: `agent_thinking`, `agent_tool_call`, `agent_tool_result`, `agent_answer`
   - Routing: simpele queries → direct handlers, complexe queries → agent

**Complexe queries die nu werken:**
- "Wanneer heb ik voor het laatst Captan gebruikt op de Elstar?"
- "Welke fungicides heb ik dit jaar het meest gebruikt?"
- "Wat is de dosering van Decis en wanneer heb ik het laatst gebruikt?"

**Technische keuzes:**
- Tools gedefinieerd met Zod schemas voor type-safety
- Streaming generator voor real-time feedback
- isComplexQuery() heuristiek om agent alleen te gebruiken waar nodig
- Agent krijgt tool results en genereert dan finaal antwoord

**Volgende sessie:**
- Optie A: RAG voor CTGB kennisbank (semantic search)
- Optie B: Frontend integratie van agent events

---

### Sessie 4 — 2026-01-18

**Geïmplementeerd: Fase 1.4 — Parameter Extraction + Query Handlers**

1. **Parameter Schemas** (`src/ai/schemas/intents.ts`):
   - `QueryProductParamsSchema` — productName, crop, targetOrganism, category
   - `QueryHistoryParamsSchema` — period, productName, parcelName, parcelId
   - `QueryRegulationParamsSchema` — productName, regulationType, crop
   - `NavigateParamsSchema` — target, name, id
   - `IntentWithParamsSchema` — unified schema met alle params

2. **Enhanced Intent Router** (`src/ai/flows/intent-router.ts`):
   - `classifyIntentWithParams()` — extraheert intent + params in één AI call
   - `intentWithParamsPrompt` — prompt met parameter extractie instructies
   - `extractQueryParams()` — utility om params per intent type te halen

3. **Query Handlers** (`src/app/api/analyze-input/route.ts`):
   - `handleQueryProduct()` — zoekt producten op doelorganisme/gewas/naam
   - `handleQueryHistory()` — haalt spuitgeschiedenis op met filtering
   - `handleQueryRegulation()` — toont regelgeving voor een product
   - Alle handlers verbonden met echte Supabase functies

**Voorbeelden die nu werken:**
- "Welke middelen tegen schurft?" → zoekt producten op doelorganisme
- "Hoeveel heb ik dit jaar gespoten?" → toont spuitgeschiedenis
- "Wat is de dosering van Captan?" → toont gebruiksvoorschriften

**Technische keuzes:**
- Intent + params in één AI call (efficiency)
- Query handlers met try/catch en fallback responses
- Streaming `answer` messages met optionele `data` payload

**Fase 1 COMPLEET!** AgriBot kan nu:
- ✅ Intent herkennen (9 types)
- ✅ Parameters extraheren per intent
- ✅ Echte data ophalen uit Supabase
- ✅ Geformatteerde antwoorden geven

**Volgende sessie:**
- Fase 2.1: Genkit Tool Calling voor complexe queries
- Of: Frontend integratie van `answer` messages

---

### Sessie 3 — 2026-01-18

**Geïmplementeerd: Fase 1.3 — API Integratie**

Refactoring van `/api/analyze-input/route.ts`:

1. **Intent Classification als eerste stap (PHASE 0)**
   - Import van `classifyIntent` en `isQueryIntent`
   - Classificatie gebeurt VOOR alle andere processing
   - Resultaat wordt direct gestreamed naar frontend

2. **Nieuwe StreamMessage types**
   - `{ type: 'intent', intent: IntentType, confidence: number }` — eerste message
   - `{ type: 'answer', message: string, intent: IntentType }` — voor niet-registratie intents

3. **Branch logica per intent type**
   ```
   CONFIRM      → "Begrepen! De registratie wordt opgeslagen."
   CANCEL       → "Oké, de huidige draft wordt geannuleerd."
   CLARIFY      → Help tekst met voorbeelden
   NAVIGATE     → Stub: "Navigatie wordt binnenkort ondersteund"
   QUERY_*      → Stub: "Ik zoek [X] voor je... (functie in ontwikkeling)"
   REGISTER_SPRAY / MODIFY_DRAFT → Bestaande spray flow
   ```

4. **Backward compatible**
   - Bestaande spray registratie flow blijft 100% intact
   - Alleen nieuwe routing laag toegevoegd

**Technische keuzes:**
- Early return voor niet-registratie intents (geen onnodige DB calls)
- `hasDraft` variabele hergebruikt (was `hasPreviousDraft`)
- Query handlers zijn stubs — worden in Fase 2 uitgebreid met tools

**Volgende sessie:**
- Optie A: Parameter extraction voor query intents (1.4)
- Optie B: Direct naar Tool Calling (2.1) — query handlers met echte data

---

### Sessie 2 — 2026-01-18

**Geïmplementeerd:**

1. **Intent Schema** (`src/ai/schemas/intents.ts`):
   - `IntentType` Zod enum met 9 intent types
   - `IntentClassificationSchema` voor router output
   - `IntentRouterInputSchema` voor router input
   - `INTENT_SIGNALS` lookup table voor pre-filtering
   - `preClassifyIntent()` functie voor snelle deterministische classificatie

2. **Intent Router Flow** (`src/ai/flows/intent-router.ts`):
   - `classifyIntent` Genkit flow met twee-staps strategie:
     - Stap 1: Pre-classificatie via signaalwoorden (0 tokens, <1ms)
     - Stap 2: AI classificatie alleen als pre-filter faalt
   - Compact prompt ontwerp (<100 tokens)
   - Fallback classificatie voor edge cases
   - Helper functies: `isLikelySprayRegistration()`, `isQueryIntent()`, `isActionIntent()`

**Technische keuzes:**
- Pre-filter met signaalwoorden bespaart ~80% van de AI calls voor duidelijke inputs
- Confidence threshold van 0.8 voor pre-filter om false positives te vermijden
- `MODIFY_DRAFT` alleen actief als `hasDraft: true` (context-aware)

**Volgende sessie:**
- Integreer `classifyIntent` in `/api/analyze-input/route.ts`
- Voeg `intent` message type toe aan streaming response
- Branch logica per intent type

---

### Sessie 1 — 2026-01-18

**Analyse uitgevoerd:**
- Codebase verkend: `src/ai/`, `src/app/api/`, `src/lib/`
- Smart Invoer 3.0 is al behoorlijk geavanceerd:
  - Streaming responses
  - RAG voor producten
  - Multi-turn met draft merging (add/remove/update)
  - Parcel groep detectie
  - Product alias resolution

**Belangrijke observaties:**
1. De huidige architectuur zit in `/api/analyze-input/route.ts` (390 regels)
2. Er zijn twee flows: de oude `parseSprayApplicationFlow` en de nieuwe inline flow
3. De oude flow in `src/ai/flows/parse-spray-application.ts` lijkt niet meer in gebruik
4. RAG service werkt goed maar is beperkt tot productnaam matching

**Beslissingen:**
- Start met Intent Recognition (laag risico, hoge impact)
- Behoud bestaande RAG infrastructuur
- Incrementele refactoring, geen big bang

**Volgende sessie:**
1. Maak `src/ai/schemas/intents.ts` met IntentType enum
2. Maak `src/ai/flows/intent-router.ts` met lichtgewicht classifier
3. Test met voorbeeldzinnen

---

## 📚 Referenties

- [Genkit Docs: Defining Flows](https://firebase.google.com/docs/genkit/flows)
- [Genkit Docs: Tool Calling](https://firebase.google.com/docs/genkit/tool-calling)
- [ReAct Pattern Paper](https://arxiv.org/abs/2210.03629)
