# CLAUDE.md - Command Center & Smart Input

## Doel en Scope

Het Command Center is de centrale invoerinterface voor spuitregistraties via natuurlijke taal. De Smart Input feature parseert Nederlandse tekst naar gestructureerde spuitdata met AI, valideert tegen CTGB-regels, en ondersteunt iteratieve correcties.

**Kernfunctionaliteit:**
- Natural language parsing van spuitregistraties
- Intent classificatie (9 types)
- Multi-turn conversatie met correctie-ondersteuning
- Real-time CTGB validatie
- Streaming responses met fase-indicatoren

---

## Slimme Invoer V2 (Hybride Architectuur)

**Locatie:** `/smart-input-v2/page.tsx`

V2 is een volledig herontworpen systeem met betere performance:

| Aspect | V1 | V2 |
|--------|----|----|
| Context Loading | Server-side per request | Client-side cached |
| Response Time | 6-12s | 1-3s |
| Validation | Client-side | Server-side (6 rules) |
| Unit Detection | Manual | Smart (kg/ha vs L/ha) |

### V2 Endpoints

| Endpoint | Functie |
|----------|---------|
| `/api/smart-input-v2` | Hybride verwerking (pipeline + agent) |
| `/api/smart-input-v2/context` | Context loading (parcels, products, history) |

### V2 Bestanden

| Bestand | Functie |
|---------|---------|
| `/smart-input-v2/page.tsx` | V2 pagina met context loading |
| `/src/lib/types-v2.ts` | SmartInputUserContext types |
| `/src/lib/draft-validator.ts` | Server-side 6-rule validation |

### V2 Tests

| Bestand | Functie |
|---------|---------|
| `/scripts/regression-corpus.ts` | 53 test scenarios |
| `/scripts/run-regression-tests.ts` | CLI test runner |
| `/e2e/smart-input-v2.spec.ts` | Playwright E2E tests |

**Run Tests:**
```bash
npx tsx scripts/run-regression-tests.ts --verbose
npm run test:e2e:headed
```

---

## Componenten en Verantwoordelijkheden

### Page Components

| Component | Locatie | Verantwoordelijkheid |
|-----------|---------|---------------------|
| `page.tsx` | `/smart-input/page.tsx` | Main orchestrator, state management, API calls |
| `SmartInvoerFeed` | `/src/components/smart-invoer-feed.tsx` | Chat-style feed UI, processing indicators |
| `SmartResultCard` | `/src/components/smart-result-card.tsx` | Individuele registratie kaart met edit functionaliteit |
| `CommandBar` | `/src/components/command-bar.tsx` | Input field met suggesties |

### AI Flows

| Flow | Locatie | Functie |
|------|---------|---------|
| `classify-and-parse-spray.ts` | `/src/ai/flows/` | Combined intent + spray parsing (Punt 7) |
| `intent-router.ts` | `/src/ai/flows/` | Pre-filter + AI intent classificatie |
| `parse-spray-application.ts` | `/src/ai/flows/` | Gedetailleerde spray parsing V1/V2 |

### Services

| Service | Locatie | Functie |
|---------|---------|---------|
| `correction-service.ts` | `/src/lib/` | Detectie en toepassing van correcties |
| `feedback-service.ts` | `/src/lib/` | User learning loop opslag |
| `parcel-resolver.ts` | `/src/lib/` | Perceel matching en groep resolutie |

---

## Supabase Tabellen

### Direct Gebruikt

| Tabel | Gebruik |
|-------|---------|
| `logbook` | Draft registraties opslaan |
| `spuitschrift` | Bevestigde registraties |
| `parcel_history` | Historische spray data per perceel |
| `smart_input_feedback` | User correcties voor learning |
| `conversations` | Chat history opslag |

### Ondersteunend

| Tabel | Gebruik |
|-------|---------|
| `v_sprayable_parcels` | Beschikbare percelen voor matching |
| `ctgb_products` | Product validatie en dosering lookup |
| `product_aliases` | Alias naar officiële naam mapping |

---

## Business Rules

### Intent Classificatie

**9 Intent Types:**
1. `REGISTER_SPRAY` - "Gisteren 2L Captan op alle peren"
2. `QUERY_PRODUCT` - "Welke middelen tegen schurft?"
3. `QUERY_HISTORY` - "Hoeveel heb ik dit jaar gespoten?"
4. `QUERY_REGULATION` - "Wat is de VGT van Captan?"
5. `NAVIGATE` - "Ga naar perceel Thuis"
6. `CONFIRM` - "Ja, klopt"
7. `CANCEL` - "Stop, annuleer"
8. `CLARIFY` - "Wat bedoel je?"
9. `MODIFY_DRAFT` - "Nee, niet perceel X"

**Pre-filter Signal Words:**
```typescript
REGISTER_SPRAY: ['gespoten', 'spuiten', 'bespuiting', 'vandaag', 'gisteren', 'l/ha', 'kg/ha', 'alle appels', 'alle peren', 'halve dosering']
MODIFY_DRAFT: ['niet', 'toch niet', 'behalve', 'voeg toe', 'verwijder', 'wijzig']
```

### Correctie Types

| Type | Trigger | Actie |
|------|---------|-------|
| `remove_last_plot` | "niet dat perceel" | Verwijder laatste toegevoegde perceel |
| `remove_specific_plot` | "verwijder de elstar" | Verwijder alle percelen van dat ras |
| `remove_specific_product` | "verwijder captan" | Verwijder product uit draft |
| `update_dosage` | "maak het 1.5 kg" | Update dosering van product |
| `update_date` | "niet vandaag, gisteren" | Wijzig datum |
| `cancel_all` | "stop" | Reset gehele draft |
| `undo` | "ongedaan maken" | Herstel vorige draft state |

### Parsing Rules

1. **ALLEEN expliciet genoemde producten parsen** - nooit assumeren
2. **Dosering = 0 als niet gespecificeerd** - systeem vult aan uit CTGB
3. **Unit = "L" als niet gespecificeerd** - default liters
4. **Crop matching**: "alle appels" → alle plots met crop='Appel'
5. **Variety matching**: "alle elstar" → alle plots met variety='Elstar'

### Variatie Patterns (V2 Parsing)

Detecteert en verwerkt:
- "Alle appels met Merpan, maar Kanzi ook Score" → 2 registraties
- "Halve dosering op jonge bomen" → Aparte registratie met aangepaste dosering
- "Behalve Tessa" → Exclusie van alle percelen met dat ras

---

## State Management

### Frontend State

```typescript
// Primary states in page.tsx
chatHistory: Message[]              // Conversatie berichten
currentDraft: DraftContext | null   // Actieve registratie
processingPhase: ProcessingPhase    // UI fase indicator
draftHistory: DraftContext[]        // Undo stack (max 10)

type ProcessingPhase =
  | 'idle'
  | 'searching'
  | 'context_ready'
  | 'extracting'
  | 'validating'
  | 'agent_thinking'
  | 'agent_tool_call'
  | 'complete'
  | 'error'
```

### Stream Message Types

```typescript
type StreamMessage =
  | { type: 'intent'; intent: string; confidence: number }
  | { type: 'searching'; terms: string[] }
  | { type: 'context_ready'; productCount: number; parcelCount: number }
  | { type: 'extracting' }
  | { type: 'partial'; data: any }
  | { type: 'complete'; data: any; merged?: boolean; reply?: string }
  | { type: 'slot_request'; slotRequest: SlotRequest }
  | { type: 'correction'; correction: any; message: string }
  | { type: 'error'; message: string }
```

### Session Cache

Per-user caching voor snelheid:
- `parcel_groups` - Pre-resolved groepen
- `product_context` - Cached product data
- `user_preferences` - Feedback en aliassen
- TTL: 1 uur default

---

## Data Flow

```
User Input → /api/analyze-input
    │
    ├─1→ Pre-filter Intent (Signal Words, <1ms)
    │    └─ If confidence < 0.8 → AI Classification
    │
    ├─2→ Correction Detection (if draft exists)
    │    └─ Apply correction if detected
    │
    ├─3→ Combined Intent + Parse (Punt 7)
    │    └─ Single Gemini call for both
    │
    ├─4→ Parcel Resolution
    │    └─ Match "alle appels" → specific plot IDs
    │
    ├─5→ CTGB Validation (Deterministic)
    │    └─ 6 priority checks
    │
    └─6→ Stream Response
         └─ Phase updates + final result
```

---

## API Integraties

### /api/analyze-input

**Input:**
```typescript
{
  rawInput: string
  draftContext?: DraftContext
  conversationHistory?: Message[]
}
```

**Output (Streaming):**
```typescript
// Multiple SSE events:
data: {"type":"intent","intent":"REGISTER_SPRAY","confidence":0.95}
data: {"type":"searching","terms":["Captan","appels"]}
data: {"type":"context_ready","productCount":1,"parcelCount":5}
data: {"type":"extracting"}
data: {"type":"complete","data":{...},"reply":"Ik heb de registratie..."}
```

### Gemini API via Genkit

**Model:** `googleai/gemini-2.5-flash-lite`

**Flattening Technique (Punt 7):**
Gemini heeft 5-level nesting limiet. Oplossing: comma-separated strings.

```typescript
// Instead of nested:
products: [{ product: "A", dosage: 1, unit: "L" }]

// Use flattened:
productList: "A:1:L,B:2:kg"

// Post-process back to nested in unflattenOutput()
```

---

## Design Decisions

### Punt 1: Fast Pre-filter + AI Fallback
Intent classificatie via signal words eerst (0 tokens), AI alleen als confidence < 0.8.

### Punt 2: Session Caching
Herhaalde lookups zijn duur. Cache in memory per user sessie met TTL invalidatie.

### Punt 5: Regex Hints Context
Pre-processing hints geven context aan AI zonder output te forceren:
- Detected group keywords
- Exception patterns
- Date hints

### Punt 6: Feedback Loop
User correcties opslaan voor toekomstig leren:
- Product aliassen ("Merpan" → "Merpan 500 SC")
- Dosering voorkeuren
- Perceel groepen
- Product combinaties

### Punt 7: Combined Intent + Parse
Eén AI call voor beide taken. 50% reductie in API calls, lagere latency.

### Variety-Based Exclusion
"Tessa niet" verwijdert ALLE Tessa percelen automatisch, niet alleen één.

---

## Status Indicators

| Status | Kleur | Betekenis |
|--------|-------|-----------|
| Nieuw | Blauw | Net ingevoerd |
| Analyseren... | Amber (spinner) | AI verwerkt |
| Te Controleren | Geel | Gebruiker moet checken |
| Waarschuwing | Oranje | Issues gevonden maar toegestaan |
| Akkoord | Emerald | Valide, kan bevestigd worden |
| Fout | Rood | Parse error |
| Afgekeurd | Rood | Validatie mislukt |

---

## Error Handling

- API crashes NOOIT met 500 - altijd stream error message naar client
- Fallback responses voor AI failures
- Retry logic met exponential backoff (3 pogingen)
- Defensive validation op elke stap
