# Team Tasks (Urenregistratie)

Time tracking for fruit farming: task types with hourly rates, direct registration, and live start/stop timers.

## Core Formulas

**Work day weighting:**
- Mon-Fri = 1.0 day, Saturday = 0.5 day, Sunday = 0.0 days
- `calculateWorkDays(startDate, endDate)` iterates each day applying weights (minimum: 1 day)

**Hours:** `Total = people_count × hours_per_person × days`

**Cost:** `Estimated cost = total_hours × task_type.default_hourly_rate`

`total_hours` is a STORED generated column in the database — calculated automatically.

## Timer Hour Suggestion

When stopping a timer session:
- Same day: calculate elapsed hours, subtract 1h lunch if > 5h, cap at daily max (9h weekday, 4.5h Saturday)
- Multi-day: use standard hours for the start date
- Round to nearest 0.5h, minimum 0.5h

## Default Task Types

Snoeien (€25), Dunnen (€22), Plukken (€20), Sorteren (€18), Onderhoud (€25)

## Two Registration Modes

1. **Direct**: historical/bulk entry with date range — auto-calculates work days
2. **Timer**: live start/stop tracking with suggested hours on stop

## Sub-Parcel Link

Tasks optionally link to a sub-parcel. The view `v_task_logs_enriched` joins task type name, sub-parcel name, and calculates `estimated_cost`.
