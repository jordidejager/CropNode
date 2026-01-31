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
