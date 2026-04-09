# Fase 2 — RAG Chatbot: Grounded Generation

## Context

Fase 1 leverde 1970 kennisartikelen met 768-dim embeddings + een zoek-endpoint. Fase 2 bouwt daarbovenop een **grounded chatbot** die antwoorden geeft gebaseerd op alleen onze eigen kennisbank. Zero hallucinatie: als de bot iets niet zeker weet, zegt hij dat ook.

## Design doelen

1. **Zero hallucinatie** — Gemini mag alleen putten uit retrieved knowledge_articles. Geen externe kennis.
2. **Transparantie** — elk antwoord toont de bron-artikelen waar het op gebaseerd is (titels, geen URLs).
3. **Teeltcontext-aware** — de chatbot kent de huidige fenologische fase, het gewas, en filtert automatisch op relevante artikelen.
4. **CTGB post-validatie** — als de bot een middel/dosering noemt, wordt die gecheckt tegen `ctgb_products` voor huidige toelating.
5. **Streaming responses** — antwoorden verschijnen woord-voor-woord voor snelle UX.
6. **Confidence threshold** — als similarity van retrieved chunks te laag is, zegt de bot "ik heb hier onvoldoende kennis over, raadpleeg een adviseur".

## Architectuur

```
User input ("wat doe ik tegen schurft bij Jonagold nu?")
    │
    ├── 1. Query understanding
    │      - Genkit flow: extract intent + entities (disease, crop, variety)
    │      - Detect: gewas, ziekte, productvraag, tijdvraag, etc.
    │
    ├── 2. Context enrichment
    │      - Huidige fenologische fase uit phenology-service
    │      - Gebruiker-perceel context (uit bestaande parcels table, optioneel)
    │      - Actief maand/seizoen
    │
    ├── 3. Retrieval (hybrid)
    │      - Vector search via match_knowledge_articles RPC
    │      - Metadata filters: crops, category, month, subcategory
    │      - Top 5-8 resultaten boven similarity threshold (0.72)
    │      - Dedupliceer, sorteer op combined score (similarity + month_boost + fusion_sources)
    │
    ├── 4. Confidence check
    │      - Hoogste similarity < 0.70 → "onvoldoende kennis" fallback
    │      - Geen resultaten matchen het gewas → herformuleer of weiger
    │
    ├── 5. Grounded generation (Genkit streaming)
    │      - System prompt: "je bent CropNode teelt-assistent, gebruik alleen onderstaande context"
    │      - User prompt: origineel + retrieved chunks
    │      - Output format: markdown met duidelijke product/dosering/timing
    │      - Streaming response
    │
    ├── 6. CTGB post-processing
    │      - Extract alle productnamen uit antwoord (regex + fuzzy match)
    │      - Per product: check ctgb_products (naam, toelatingsstatus, vervaldatum)
    │      - Annoteer antwoord met ✓ / ✗ / ⚠️ icons per product
    │      - Strike-through vervallen producten met disclaimer
    │
    └── 7. Bron-vermelding
           - Lijst van gebruikte artikelen onderaan
           - Alleen titel + categorie, NOOIT FruitConsult / bron-URLs
           - Elke bron klikbaar → opent Article Dossier
```

## Bestanden

### Nieuwe TypeScript modules

- **`src/lib/knowledge/rag/query-understanding.ts`**
  Genkit flow die een user query omzet naar gestructureerde intent:
  ```ts
  interface QueryIntent {
    topic: 'ziekte' | 'plaag' | 'teelttechniek' | 'middel' | 'algemeen';
    crops: Crop[];
    diseases?: string[];
    varieties?: string[];
    products?: string[];
    timingQuestion: boolean;
    confidence: number;
  }
  ```

- **`src/lib/knowledge/rag/context-builder.ts`**
  Verrijkt de query met huidige fase, maand, gebruiker-perceel:
  ```ts
  async function buildRagContext(intent: QueryIntent): Promise<RagContext>
  ```

- **`src/lib/knowledge/rag/retriever.ts`**
  Hybrid retrieval (vector + metadata filters):
  ```ts
  async function retrieveChunks(
    intent: QueryIntent,
    context: RagContext,
    options?: { limit?: number; threshold?: number }
  ): Promise<RetrievedChunk[]>
  ```

- **`src/lib/knowledge/rag/confidence.ts`**
  Checks op confidence threshold + crop-match + timing-coherentie. Retourneert een
  "fallback response" als er onvoldoende zekerheid is.

- **`src/lib/knowledge/rag/grounded-generator.ts`**
  Genkit flow die de prompt samenstelt en streamt. Belangrijkste onderdeel is de
  **grounded system prompt** die expliciet zegt: "je mag ALLEEN feiten uit de
  onderstaande context gebruiken. Als iets niet in de context staat, zeg dat
  letterlijk: 'dit staat niet in onze kennisbank'".

- **`src/lib/knowledge/rag/ctgb-postprocessor.ts`**
  Parset het gegenereerde antwoord, extraheert productnamen (met fuzzy match
  tegen `ctgb_products`), en annoteert met toelatingsstatus.

- **`src/lib/knowledge/rag/pipeline.ts`**
  Orchestrator die alle stappen samenhangt:
  ```ts
  async function* runRagPipeline(
    query: string,
    sessionContext: SessionContext
  ): AsyncGenerator<RagEvent>
  ```
  Yields events voor streaming: `understanding`, `retrieval`, `answer_chunk`, `ctgb_annotation`, `sources`, `done`.

### API route

- **`src/app/api/knowledge/chat/route.ts`** — Server-sent events endpoint
  - Vereist auth (bestaande user session)
  - Accepteert `{ query: string, sessionId?: string, history?: Message[] }`
  - Streamt antwoord chunk-voor-chunk via SSE
  - Logt query + bronnen in `chat_history` tabel (voor Fase 5 feedback loop)

### Database

- **`sql/047_chat_history.sql`** — Nieuwe tabel voor chat logs:
  ```sql
  CREATE TABLE chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    last_active_at TIMESTAMPTZ DEFAULT now(),
    title TEXT  -- AI-generated summary of the conversation
  );

  CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,  -- user | assistant | system
    content TEXT NOT NULL,
    retrieved_article_ids UUID[],
    retrieval_scores FLOAT[],
    used_ctgb_check BOOLEAN DEFAULT false,
    feedback INT,  -- -1 / 0 / 1 for Fase 5
    created_at TIMESTAMPTZ DEFAULT now()
  );
  ```

## Grounded generation prompt (draft)

```
Je bent CropNode's teelt-assistent voor Nederlandse appel- en perentelers.
Vandaag is het {{date}}, week {{week}}, huidige fenologische fase: {{phase}}.

KRITISCHE REGELS:
1. Beantwoord de vraag ALLEEN op basis van de onderstaande context.
2. Als de context onvoldoende informatie bevat, zeg dat LETTERLIJK:
   "Dit staat niet in onze kennisbank, raadpleeg een adviseur."
3. Verzin NOOIT productnamen, doseringen of timing.
4. Neem productnamen en doseringen LETTERLIJK over uit de context.
5. Als de vraag over een middel gaat dat niet in de context voorkomt,
   zeg expliciet dat je daar geen informatie over hebt.
6. Schrijf in het Nederlands, praktisch en bondig (2-4 zinnen per punt).
7. Structureer het antwoord met korte kopjes als het complex is.
8. Gebruik GEEN bronvermeldingen in de tekst ("volgens FruitConsult..."), die
   worden automatisch onderaan toegevoegd.

== HUIDIGE CONTEXT ==
Gewas in vraag: {{crops}}
Fase: {{phase}}
Maand: {{month}}

== RELEVANTE KENNIS UIT DE CROPNODE KENNISBANK ==
{{#each chunks}}
[{{category}} — {{title}}]
{{content}}
---
{{/each}}

== GEBRUIKER VRAAGT ==
{{query}}
```

## UI integratie

Voor nu bouwen we **geen chat UI in Fase 2** — dat is Fase 3. In Fase 2 testen we de chatbot via:
- `curl` tegen `/api/knowledge/chat`
- Een minimale debug-pagina op `/kennisbank/chat-debug` (alleen voor dev)

## Verificatie

**Test queries voor quality check:**

1. "Wat doe ik nu tegen schurft bij Jonagold?" → moet productadvies geven uit recente schurft artikelen
2. "Welke dosering Captan is toegestaan op appel?" → moet captan doseringen noemen EN CTGB status checken
3. "Wanneer begin ik met dunnen bij Elstar?" → moet timing in relatie tot fenologie geven
4. "Mag ik Topsin M gebruiken tegen vruchtboomkanker?" → moet expliciet zeggen "vervallen per 19 oktober 2021"
5. "Welke kunstmest voor tomaten?" → moet "dit staat niet in onze kennisbank" zeggen (tomaten ≠ appel/peer)
6. "Hoe werkt fotosynthese?" → moet weigeren te antwoorden (niet teeltspecifiek)
7. "Wat is de beste bank voor mijn bedrijf?" → weigeren (off-topic)

**Kwaliteitscriteria:**
- Elk antwoord linkt naar ≥1 bron-artikel
- Geen uitgevonden productnamen (vergelijk tegen `ctgb_products` + `knowledge_articles.products_mentioned`)
- Fallback-responses bij similarity < 0.70 worden correct getriggerd
- CTGB annotaties verschijnen bij elk genoemd product
- Geen "FruitConsult", adviseurs of bron-organisaties in de output

## Implementatievolgorde

1. SQL migration chat_history (15 min)
2. query-understanding.ts + tests (30 min)
3. retriever.ts + tests (30 min)
4. confidence.ts (15 min)
5. grounded-generator.ts (45 min)
6. ctgb-postprocessor.ts (30 min)
7. pipeline.ts orchestrator (30 min)
8. /api/knowledge/chat route met SSE (30 min)
9. Debug pagina /kennisbank/chat-debug (20 min)
10. 7 test queries doorlopen + fine-tunen (60 min)

**Totaal: ~5-6 uur focused werk**

## Buiten scope van Fase 2

- Chat UI in kennisbank-pagina (Fase 3)
- WhatsApp integratie (Fase 4)
- Chat history UI (Fase 3 of Fase 5)
- Feedback loop met thumbs up/down (Fase 5)
- Perceel-context personalisatie (Fase 5)
- Meertalige ondersteuning
