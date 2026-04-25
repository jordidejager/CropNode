# CropNode — Status & openstaande punten

**Doel van dit bestand:** Eén plek waar alle Claude-chats hun voortgang kunnen achterlaten zodat de gebruiker (Jordi) niet elke keer alle chats hoeft door te lezen om te weten wat er nog moet gebeuren.

**Hoe te gebruiken:**
- Aan het einde van elke chat-sessie waarin code is veranderd: voeg een regel toe onder "Recent" met datum, korte samenvatting, en eventuele follow-ups.
- Markeer elke open item met `⏳`, voltooide met `✅`, geblokkeerd met `🚫`, security/risico met `⚠️`.
- Houd het kort: linkjes naar bestanden zijn beter dan lange uitleg.
- **Niet vergeten te commiten** — anders zien andere chats het niet.

---

## Recent activity (nieuwste boven)

### 2026-04-25 — Weerstations: webhook resilience + UX polish
- ✅ TTN webhook losgekoppeld van actieve UNIQUE-constraint vorm: explicit pre-check op `(station_id, measured_at)` + plain insert ipv upsert-onConflict. Werkt nu mét en zonder migratie 072 (commit `6549335`).
- ✅ `f_cnt`/`f_port` defaulten naar 0 als TTN ze omit (zero-value protobuf strip) — fixt eerste post-rejoin uplinks.
- ✅ Migratie `072_weather_measurements_dedup_by_time.sql` aangemaakt — **nog draaien door user** (nice-to-have, niet blokkerend).
- ✅ Lux toegevoegd als 5e KPI in `StationOverviewCard` (Weerstations overzicht).
- ✅ Battery + signaal labels nu mensvriendelijk overal: `Vol/Voldoende/Bijna leeg` ipv `3.98V`, `Zeer goed/Goed/Matig/Zwak` ipv `-108dBm`. Technische detail blijft beschikbaar via `title` tooltip + Health card subtitel.
- ✅ Rules-of-Hooks fix in `LiveStationCard` (useMemo's verplaatst boven early returns).
- ✅ Refresh-knop op `/weerstations` hub header.
- ✅ Parcel grouping bug gefixt (`parcelId`/`parcelName` ipv snake_case op SprayableParcel type).
- ⏳ Regen-counter `rain=0` ondanks `i_flag=1` — user kijkt naar countmod / Dragino downlink. Decoder server-side klopt (geverifieerd met byte-decoding).

### 2026-04-25 — Performance audit + workflow rules
- ✅ 9 quick-win performance fixes toegepast (commit `7cf795b`)
- ✅ `053_performance_indexes.sql` aangemaakt — **moet nog gedraaid worden door user**
- ✅ CTGB `.select('*')` vervangen → 6MB minder payload op dashboard
- ✅ `xlsx` package en `@radix-ui/react-menubar` verwijderd (ongebruikt)
- ✅ CLAUDE.md uitgebreid met strikte migratie-regels
- ✅ Dit STATUS.md bestand toegevoegd

### 2026-04-25 — Dashboard/percelen/uren onderzoek
- Diepgravende analyses uitgevoerd op uren-, percelen-, weer-, dashboard-pagina's en kennisbank
- Geen code wijzigingen — alleen voorstellen voor verbeteringen (zie chat geschiedenis)

---

## Open clusters (in-progress werk dat niet duidelijk afgerond is)

### ⏳ Email-import & Fruitmasters orders
- **Wat:** Email inbox + automatische order-extractie via AI
- **Bestanden:**
  - `src/app/(app)/instellingen/email-inbox/page.tsx` (untracked)
  - `src/app/(app)/afzetstromen/orders/page.tsx` (untracked)
  - `src/app/api/email-inbound/` (untracked)
  - `src/app/api/cron/email-poll/` (untracked)
  - `src/lib/email-ingestion/` (untracked)
  - `src/ai/flows/extract-fruitmasters-order.ts` (untracked)
- **Migraties pending:** `069_email_ingestion.sql`, `070_incoming_orders.sql`
- **Status onbekend:** Werkend? Getest? Live?

### ⏳ Cold cell klimaat-monitoring
- **Wat:** Klimaat-metingen koelcellen (oogst sub-pagina)
- **Bestanden:**
  - `src/app/(app)/oogst/klimaat/page.tsx` (untracked)
  - `src/components/climate/` (untracked)
  - `src/hooks/use-cold-cell-climate.ts` (untracked)
- **Migratie pending:** `070_cold_cell_measurements.sql`

### ⏳ RAG verbeteringen (kennisbank chat)
- **Wat:** HyDE, reranker, query logging, evaluation suite
- **Bestanden:**
  - `src/lib/knowledge/rag/hyde.ts` (untracked)
  - `src/lib/knowledge/rag/reranker.ts` (untracked)
  - `src/lib/knowledge/rag/query-log.ts` (untracked)
  - `src/app/api/knowledge/suggestions/` (untracked)
  - `scripts/eval-rag.ts` + `scripts/rag-golden-set.json` (untracked)
  - `src/hooks/use-rag-chat.ts` (untracked)
- **Migraties pending:** `067_knowledge_hybrid_search.sql`, `068_knowledge_disease_aliases.sql`

### ⏳ Storage cell duplicatie
- **Wat:** Cellen kunnen worden gedupliceerd
- **Bestanden:**
  - `src/components/storage/duplicate-cell-dialog.tsx` (untracked)
  - `src/components/storage/duplicate-utils.ts` (untracked)
  - `src/components/storage/cell-wizard/grid-sizing.ts` (untracked)

### ⏳ Dashboard `RecentHours` widget
- **Wat:** Nieuwe widget voor recente uren
- **Bestanden:** `src/components/dashboard/RecentHours.tsx` (untracked)
- **Status:** Niet duidelijk of al geïmporteerd in dashboard

### ⏳ Afzetstromen batch-orders koppeling
- **Bestanden:** `src/components/afzetstromen/batch-orders-section.tsx` (untracked)

---

## Weather Hub roadmap (uit auto-memory, 13 dagen oud — verifiëren)

10 van de 10 backend-features zijn gebouwd. Open UI-werk:
- ⏳ Fenologie dashboard widget (API: `/api/weather/phenology`, UI?)
- ⏳ Forecast accuracy widget (API: `/api/weather/forecast-accuracy`, UI?)
- ⏳ Spray profile selector in SprayWindowIndicator (profiles bestaan, UI niet?)
- ⏳ Geïntegreerde alert flow: infectiemodel → kennisbank → CTGB → spuitwindow → WhatsApp

---

## TODO comments in code

- ⚠️ `src/app/api/knowledge/chat/route.ts:43` — auth uitgeschakeld in dev (`TODO: re-enable for production`) — **security risico bij deploy**
- ⏳ `src/app/(app)/oogst/page.tsx:267` — Day view: bulk entry spreadsheet-style nog niet geïmplementeerd
- ⏳ `src/lib/validation-service.ts:786` — unit conversion logica ontbreekt nog (`totalDose += h.dosage; // TODO: unit conversion if needed`)

---

## Pending migraties (nog niet gedraaid in Supabase)

> Dit lijstje is een gok op basis van untracked bestanden — Jordi check zelf via Supabase SQL Editor of `schema_migrations` tabel.

- `053_performance_indexes.sql` (vandaag aangemaakt)
- `067_knowledge_hybrid_search.sql`
- `068_knowledge_disease_aliases.sql`
- `069_email_ingestion.sql`
- `070_cold_cell_measurements.sql`
- `070_incoming_orders.sql` (⚠️ duplicate nummer met 070_cold_cell)

---

## Bekende issues / quirks

- Migration files hebben **veel duplicate nummers**: 029×2, 034×2, 039×2, 040×2, 041×2, 045×2, 046×2, 052×2, 053×3, 058×2, 062×2, 064×2, 065×2, 070×2. Niet hernoemen — `schema_migrations` tracking gebruikt filename als key.
- Database connectie via `db.djcsihpnidopxxuxumvj.supabase.co` is **IPv6-only**. Op IPv4 netwerk: gebruik Session Pooler URL (Supabase Settings → Database).
- Studio is een git submodule. Push naar `cropnode` remote, NIET naar `origin` (= AgrisprayerPro mirror, niet deployed).
