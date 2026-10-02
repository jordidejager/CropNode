-- parcel_history.harvest_year is NOT NULL zonder default; inserts zonder harvest_year faalden
-- stil (sinds april 2026 geen perceelhistorie meer → interval-/wachttijdcontroles misten
-- recente bespuitingen). Trigger leidt het oogstjaar af uit de datum (nov/dec → volgend jaar).

CREATE OR REPLACE FUNCTION public.parcel_history_set_harvest_year()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.harvest_year IS NULL THEN
    NEW.harvest_year := CASE
      WHEN EXTRACT(MONTH FROM COALESCE(NEW.date, now())) >= 11 THEN EXTRACT(YEAR FROM COALESCE(NEW.date, now()))::int + 1
      ELSE EXTRACT(YEAR FROM COALESCE(NEW.date, now()))::int
    END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_parcel_history_harvest_year ON public.parcel_history;
CREATE TRIGGER trg_parcel_history_harvest_year BEFORE INSERT OR UPDATE OF date ON public.parcel_history
  FOR EACH ROW EXECUTE FUNCTION public.parcel_history_set_harvest_year();
