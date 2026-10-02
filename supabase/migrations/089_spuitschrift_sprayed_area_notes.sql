-- Gedeeltelijk gespoten percelen + opmerking bij een registratie.
--
-- spuitschrift.plot_areas: { "<sub_parcel_id>": <gespoten ha> } — alleen voor blokken die
--   NIET volledig zijn gespoten. Ontbreekt een blok, dan geldt het volledige oppervlak.
-- spuitschrift.notes: vrije opmerking bij de registratie.
-- parcel_history.sprayed_area: gespoten ha voor deze regel (NULL = volledig blok).
-- Doseringen blijven per hectare; middelverbruik = dosering × gespoten oppervlak.

ALTER TABLE public.spuitschrift ADD COLUMN IF NOT EXISTS plot_areas JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.spuitschrift ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.parcel_history ADD COLUMN IF NOT EXISTS sprayed_area NUMERIC;
