# CropNode — Status & openstaande punten

**Doel van dit bestand:** Eén plek waar alle Claude-chats hun voortgang kunnen achterlaten zodat de gebruiker (Jordi) niet elke keer alle chats hoeft door te lezen om te weten wat er nog moet gebeuren.

**Hoe te gebruiken:**
- Aan het einde van elke chat-sessie waarin code is veranderd: voeg een regel toe onder "Recent" met datum, korte samenvatting, en eventuele follow-ups.
- Markeer elke open item met `⏳`, voltooide met `✅`, geblokkeerd met `🚫`, security/risico met `⚠️`.
- Houd het kort: linkjes naar bestanden zijn beter dan lange uitleg.
- **Niet vergeten te commiten** — anders zien andere chats het niet.

---

## Recent activity (nieuwste boven)

### 2026-05-27 — Historie-grafiek + secundaire KPI's sensor-bewust
- ✅ `StationHistoryChart` accepteert nu `deviceKind` prop. Metric-tabs schakelen per sensor type:
  - weather → Temperatuur / Luchtvochtigheid / Luchtdruk / Neerslag / Licht (ongewijzigd)
  - **soil → Bodemvocht / Bodemtemp / EC (porie-water)**
  - **leaf → Bladnat / Bladtemp**
- ✅ EC in historie gebruikt dezelfde Hilhorst-conversie als KPI-tegel (bulk → porie-water).
- ✅ Tooltip cross-context per metric (bv. EC toont VWC + bulk-waarde; leafTemp toont bladnat).
- ✅ Subtitle ("Sensor-metingen van je …") past zich aan per sensor type.
- ✅ `StationDetailView` secundaire rij: "Licht" HealthCard verbergt zich voor bodem/blad sensoren (geen lichtmeting op die hardware) → grid valt terug naar 2 kolommen (Accu + Signaal).
- ✅ Doorgegeven vanuit alle 3 call sites: `StationDetailView`, `WeerstationsManager`, `OwnStationHistorySection`.
- Files: `src/components/weather/StationHistoryChart.tsx`, `src/components/weerstations/StationDetailView.tsx`, `src/app/(app)/instellingen/weerstations/WeerstationsManager.tsx`, `src/components/weather/historie/OwnStationHistorySection.tsx`.

### 2026-05-27 — EC bulk → porie-water conversie (agronomisch correct)
- ✅ Nieuwe helper `src/lib/weather/soil-ec.ts`: `bulkEcToPoreWater()` met Hilhorst-simplified formule `ECpw ≈ ECbulk / θ`, plus `poreWaterEcLabel()` met Nederlandse fruitteelt-thresholds (laag <0.30 / onder gem. <0.70 / normaal 0.70-1.30 / verhoogd <1.50 / hoog ≥1.50 mS/cm).
- ✅ `StationDetailView.tsx`: EC-tegel toont nu `EC (porie-water)` in mS/cm + sublabel met agronomisch oordeel ("Normaal", "Hoog — droogte+zoutrisico", etc.) en bulk-sensorwaarde als context.
- ✅ `StationOverviewCard.tsx`: MiniStat EC rekent ruwe sensorwaarde om naar porie-water.
- ✅ `live-snapshot-handler.ts` (WhatsApp "Nu"): toont `EC X.XX mS (normaal)` ipv ruwe bulk-waarde — komt overeen met meet-protocol dat gebruiker volgt.
- Aanleiding: gebruiker zag 0.25 mS/cm op SE01 wat agronomisch onmogelijk laag is voor boomgaard. Dragino meet bulk-EC (verdund door bodemwater), agronomisch relevant is porie-water EC = wat wortelharen "zien".
- Files: `src/lib/weather/soil-ec.ts` (new), `src/components/weerstations/StationDetailView.tsx`, `src/components/weerstations/StationOverviewCard.tsx`, `src/lib/whatsapp/live-snapshot-handler.ts`.

### 2026-04-26 — Multi-perceel registratie + hectare-verdeling
- ✅ `RegistrationForm` mode='register' switcht naar `UnifiedParcelMultiSelect` (mode='multi'). Timer-mode blijft single-select. Meerdere subpercelen + heel-percelen tegelijk te kiezen in 1 registratie.
- ✅ Submit-flow loopt over `parcelEntries`: per geselecteerd perceel een task_log met identieke uren/personen/datum. Heel-perceel → 1 row met `parcel_id`, losse subs → eigen row met `sub_parcel_id`. Werkt in zowel flat- als perDay-mode (cartesisch product).
- ✅ Nieuwe toggle "Verdeel uren naar oppervlakte (hectares)" in achteraf-flow, zichtbaar wanneer ≥2 subpercelen geselecteerd. Bij aan: `hoursPerPerson` wordt geschaald naar `(sub.area / totalArea)`. Bv. 200u op (1,5ha + 0,5ha) → 150u + 50u. Inclusief live preview-lijst per subperceel.
- ✅ Hectare-modus expandeert heel-perceel-keuzes automatisch naar individuele subs (anders kan er niet geschaald worden).
- ✅ Fallback bij ontbrekende area-data: gelijke verdeling 1/N.
- ✅ Cluster-helper extern al gerefactored naar `task-parcel` kind (zelfde taak + perceel = 1 cluster ongeacht datum/uren). Multi-perceel-registraties verschijnen daardoor als N losse cards in de Overzicht — per perceel een eigen cluster met alle dagen erin.
- ✅ `handleCopyFromLast` zet ook `multiSubParcelIds` zodat "neem vorige over" werkt in multi-mode.
- Files: `src/components/urenregistratie/RegistrationForm.tsx`.
- Pre-existing TS-fouten in `parse-fruitmasters-order.ts`, `BiofixConfig.tsx`, `supabase-store.ts(4721)` en `orders/upload/route.ts` **niet** geraakt.

### 2026-04-26 — Lopende multi-day timer: per-dag werktijden vooraf opslaan
- ✅ Nieuwe `day_overrides JSONB` kolom op `active_task_sessions` (migratie `073_active_task_session_day_overrides.sql` — **moet nog gedraaid worden**) + view `v_active_task_sessions_enriched` recreated.
- ✅ `ActiveTaskSession.dayOverrides` toegevoegd aan TS-type en mapper. `updateActiveTaskSession` accepteert nu `dayOverrides` als update-veld.
- ✅ Nieuwe `DayOverridesDialog.tsx` — per-dag input voor uren+personen tijdens een lopende multi-day timer. Override-rijen krijgen "aangepast" badge + reset-knop terug naar werkschema-default.
- ✅ Knop "Werktijden per dag" op `ActiveSessions` kaart, alleen zichtbaar bij multi-day timers. Toont "n aangepast" badge wanneer er al overrides staan.
- ✅ `StopSessionWizard.buildMultiDayEntries` accepteert overrides en gebruikt ze als prefill — gebruiker hoeft niets opnieuw in te voeren bij afronden.
- ✅ Bug-fix: `lastDayEndTime` useEffect in wizard schreef laatste dag opnieuw bij mount → overrides voor vandaag werden gewist. Nu alleen bij user-input via `handleLastDayEndTimeChange`.
- ✅ RLS-bug-fix in `stopTaskSession` + `stopTaskSessionMultiDay` — `user_id` ontbrak, waardoor afronden faalde met "new row violates row-level security policy". Nu via `getCurrentUserId()` zoals `addTaskLog`.
- Files: `src/components/urenregistratie/DayOverridesDialog.tsx` (new), `ActiveSessions.tsx`, `StopSessionWizard.tsx`, `src/lib/types.ts`, `src/lib/supabase-store.ts`, `src/hooks/use-data.ts`, `supabase/migrations/073_active_task_session_day_overrides.sql` (new).
- Pre-existing TS-fouten in `src/lib/afzetstromen/parse-fruitmasters-order.ts` (10 stuks) **niet** geraakt — Supabase typing issue uit andere chat.

### 2026-04-25 — Weerstation historiegrafiek herzien (premium look)
- ✅ Licht (lux) als 5e metric tab toegevoegd — iconisch geel, k-suffix bij hoge waarden.
- ✅ Op 7-daagse range bevat de x-as nu **dag + uur** ipv alleen datum, dus diurnale patronen meteen leesbaar.
- ✅ Tooltip toont **volledige datum + tijd** plus relevante context-velden per metric (bv. dauwpunt + wet-bulb bij temperatuur, dauwpunt + temperatuur bij RV).
- ✅ Stats-strip met Min / Gem / Max / Laatste, kleur-gecodeerd per type, automatisch herberekend per range+metric.
- ✅ Gradient-fill onder de lijngrafiek (subtiel) voor meer diepte.
- ✅ Reference line voor gemiddelde + 0°C lijn (vorstgrens) op temperatuur.
- ✅ Smart tick-skipping op de x-as via `minTickGap=40` → geen overlap meer op kleine schermen.
- ✅ Active dot kleurt nu mee met de metric.

### 2026-04-25 — Weerstation historie ook op /weer/historie
- ✅ Nieuwe `OwnStationHistorySection` component aan top van /weer/historie pagina. Verschijnt automatisch wanneer de gebruiker een fysiek weerstation heeft gekoppeld; toont sensor-historie (24u/7d/30d/90d × temp/RV/druk/regen) net zoals op de detail-pagina, met station-picker als er meerdere zijn. Onder dezelfde pagina blijft de KNMI sectie intact (apart kopje "KNMI meetstations · Officiële regio-data").

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
