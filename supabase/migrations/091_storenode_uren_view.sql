-- Uren per dag voor StoreNode (gedeeld contract): public.v_storenode_uren
-- Eén rij per dag × taak × (sub)perceel × registratie:
--   user_id, datum, parcel_id (hoofdperceel, ook bij subperceel), sub_parcel_id (null = heel perceel),
--   taak, personen, uren (manuren die dag), uurtarief, kosten, lopend (lopende klus = schatting)
-- Bronnen:
--   task_logs            — meerdaagse registraties uitgesplitst per dag (som = total_hours;
--                          verdeling naar werkdag-gewicht ma–vr 1, za 0,5, zo 0)
--   active_task_sessions — per dag van start t/m vandaag; day_overrides gaan voor, anders
--                          werkschema (eerste dag vanaf starttijd, vandaag tot nu)
-- Datums/tijden in Europe/Amsterdam.

-- Netto werkuren volgens het werkschema van een teler op een dag, optioneel tussen van/tot.
CREATE OR REPLACE FUNCTION public.werkschema_netto_uren(
  p_user_id UUID, p_datum DATE, p_van TIME DEFAULT NULL, p_tot TIME DEFAULT NULL
) RETURNS NUMERIC LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_dow INT := EXTRACT(DOW FROM p_datum)::INT;
  v_work BOOLEAN; v_start TIME; v_end TIME; v_breaks JSONB; v_break_min INT;
  v_s INT; v_e INT; v_pause INT := 0; b JSONB; bs INT; be INT;
BEGIN
  SELECT is_workday, start_time, end_time, breaks, break_minutes
    INTO v_work, v_start, v_end, v_breaks, v_break_min
    FROM public.work_schedules WHERE user_id = p_user_id AND day_of_week = v_dow LIMIT 1;
  IF NOT FOUND THEN
    -- Standaardschema van de app (DEFAULT_WORK_SCHEDULE)
    IF v_dow = 0 THEN RETURN 0; END IF;
    v_work := true; v_start := '07:30';
    v_end := CASE WHEN v_dow = 6 THEN '12:00'::time ELSE '17:00'::time END;
    v_breaks := CASE WHEN v_dow = 6 THEN '[]'::jsonb ELSE '[{"start":"12:00","end":"12:30"}]'::jsonb END;
  END IF;
  IF NOT COALESCE(v_work, false) OR v_start IS NULL OR v_end IS NULL THEN RETURN 0; END IF;
  IF v_breaks IS NULL OR jsonb_array_length(v_breaks) = 0 THEN
    v_breaks := CASE WHEN COALESCE(v_break_min, 0) > 0
      THEN jsonb_build_array(jsonb_build_object('start', '12:00', 'end', to_char(time '12:00' + make_interval(mins => v_break_min), 'HH24:MI')))
      ELSE '[]'::jsonb END;
  END IF;
  v_s := EXTRACT(EPOCH FROM GREATEST(v_start, COALESCE(p_van, v_start)))::INT / 60;
  v_e := EXTRACT(EPOCH FROM LEAST(v_end, COALESCE(p_tot, v_end)))::INT / 60;
  IF v_e <= v_s THEN RETURN 0; END IF;
  FOR b IN SELECT * FROM jsonb_array_elements(v_breaks) LOOP
    bs := EXTRACT(EPOCH FROM (b->>'start')::time)::INT / 60;
    be := EXTRACT(EPOCH FROM (b->>'end')::time)::INT / 60;
    IF LEAST(be, v_e) > GREATEST(bs, v_s) THEN v_pause := v_pause + (LEAST(be, v_e) - GREATEST(bs, v_s)); END IF;
  END LOOP;
  RETURN GREATEST(0, (v_e - v_s - v_pause)::NUMERIC / 60);
END $$;

CREATE OR REPLACE VIEW public.v_storenode_uren WITH (security_invoker = on) AS
WITH logs AS (
  SELECT tl.*, d::date AS datum,
         CASE EXTRACT(DOW FROM d) WHEN 0 THEN 0 WHEN 6 THEN 0.5 ELSE 1 END::numeric AS gewicht,
         (tl.end_date - tl.start_date + 1) AS kalenderdagen,
         SUM(CASE EXTRACT(DOW FROM d) WHEN 0 THEN 0 WHEN 6 THEN 0.5 ELSE 1 END) OVER (PARTITION BY tl.id) AS gewicht_totaal
  FROM public.task_logs tl
  CROSS JOIN LATERAL generate_series(tl.start_date, tl.end_date, interval '1 day') d
),
sessie_dagen AS (
  SELECT s.*, d::date AS datum,
         (s.start_time AT TIME ZONE 'Europe/Amsterdam') AS start_lokaal,
         (now() AT TIME ZONE 'Europe/Amsterdam') AS nu_lokaal
  FROM public.active_task_sessions s
  CROSS JOIN LATERAL generate_series(
    (s.start_time AT TIME ZONE 'Europe/Amsterdam')::date,
    (now() AT TIME ZONE 'Europe/Amsterdam')::date,
    interval '1 day') d
),
sessie_uren AS (
  SELECT sd.*, o.value AS override,
         public.werkschema_netto_uren(
           sd.user_id, sd.datum,
           CASE WHEN sd.datum = sd.start_lokaal::date THEN sd.start_lokaal::time END,
           CASE WHEN sd.datum = sd.nu_lokaal::date THEN sd.nu_lokaal::time END) AS schema_uren
  FROM sessie_dagen sd
  LEFT JOIN LATERAL (
    SELECT value FROM jsonb_array_elements(COALESCE(sd.day_overrides, '[]'::jsonb)) v(value)
    WHERE v.value->>'date' = to_char(sd.datum, 'YYYY-MM-DD') LIMIT 1
  ) o ON true
)
SELECT l.user_id,
       l.datum,
       COALESCE(l.parcel_id, sp.parcel_id) AS parcel_id,
       l.sub_parcel_id,
       tt.name AS taak,
       l.people_count::numeric AS personen,
       ROUND(COALESCE(l.total_hours, l.people_count * l.hours_per_person * l.days)
             * CASE WHEN l.gewicht_totaal > 0 THEN l.gewicht / l.gewicht_totaal ELSE 1.0 / l.kalenderdagen END, 2) AS uren,
       tt.default_hourly_rate AS uurtarief,
       ROUND(COALESCE(l.total_hours, l.people_count * l.hours_per_person * l.days)
             * CASE WHEN l.gewicht_totaal > 0 THEN l.gewicht / l.gewicht_totaal ELSE 1.0 / l.kalenderdagen END
             * tt.default_hourly_rate, 2) AS kosten,
       false AS lopend
FROM logs l
JOIN public.task_types tt ON tt.id = l.task_type_id
LEFT JOIN public.sub_parcels sp ON sp.id = l.sub_parcel_id
WHERE l.gewicht > 0 OR l.gewicht_totaal = 0
UNION ALL
SELECT su.user_id,
       su.datum,
       COALESCE(su.parcel_id, sp.parcel_id) AS parcel_id,
       su.sub_parcel_id,
       tt.name AS taak,
       COALESCE((su.override->>'peopleCount')::numeric, su.people_count::numeric) AS personen,
       ROUND(CASE WHEN su.override IS NOT NULL
                  THEN (su.override->>'peopleCount')::numeric * (su.override->>'hoursPerPerson')::numeric
                  ELSE su.people_count * ROUND(su.schema_uren * 2) / 2 END, 2) AS uren,
       tt.default_hourly_rate AS uurtarief,
       ROUND(CASE WHEN su.override IS NOT NULL
                  THEN (su.override->>'peopleCount')::numeric * (su.override->>'hoursPerPerson')::numeric
                  ELSE su.people_count * ROUND(su.schema_uren * 2) / 2 END * tt.default_hourly_rate, 2) AS kosten,
       true AS lopend
FROM sessie_uren su
JOIN public.task_types tt ON tt.id = su.task_type_id
LEFT JOIN public.sub_parcels sp ON sp.id = su.sub_parcel_id
WHERE su.override IS NOT NULL OR su.schema_uren > 0;

GRANT SELECT ON public.v_storenode_uren TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.werkschema_netto_uren(UUID, DATE, TIME, TIME) TO authenticated, service_role;
