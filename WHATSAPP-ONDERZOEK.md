# WhatsApp Integratie Onderzoek - CropNode Slimme Invoer

**Datum:** 8 maart 2026
**Status:** Onderzoek (nog niet geïmplementeerd)

---

## 1. Doel

Telers kunnen via een WhatsApp-bot:
- **Registraties invoeren** in natuurlijke taal (zelfde als Slimme Invoer)
  - Voorbeeld: _"Vandaag alle conference gespoten met 1,5 kg captan per ha"_
- **Informatie ophalen** (logboek, voorraad, perceelhistorie)
  - Voorbeeld: _"Wat heb ik vorige week gespoten op perceel 3?"_

---

## 2. Opties Overzicht

| Optie | Type | Kosten/maand (50 telers) | Risico | Aanbeveling |
|-------|------|--------------------------|--------|-------------|
| **Meta Cloud API** | Officieel | €0 - €15 | Laag | ⭐ Beste keuze |
| **Twilio** | Officieel (reseller) | €15 - €50 | Laag | Goed alternatief |
| **Green API** | Semi-officieel | €0 - €24 | Middel | Budget optie |
| **whatsapp-web.js** | Unofficial (open source) | €0 | Hoog (ban) | Alleen dev/test |
| **Baileys** | Unofficial (open source) | €0 | Hoog (ban) | Alleen dev/test |

---

## 3. Optie A: Meta WhatsApp Cloud API (Aanbevolen)

### Wat is het?
De officiële gratis API van Meta, gehost in de cloud. Geen eigen server nodig.

### Kosten

**Prijsmodel (sinds nov 2024):**
Meta is overgestapt van per-conversatie naar per-bericht pricing:

| Berichttype | Kosten (West-Europa) | Toelichting |
|-------------|---------------------|-------------|
| **Service/utility** (template) | ~€0,003 - €0,01 per bericht | Bevestigingen, updates |
| **Marketing** (template) | ~€0,05 - €0,08 per bericht | Promotie, campagnes |
| **Reactie binnen 24u** (free-form) | **Gratis** | Antwoord op inkomend bericht |

**Gratis elementen:**
- ✅ 1.000 gratis service-gesprekken per maand (tot nov 2024 model)
- ✅ Berichten als reactie op klant-initiatie binnen 24 uur zijn **gratis**
- ✅ De Cloud API zelf is **gratis** te gebruiken
- ✅ Geen maandelijkse abonnementskosten

**Kostenscenario CropNode (50 telers):**

Aanname: elke teler stuurt ~5 berichten/dag, 6 maanden/jaar (spuitseizoen)
- Inkomende berichten: gratis
- Uitgaande reacties binnen 24u: **gratis**
- Template-berichten (notificaties): ~€0,003 × 50 × 30 = **~€4,50/maand**
- **Totaal: €0 - €5/maand** (mogelijk volledig gratis bij alleen reactief gebruik)

### Vereisten
1. **Meta Business Account** (gratis)
2. **Facebook Business verificatie** (gratis, paar dagen)
3. **Telefoonnummer** (dedicated nummer voor de bot)
4. **Webhook endpoint** (Next.js API route)
5. **App Review** (voor productie, paar weken)

### Voordelen
- Officieel & betrouwbaar
- Gratis voor reactief gebruik (bot antwoordt op berichten van telers)
- Geen ban-risico
- Goede documentatie
- Schaalbaar

### Nadelen
- Facebook Business verificatie vereist (bureaucratie)
- 24-uurs venster: na 24u moet je template-berichten gebruiken (kosten geld)
- Template-berichten moeten goedgekeurd worden door Meta

---

## 4. Optie B: Twilio WhatsApp API

### Wat is het?
Twilio is een reseller/BSP (Business Solution Provider) van de WhatsApp Business API.

### Kosten

| Component | Kosten |
|-----------|--------|
| Twilio basisfee | $0,005 per bericht (in + uit) |
| Meta fee (utility template) | $0,003 per bericht |
| Meta fee (marketing template) | Variabel |
| Meta fee (free-form in 24u) | Gratis |
| Twilio telefoonnummer | ~$1/maand |

**Kostenscenario CropNode (50 telers):**
- 50 telers × 10 berichten/dag (in+uit) × 30 dagen = 15.000 berichten
- Twilio fee: 15.000 × $0,005 = **$75/maand**
- Meta fee: grotendeels gratis (reactief)
- **Totaal: ~€50-80/maand**

### Voordelen
- Heel eenvoudige setup
- **Gratis sandbox** voor ontwikkeling/testen
- Excellente documentatie & SDK
- Goede Node.js library

### Nadelen
- **Duurder** dan directe Meta API (Twilio markup per bericht)
- Extra dependency

---

## 5. Optie C: Green API

### Wat is het?
Een gateway-service die WhatsApp-toegang biedt via hun eigen API.

### Kosten

| Plan | Kosten | Limieten |
|------|--------|----------|
| Developer | **Gratis** | 3 chats, 100 checks/maand |
| Business | $12/maand | Onbeperkt chats |
| Chatbot | $24/maand | + telefoonvrij, onbeperkt |
| Partner | $0,40/dag | Enterprise |

### Voordelen
- Goedkoop
- Eenvoudige API
- Gratis tier voor ontwikkeling

### Nadelen
- Niet-officieel (geen Meta BSP)
- Onduidelijk of het WhatsApp ToS respecteert
- Beperkte gratis tier (3 chats = onbruikbaar voor productie)
- Mogelijke betrouwbaarheidsproblemen

---

## 6. Optie D: Unofficial Libraries (whatsapp-web.js / Baileys)

### Wat zijn het?
Open-source Node.js libraries die WhatsApp Web reverse-engineeren.

| Library | Licentie | Taal | Status |
|---------|----------|------|--------|
| whatsapp-web.js | Apache 2.0 | JavaScript | Actief |
| Baileys | MIT | TypeScript | Actief (179+ contributors) |

### Kosten
**€0 - Volledig gratis**

### Hoe werkt het?
- Simuleert een WhatsApp Web sessie via WebSocket
- Gebruikt je eigen WhatsApp-nummer
- Draait op je eigen server

### Risico's (BELANGRIJK)
- ⚠️ **Account-ban**: WhatsApp detecteert automation en kan je nummer permanent blokkeren
- ⚠️ **ToS schending**: Expliciet in strijd met WhatsApp gebruiksvoorwaarden
- ⚠️ **Onbetrouwbaar**: Kan breken bij WhatsApp Web updates
- ⚠️ **Geen support**: Community-only
- ⚠️ Baileys zelf waarschuwt: _"not affiliated with WhatsApp"_ en raadt af voor bulk messaging

### Geschikt voor
- Lokaal testen/prototyping
- Persoonlijke projecten
- **NIET voor productie met klanten**

---

## 7. Gratis Strategie (Aanbevolen)

### Meta Cloud API + Reactief Model = €0/maand

**Hoe het gratis kan:**

1. **Alleen reageren op berichten van telers** (niet proactief sturen)
   - Teler stuurt bericht → bot antwoordt binnen 24u → **gratis**
   - Geen template-berichten nodig als je altijd binnen 24u reageert

2. **Geen marketing-berichten sturen**
   - Alleen service/utility berichten

3. **Kosten alleen bij proactieve notificaties:**
   - Bijv. "Uw spuitmiddel X heeft morgen een wachttijd" → template nodig → ~€0,003
   - Bij 50 telers × 2 notificaties/week = ~€1,20/maand

### Architectuur voor gratis model

```
Teler stuurt WhatsApp bericht
        ↓
Meta Webhook → POST /api/whatsapp/webhook
        ↓
Bot ontvangt tekst (bijv. "Gespoten captan 1,5 kg conference")
        ↓
Genkit AI parseert (bestaande parse-spray-application flow)
        ↓
Validatie (bestaande validation-service)
        ↓
Opslaan in logbook (bestaande store.ts)
        ↓
Bot stuurt bevestiging terug (gratis, want reactie binnen 24u)
        ↓
Teler ontvangt: "✅ Geregistreerd: Captan 1,5 kg/ha op Conference percelen"
```

---

## 8. Technische Implementatie (High-Level)

### Wat al bestaat en hergebruikt kan worden
- ✅ **Genkit AI parsing** (`parse-spray-application.ts`) - parseert natuurlijke taal
- ✅ **Validatie service** (`validation-service.ts`) - CTGB compliance checks
- ✅ **Database operaties** (`store.ts`) - logbook CRUD
- ✅ **Supabase auth** - gebruikersbeheer
- ✅ **Next.js API routes** - webhook endpoint

### Wat nieuw gebouwd moet worden
1. **Webhook endpoint**: `POST /api/whatsapp/webhook` (verificatie + berichtverwerking)
2. **WhatsApp client service**: berichten versturen via Meta Cloud API
3. **Gebruiker-mapping**: telefoonnummer → Supabase user_id
4. **Conversatie-context**: bijhouden van lopende invoer-sessies
5. **Commando-parser**: herkennen of teler wil invoeren of opvragen
6. **Response formatter**: gestructureerde WhatsApp-berichten (met emoji, lijsten)

### Database uitbreiding
```sql
-- Nieuwe tabel voor WhatsApp sessies
CREATE TABLE whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL,
  user_id UUID REFERENCES profiles(id),
  conversation_state JSONB DEFAULT '{}',
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Telefoonnummer koppeling aan gebruiker
ALTER TABLE profiles ADD COLUMN phone_number TEXT UNIQUE;
```

### Berichtflow voorbeelden

**Registratie invoeren:**
```
Teler: "Vandaag alle conference gespoten met 1,5 kg captan"
Bot:   "✅ Bespuiting geregistreerd:
        📅 8 maart 2026
        🌳 Conference (3 percelen)
        💊 Captan - 1,5 kg/ha
        ⚠️ Wachttijd: 28 dagen (5 april 2026)

        Klopt dit? Antwoord 'ja' om te bevestigen."
Teler: "ja"
Bot:   "✅ Opgeslagen in je spuitschrift!"
```

**Informatie opvragen:**
```
Teler: "Wat heb ik vorige week gespoten?"
Bot:   "📋 Bespuitingen afgelopen week:

        4 mrt - Elstar: Captan 1,5 kg/ha
        5 mrt - Conference: Score 0,3 L/ha
        6 mrt - Alle percelen: Delan 0,5 kg/ha"
```

---

## 9. Vergelijkingstabel

| Criterium | Meta Cloud API | Twilio | Green API | Unofficial |
|-----------|---------------|--------|-----------|------------|
| **Kosten (50 telers)** | €0-5/maand | €50-80/maand | €12-24/maand | €0 |
| **Betrouwbaarheid** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **Setup complexiteit** | Middel | Laag | Laag | Laag |
| **Ban-risico** | Geen | Geen | Laag-Middel | Hoog |
| **Documentatie** | Goed | Excellent | Matig | Community |
| **Node.js support** | Goed | Excellent | Goed | Excellent |
| **Geschikt productie** | ✅ | ✅ | ⚠️ | ❌ |
| **Facebook verificatie** | Vereist | Vereist | Niet nodig | Niet nodig |

---

## 10. Aanbeveling

### Fase 1: Prototype (gratis)
- Gebruik **Twilio Sandbox** (gratis) om de flow te testen
- Bouw webhook + integratie met bestaande Genkit parsing
- Test met 2-3 telers

### Fase 2: Productie (€0-5/maand)
- Migreer naar **Meta WhatsApp Cloud API** (direct, zonder tussenpartij)
- Facebook Business verificatie doorlopen
- Reactief model: alleen antwoorden op berichten = **gratis**
- Optionele template-berichten voor notificaties = ~€5/maand

### Fase 3: Schalen
- Eventueel proactieve meldingen toevoegen (wachttijden, weer-alerts)
- Multi-device support
- Groepschats voor teams

---

## 11. Tijdsinschatting Implementatie

| Component | Geschatte inspanning |
|-----------|---------------------|
| Webhook endpoint + verificatie | Klein |
| WhatsApp client service | Klein |
| Gebruiker-mapping (telefoon → user) | Klein |
| Conversatie-context management | Middel |
| Commando herkenning (invoer vs opvraag) | Middel |
| Response formatting | Klein |
| Bevestigings-flow (ja/nee) | Klein |
| Testen & debugging | Middel |

---

## 12. Conclusie

**WhatsApp-integratie is haalbaar en kan (vrijwel) gratis** via de officiële Meta Cloud API met een reactief model. De bestaande Genkit AI-parsing en validatie-pipeline van CropNode kunnen volledig hergebruikt worden. De grootste investering zit in het bouwen van de webhook-laag en conversatie-management, niet in de WhatsApp-koppeling zelf.

De kern: **als de bot alleen antwoordt op berichten van telers (en niet proactief stuurt), zijn de kosten €0/maand.**
