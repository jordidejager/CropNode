-- 099: bestuivers per blok (sub_parcel).
-- Bestuiverrassen staan tussen het hoofdras in hetzelfde blok (bijv. Golden Delicious in Tessa). Ze krijgen geen
-- eigen blok/oppervlakte (dat zou het spuitschrift en de hectares veranderen), maar een lijst rassen op het blok.
-- StoreNode toont ze als eigen perceel ("Steketee – Bestuivers") zodat de oogst als eigen partij geboekt kan worden.
-- Alleen een kolom erbij; de bestaande RLS op sub_parcels (eigen rijen) geldt ook hiervoor.
ALTER TABLE public.sub_parcels
  ADD COLUMN IF NOT EXISTS pollinator_varieties text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.sub_parcels.pollinator_varieties IS
  'Bestuiverrassen in dit blok (geen eigen oppervlakte). StoreNode maakt er een eigen perceel "<perceel> – Bestuivers" van.';
