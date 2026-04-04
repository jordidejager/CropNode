-- Migration 040: Perceelprofiel & Grondmonsteranalyse
-- Twee nieuwe tabellen voor uitgebreide perceeldata en Eurofins rapport-extractie

-- ============================================
-- 1. parcel_profiles — Eén record per sub_parcel
-- ============================================

CREATE TABLE IF NOT EXISTS parcel_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sub_parcel_id TEXT NOT NULL REFERENCES sub_parcels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),

    -- Aanplantgegevens
    plantjaar INTEGER,
    gewas TEXT,
    ras TEXT,
    onderstam TEXT,
    bestuiversras TEXT,
    kloon_selectie TEXT,

    -- Plantverband
    rijafstand_m NUMERIC(4,2),
    plantafstand_m NUMERIC(4,2),
    plantdichtheid_per_ha INTEGER,
    aantal_bomen INTEGER,

    -- Teeltsysteem
    teeltsysteem TEXT,
    boomhoogte_m NUMERIC(3,1),
    rijrichting TEXT,

    -- Infrastructuur
    hagelnet TEXT,
    regenkap TEXT,
    insectennet TEXT,
    windscherm TEXT,
    steunconstructie TEXT,

    -- Waterhuishouding
    irrigatiesysteem TEXT,
    fertigatie_aansluiting TEXT,
    nachtvorstberegening TEXT,
    koelberegening TEXT,
    waterbron TEXT,
    drainage TEXT,

    -- Bodemkenmerken (handmatig of auto-fill vanuit grondmonster)
    grondsoort TEXT,
    bodem_ph NUMERIC(3,1),
    organische_stof_pct NUMERIC(4,1),
    klei_percentage NUMERIC(4,1),
    grondwaterniveau TEXT,

    -- Certificering
    certificeringen TEXT[] DEFAULT '{}',
    duurzaamheidsprogrammas TEXT[] DEFAULT '{}',

    -- Perceelhistorie
    voorgaand_gewas TEXT,
    herinplant TEXT,
    verwachte_rooidatum INTEGER,

    -- Meta
    notities TEXT,
    bodem_bron_analyse_id UUID, -- verwijzing naar soil_analyses record als bron
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT unique_profile_per_sub_parcel UNIQUE (sub_parcel_id)
);

CREATE INDEX IF NOT EXISTS idx_parcel_profiles_sub_parcel ON parcel_profiles(sub_parcel_id);
CREATE INDEX IF NOT EXISTS idx_parcel_profiles_user ON parcel_profiles(user_id);

-- RLS
ALTER TABLE parcel_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own parcel_profiles"
    ON parcel_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own parcel_profiles"
    ON parcel_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own parcel_profiles"
    ON parcel_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own parcel_profiles"
    ON parcel_profiles FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- 2. soil_analyses — Meerdere per sub_parcel
-- ============================================

CREATE TABLE IF NOT EXISTS soil_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sub_parcel_id TEXT NOT NULL REFERENCES sub_parcels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),

    -- Rapport metadata
    rapport_identificatie TEXT,
    lab TEXT DEFAULT 'eurofins_agro',
    datum_monstername DATE NOT NULL,
    datum_verslag DATE,
    geldig_tot INTEGER,
    bemonsterde_laag_cm TEXT,
    bemonsteringsmethode TEXT,
    grondsoort_rapport TEXT,

    -- Analyseresultaten
    n_totaal_bodemvoorraad_kg_ha NUMERIC,
    n_totaal_mg_kg NUMERIC,
    cn_ratio NUMERIC,
    n_leverend_vermogen_kg_ha NUMERIC,
    p_plantbeschikbaar_kg_ha NUMERIC,
    p_plantbeschikbaar_mg_kg NUMERIC,
    p_bodemvoorraad_kg_ha NUMERIC,
    p_bodemvoorraad_p_al NUMERIC,
    p_bodemvoorraad_p_100g NUMERIC,
    pw_getal NUMERIC,
    c_organisch_pct NUMERIC,
    organische_stof_pct NUMERIC,
    klei_percentage NUMERIC,
    bulkdichtheid_kg_m3 NUMERIC,

    -- Waarderingen (JSONB per parameter)
    waarderingen JSONB DEFAULT '{}',

    -- Bemestingsadviezen
    bemestingsadviezen JSONB DEFAULT '{}',

    -- RVO waarden
    rvo_p_al_mg_p2o5 NUMERIC,
    rvo_p_cacl2_mg_kg NUMERIC,

    -- Ruimtelijke data
    hoekpunten_rd JSONB,
    monsternamepunten_rd JSONB,
    oppervlakte_rapport_ha NUMERIC,

    -- Bestanden
    pdf_storage_path TEXT,
    pdf_filename TEXT,

    -- Extractie meta
    extractie_status TEXT DEFAULT 'pending',
    extractie_confidence NUMERIC,
    extractie_ruwe_output JSONB,
    handmatig_gecorrigeerd BOOLEAN DEFAULT false,

    -- Meta
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_soil_analyses_sub_parcel_date ON soil_analyses(sub_parcel_id, datum_monstername DESC);
CREATE INDEX IF NOT EXISTS idx_soil_analyses_user ON soil_analyses(user_id);

-- RLS
ALTER TABLE soil_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own soil_analyses"
    ON soil_analyses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own soil_analyses"
    ON soil_analyses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own soil_analyses"
    ON soil_analyses FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own soil_analyses"
    ON soil_analyses FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- 3. FK van parcel_profiles naar soil_analyses
-- ============================================

ALTER TABLE parcel_profiles
    ADD CONSTRAINT fk_bodem_bron_analyse
    FOREIGN KEY (bodem_bron_analyse_id)
    REFERENCES soil_analyses(id)
    ON DELETE SET NULL;

COMMENT ON TABLE parcel_profiles IS 'Uitgebreid perceelprofiel per subperceel: teelt, infrastructuur, bodem, certificering';
COMMENT ON TABLE soil_analyses IS 'Grondmonsteranalyses (Eurofins e.a.) met AI-geextraheerde waarden en bemestingsadviezen';
