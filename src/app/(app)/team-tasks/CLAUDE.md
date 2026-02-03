# CLAUDE.md - Team Tasks (Urenregistratie)

## Doel en Scope

Urenregistratie systeem voor fruitteelt met werkdag-gewogen berekeningen, live timers, en kostenraming. Integreert met perceelsysteem voor locatie-specifieke tracking.

**Kernfunctionaliteit:**
- Taaktypen met configureerbare uurtarieven
- Directe registratie met datumbereik
- Live start/stop timer functionaliteit
- Automatische werkdagen berekening
- Kostenraming per taak

---

## Componenten en Verantwoordelijkheden

### Page Component

| Component | Locatie | Verantwoordelijkheid |
|-----------|---------|---------------------|
| `page.tsx` | `/team-tasks/page.tsx` | Complete UI (51KB) - forms, timer, history |

### UI Elementen (in page.tsx)

- **Direct Registration Form** - Historische uren invoer
- **Timer Mode** - Live start/stop tracking
- **Stats Cards** - Vandaag/week/top activiteit
- **History Table** - Recente registraties

---

## Supabase Tabellen

### Task Types

```sql
task_types
├── id UUID PRIMARY KEY
├── name TEXT NOT NULL UNIQUE
├── default_hourly_rate DECIMAL(10,2) DEFAULT 25.00
├── user_id UUID → auth.users(id)
├── created_at TIMESTAMPTZ
└── updated_at TIMESTAMPTZ
```

**Default Data:**
| Taak | Uurtarief |
|------|-----------|
| Snoeien | €25.00 |
| Dunnen | €22.00 |
| Plukken | €20.00 |
| Sorteren | €18.00 |
| Onderhoud | €25.00 |

### Task Logs

```sql
task_logs
├── id UUID PRIMARY KEY
├── start_date DATE NOT NULL
├── end_date DATE NOT NULL
├── days DECIMAL(5,2) NOT NULL CHECK (days > 0)
├── sub_parcel_id TEXT → sub_parcels(id) -- Optioneel
├── task_type_id UUID NOT NULL → task_types(id)
├── people_count INTEGER NOT NULL CHECK (> 0)
├── hours_per_person DECIMAL(5,2) NOT NULL
├── total_hours DECIMAL(10,2) GENERATED ALWAYS AS
│   (people_count * hours_per_person * days) STORED
├── notes TEXT
├── user_id UUID → auth.users(id)
├── created_at TIMESTAMPTZ
└── updated_at TIMESTAMPTZ
```

### Active Task Sessions

```sql
active_task_sessions
├── id UUID PRIMARY KEY
├── task_type_id UUID NOT NULL → task_types(id)
├── sub_parcel_id TEXT → sub_parcels(id) -- Optioneel
├── start_time TIMESTAMPTZ NOT NULL
├── people_count INTEGER NOT NULL CHECK (> 0)
├── notes TEXT
└── created_at TIMESTAMPTZ
```

### Views

```sql
v_task_logs_enriched
├── id, start_date, end_date, days
├── sub_parcel_name     -- "PerceelNaam (Ras)"
├── task_type_name
├── default_hourly_rate
├── people_count, hours_per_person, total_hours
├── estimated_cost      -- total_hours × rate
├── notes, created_at, updated_at
```

---

## Business Rules

### Werkdagen Berekening

| Dag | Gewicht |
|-----|---------|
| Maandag - Vrijdag | 1.0 |
| Zaterdag | 0.5 |
| Zondag | 0.0 |

**Functie:** `calculateWorkDays(startDate, endDate)`
```typescript
// Itereert door elke dag
// Past dag-gewichten toe
// Minimum return: 1 dag
// Returns: decimal (bijv. 2.5)
```

### Uren Formule

```
Totaal Uren = Aantal Mensen × Uren per Persoon × Dagen

Voorbeeld:
2 mensen × 9 uur × 1.5 dagen = 27 totaal uren
```

### Kosten Formule

```
Geschatte Kosten = Totaal Uren × Uurtarief Taaktype

Voorbeeld:
27 uren × €25.00 = €675.00
```

### Standaard Werkuren

| Type | Uren |
|------|------|
| Weekdag (Ma-Vr) | 9 uur (8:00-18:00 minus 1 uur lunch) |
| Zaterdag | 4.5 uur |
| Zondag | 0 uur |
| Default registratie | 9 uur/persoon |

### Timer Uur Suggestie

Bij stoppen actieve sessie:
```typescript
// Zelfde dag scenario:
if (sessionStartDay === currentDay) {
  const workedHours = calculateWorkedHours(startTime, endTime)
  // Trek lunch af als > 5 uur
  if (workedHours > 5) workedHours -= 1
  // Cap at daily max
  suggestedHours = Math.min(workedHours, standardHours)
}

// Multi-day scenario:
else {
  suggestedHours = getStandardHoursForDay(startDate)
}

// Afronding
suggestedHours = Math.round(suggestedHours * 2) / 2  // Naar 0.5
suggestedHours = Math.max(0.5, suggestedHours)       // Min 0.5
```

---

## State Management

### React Query Hooks

```typescript
useTaskTypes() → TaskType[]
useTaskLogs() → TaskLog[]
useActiveTaskSessions() → ActiveTaskSession[]
useTaskStats() → {
  todayHours: number,
  weekCost: number,
  topActivity: string
}
```

### Query Keys

```typescript
taskTypes: ['task-types']
taskLogs: ['task-logs']
taskStats: ['task-stats']
activeTaskSessions: ['active-task-sessions']
```

### Cache Stale Times

| Query | Stale Time |
|-------|------------|
| Task types | 30 minuten |
| Task logs | 30 seconden |
| Task stats | 1 minuut |
| Active sessions | 10 seconden (live data) |

### Auto-Invalidation

```typescript
// Bij taak toevoegen/verwijderen:
invalidate(['task-logs'])
invalidate(['task-stats'])

// Bij sessie stoppen:
invalidate(['task-logs'])
invalidate(['task-stats'])
invalidate(['active-task-sessions'])
```

---

## Data Flow

### Directe Registratie Flow

```
User vult formulier in
    │
    ├─ Selecteer taaktype
    ├─ Selecteer datumbereik
    ├─ Aantal mensen
    ├─ Uren per persoon (default 9)
    ├─ Optioneel: subperceel, notities
    │
    └─ Submit
         │
         ├─ calculateWorkDays(start, end) → days
         │
         ├─ addTaskLog({
         │    task_type_id,
         │    start_date, end_date, days,
         │    people_count, hours_per_person,
         │    sub_parcel_id, notes
         │  })
         │
         └─ Invalidate caches
```

### Timer Flow

```
User start timer
    │
    ├─ Selecteer taaktype
    ├─ Aantal mensen
    ├─ Optioneel: subperceel, notities
    │
    └─ Start
         │
         ├─ addActiveTaskSession({
         │    task_type_id,
         │    start_time: NOW,
         │    people_count,
         │    sub_parcel_id, notes
         │  })
         │
         └─ Timer display start
              │
              ├─ Updates elke 60 seconden
              │
              └─ User klikt Stop
                   │
                   ├─ Calculate suggested hours
                   │
                   ├─ Show end-time picker
                   │
                   └─ Confirm
                        │
                        ├─ deleteActiveTaskSession()
                        │
                        ├─ addTaskLog()
                        │
                        └─ Invalidate caches
```

### Stats Berekening

```typescript
getTaskStats()
    │
    ├─ todayHours: SUM(total_hours)
    │   WHERE start_date <= today AND end_date >= today
    │
    ├─ weekCost: SUM(estimated_cost)
    │   WHERE start_date >= 7 days ago
    │
    └─ topActivity: task_type with MAX(SUM(total_hours))
        WHERE month = current month
```

---

## Form Validatie

### Task Log Entry

| Veld | Vereist | Validatie |
|------|---------|-----------|
| task_type_id | Ja | Moet bestaan in task_types |
| people_count | Ja | ≥ 1 |
| hours_per_person | Ja | ≥ 0.5 |
| days | Ja | > 0 |
| start_date | Ja | Valid date |
| end_date | Ja | ≥ start_date |
| sub_parcel_id | Nee | Moet bestaan indien opgegeven |
| notes | Nee | String |

### Active Session

| Veld | Vereist | Validatie |
|------|---------|-----------|
| task_type_id | Ja | Moet bestaan |
| start_time | Ja | Valid timestamp |
| people_count | Ja | ≥ 1 |
| sub_parcel_id | Nee | Moet bestaan indien opgegeven |
| notes | Nee | String |

---

## UI Patterns

### Calculator Interface

Visual formula display:
```
[ 2 mensen ] × [ 9 uur ] × [ 1.5 dagen ] = 27 uur
                                          €675.00
```

Updates in real-time bij invoer wijzigingen.

### Stats Cards (3x)

| Card | Data | Icon |
|------|------|------|
| Vandaag | totalHours + " uur" | Clock |
| Deze week | "€" + weekCost | Euro |
| Top activiteit | taskTypeName | Trophy |

### Timer Display

```
[ Snoeien ] - gestart om 08:00
   ⏱️ 2 uur 34 minuten

   [Bewerk start] [Stop]
```

- Edit button: wijzig starttijd
- Stop button: open end-time modal

### History Table

| Kolom | Sorteerbaar |
|-------|-------------|
| Datum | Ja (default DESC) |
| Taak | Nee |
| Perceel | Nee |
| Mensen | Nee |
| Uren | Nee |
| Kosten | Nee |
| Acties | Nee (delete) |

Default: laatste 10 entries, expandable

---

## Design Decisions

### Werkdag Weging
Weekenden anders behandelen:
- Zaterdag = halve dag (kortere shift)
- Zondag = geen werk (meeste teeltbedrijven)
- Realistische kostenraming

### Generated Column
`total_hours` als STORED generated column:
- Database berekent automatisch
- Consistency gegarandeerd
- Geen application-side fouten

### Gescheiden Timer Mode
Twee registratie modi:
- Direct: voor historische/bulk invoer
- Timer: voor real-time tracking

Verschillende use cases, verschillende UX.

### Subperceel Optioneel
Niet verplicht voor taak logging:
- Algemene taken (onderhoud)
- Niet-perceelgebonden werk
- Flexibiliteit voor gebruiker

### Live Timer Updates
60-seconden interval:
- Balans tussen accuracy en performance
- Geen excessieve re-renders
- Battery-friendly op mobile

### Lunch Break Automaat
Auto-deductie bij > 5 uur:
- Realistische werkuren
- Geen handmatige correctie nodig
- Configureerbaar per bedrijf (toekomst)

---

## Berekening Voorbeelden

### Voorbeeld 1: Directe Registratie

```
Taak: Snoeien (€25/uur)
Periode: Maandag 29 jan - Woensdag 31 jan
Mensen: 3
Uren/persoon: 8

Berekening:
  Dagen = 1 + 1 + 1 = 3
  Totaal = 3 × 8 × 3 = 72 uur
  Kosten = 72 × €25 = €1.800
```

### Voorbeeld 2: Weekend Werk

```
Taak: Plukken (€20/uur)
Periode: Vrijdag 17 mei - Zondag 19 mei
Mensen: 2
Uren/persoon: 6

Berekening:
  Dagen = 1 (vr) + 0.5 (za) + 0 (zo) = 1.5
  Totaal = 2 × 6 × 1.5 = 18 uur
  Kosten = 18 × €20 = €360
```

### Voorbeeld 3: Timer Sessie (Zelfde Dag)

```
Gestart: 08:00 vandaag
Gestopt: 17:30 vandaag
Mensen: 1

Berekening:
  Verstreken: 9.5 uur
  Minus lunch (>5u): 9.5 - 1 = 8.5 uur
  Cap at max: min(8.5, 9) = 8.5 uur
  Totaal = 1 × 8.5 × 1 = 8.5 uur
```

---

## Relatie met Perceelsysteem

### Sub-Parcel Koppeling

```typescript
task_logs.sub_parcel_id → sub_parcels.id
```

**View genereert leesbare naam:**
```sql
COALESCE(
  CONCAT(p.name, ' (', sp.variety, ')'),
  p.name
) AS sub_parcel_name
```

### Use Cases

- Snoeien per perceelblok
- Dunnen per ras
- Plukken per hectare tracking
- Analyse per gewas type
