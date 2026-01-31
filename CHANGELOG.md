# 📜 Changelog — AgriSprayer Pro

Alle opmerkelijke veranderingen aan dit project worden in dit bestand gedocumenteerd.

## [Unreleased]

### 🤖 AgriBot Development — Fase 2.2 (RAG voor CTGB Kennisbank) ✅
- **Semantic Search Ready**: Vector embeddings voor CTGB producten.
- **Database Schema**: `sql/add_embedding_column.sql` — pgvector migratie met HNSW index.
- **Generatie Script**: `scripts/generate-product-embeddings.ts` — standalone tool voor embedding generatie.
- **Technische Details**:
  - Google AI text-embedding-004 model (768 dimensies)
  - HNSW index voor snelle cosine similarity search
  - `search_products_by_embedding()` Supabase RPC functie
  - Batch processing met rate limiting
- **Setup Instructies**: Zie `AGRIBOT_BLUEPRINT.md` voor volledige setup guide.

### 🤖 AgriBot Development — Fase 2.4 (Frontend Agent Feedback)
- **Streaming AI Ervaring**: Gebruikers zien nu real-time wat de AgriBot doet.
- **Nieuwe StreamMessage Types**:
  - `agent_thinking` — "Aan het nadenken..." met pulserende brain icoon
  - `agent_tool_call` — Tool-specifieke labels zoals "Producten zoeken", "Spuithistorie ophalen"
  - `agent_tool_result` — Groene checkmarks voor voltooide tools
  - `agent_answer` — Finale agent response
- **Tool History Badges**: Visuele chips die tonen welke tools zijn aangeroepen met status animaties.
- **Nederlandse Labels**: Alle tools hebben gebruiksvriendelijke Nederlandse namen.
- **Bug Fixes & Maintenance**:
  - **NaN Console Warning**: Fixed "Received NaN for the value attribute" in numeric inputs on the Parcel Detail View.
  - **Next.js 15 Build Fix**: Resolved `Server Actions must be async functions` error by removing `'use server'` directive from AI modules (`agribot-agent.ts`, `agribot-tools.ts`, `intent-router.ts`) which export objects and non-async functions. These modules are only used server-side in API routes.
  - **AgriBot Query Fix**: Fixed a bug where textual AI responses (like product info) would trigger a "Geen data ontvangen" error by implementing a robust branching logic based on text delivery vs. structured data.
- **Bestanden Gewijzigd**:
  - `src/app/(app)/page.tsx` — Agent event handling + AgentState tracking
  - `src/components/smart-invoer-feed.tsx` — Visuele feedback componenten

### ✨ UX/UI
- **Company Command Center**: De pagina `percelen` is volledig herontworpen van een saaie lijst naar een krachtig Bedrijfsdashboard.
- **Hero Stats Header**: Direct inzicht in totaal oppervlakte, aantal bomen en bedrijfsomvang bovenaan de pagina.
- **Smart Parcel Cards**: Alle percelen worden nu getoond in een grid van interactieve kaarten met kleurcodering per gewas (Appel, Peer, Mix).
- **Search & Filter Integration**: Zoekbalk direct geïntegreerd in de header voor snelle toegang tot percelen, rassen of gewassen.
- **Animations**: Gebruik van `framer-motion` voor vloeiende, 'staggered' animaties bij het laden van de percelen.

### 🤖 AgriBot Development — Fase 2 (Tool Calling)
- **Genkit Tools** (`src/ai/tools/agribot-tools.ts`):
  - `searchProducts` — Zoek producten op naam/gewas/doelorganisme
  - `getProductDetails` — Volledige productinfo met voorschriften
  - `getSprayHistory` — Spuithistorie met filters
  - `getParcelInfo` — Perceel informatie
- **AgriBot Agent** (`src/ai/flows/agribot-agent.ts`):
  - Tool calling agent die zelf beslist welke data op te halen
  - Streaming versie met real-time events (thinking, tool_call, tool_result, answer)
  - Complexe query detectie voor automatische agent routing
- **Voorbeelden die nu werken:**
  - "Wanneer heb ik voor het laatst Captan gebruikt op de Elstar?"
  - "Welke fungicides heb ik dit jaar het meest gebruikt?"

### 🤖 AgriBot Development — Fase 1 COMPLEET
- **Parameter Extraction (1.4)**: Intent + parameters in één AI call.
  - Query schemas: `QueryProductParams`, `QueryHistoryParams`, `QueryRegulationParams`
  - `classifyIntentWithParams()` flow voor combined extraction
  - Query handlers met echte Supabase data
- **Query Handlers**: Bot kan nu vragen beantwoorden:
  - "Welke middelen tegen schurft?" → zoekt producten
  - "Hoeveel heb ik dit jaar gespoten?" → toont geschiedenis
  - "Wat is de dosering van Captan?" → toont regelgeving
- **API Integratie (1.3)**: Intent Router geïntegreerd in `/api/analyze-input/route.ts`.
  - Intent classificatie als PHASE 0 (voor alle andere processing)
  - Nieuwe StreamMessage types: `intent` en `answer`
  - Branch logica per intent type (CONFIRM, CANCEL, CLARIFY, NAVIGATE, QUERY_*, REGISTER_SPRAY)
  - Backward compatible: bestaande spray flow blijft intact
- **Intent Schema**: `src/ai/schemas/intents.ts` — 9 intent types met Zod validatie en signaalwoord pre-filtering.
- **Intent Router**: `src/ai/flows/intent-router.ts` — Twee-staps classificatie (deterministische pre-filter + AI fallback).
- **Optimalisatie**: Pre-filter bespaart ~80% van AI calls voor duidelijke inputs.

### 🤖 AgriBot Project Started
- **Blueprint Initiated**: `AGRIBOT_BLUEPRINT.md` aangemaakt als estafette-document voor AI-sessies.
- **Architectuur Analyse**: Smart Invoer 3.0 geanalyseerd — RAG, multi-turn drafts, en streaming werken al.
- **Roadmap Gedefinieerd**:
  - Fase 1: Intent Recognition (multi-intent routing)
  - Fase 2: Tool Calling & uitgebreide RAG
  - Fase 3: Conversational UX & Personality

### ✨ Features
- **Dashboard Grid Layout**: Implemented a responsive side-by-side grid for composition data.
  - **Linker Kolom**: Perceel Compositie (verdeling van blokken).
  - **Rechter Kolom**: Ras/Mutant Compositie (geaggregeerde biologische verdeling).
  - Beschikbaar op zowel het Bedrijfsoverzicht als individuele Perceel Dashboards.

### ⚡ Improvement
- **Standardized Stamgegevens**: Gecentraliseerde invoer voor kerngegevens met creatable selects.
  - **Mutant(en)**: Automatische pre-fill voor Appel (Red Prince, Nicored).
  - **Onderstam(men)**: Crop-specifieke lijsten voor Appel (M9, etc.) en Peer (Kwee C, etc.).
  - **Plantjaar**: Gestandaardiseerde jaartalselectie (1950-2026).
  - **Watermanagement**: Nieuwe velden voor Irrigatie en Berekening met conditionele percentage-invoer bij 'Deels'.
- **UX Polishing**: Verbeterde visuele feedback in de composition bars en KPIs met rijke iconografie.
### 🏗️ Architecture & Features
- Ontwikkeling van "Weighted Multi-Input" voor stamgegevens (mix van rassen/onderstammen).
- Opzet van "Uw Bedrijf" dashboard voor helikopterview.

## [0.1.0] - 2026-01-18
### ✨ Features
- **Smart Input Bar:** Eerste versie van de AI-gestuurde command-bar met glassmorphism design.
- **Perceelbeheer:** Basis boomstructuur en tabelweergave voor percelen geïmplementeerd.
- **Dashboard:** Detailpagina per perceel met statistieken en grafieken.

### 🏗️ Tech Stack Setup
- Initialisatie Next.js 15 (App Router) & Turbopack.
- Installatie Tailwind CSS, Shadcn/UI en Framer Motion.
- Configuratie Supabase connectie en authenticatie.
- Setup Genkit voor AI orchestratie.
