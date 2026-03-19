-- Migration: BRP Nationaal Gewashistorie (2009-2025)
-- Publieke data van RVO, alle percelen in Nederland
-- Centroids-only (geen polygonen) voor snelle location-based queries

CREATE TABLE IF NOT EXISTS brp_gewas_nationaal (
    id SERIAL PRIMARY KEY,
    jaar SMALLINT NOT NULL,
    gewascode SMALLINT NOT NULL,
    gewas TEXT NOT NULL,
    category TEXT,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL
);

-- Compound index voor bbox-queries op locatie
CREATE INDEX IF NOT EXISTS idx_brp_nat_lat_lng ON brp_gewas_nationaal (lat, lng);

-- Index op jaar voor filtering
CREATE INDEX IF NOT EXISTS idx_brp_nat_jaar ON brp_gewas_nationaal (jaar);

-- Geen RLS nodig — dit is publieke open data van RVO
-- Geen user_id kolom — data is voor alle gebruikers beschikbaar

COMMENT ON TABLE brp_gewas_nationaal IS 'BRP gewasrotatie data voor heel Nederland (2009-2025). Bron: RVO/PDOK GeoPackage downloads. Centroids van alle gewaspercelen.';
