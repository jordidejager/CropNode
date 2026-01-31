-- Create sub_parcels table
CREATE TABLE IF NOT EXISTS public.sub_parcels (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
    parcel_id TEXT REFERENCES public.parcels(id) ON DELETE CASCADE,
    name TEXT,
    crop TEXT NOT NULL,
    variety TEXT NOT NULL,
    variety_mutant TEXT,
    rootstock TEXT,
    planting_year INTEGER,
    planting_distance_row FLOAT,
    planting_distance_tree FLOAT,
    area FLOAT NOT NULL,
    irrigation_type TEXT,
    
    -- New Weighted Multi-Input Columns
    mutants JSONB DEFAULT '[]',
    rootstocks JSONB DEFAULT '[]',
    interstocks JSONB DEFAULT '[]',
    planting_years JSONB DEFAULT '[]',
    planting_distances JSONB DEFAULT '[]',
    irrigation_percentage INT DEFAULT 100,
    frost_protection_type TEXT DEFAULT 'Nee',
    frost_protection_percentage INT DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_sub_parcels_parcel_id ON public.sub_parcels(parcel_id);

-- Create soil_samples table
CREATE TABLE IF NOT EXISTS public.soil_samples (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
    sub_parcel_id TEXT REFERENCES public.sub_parcels(id) ON DELETE CASCADE,
    sample_date DATE NOT NULL,
    n_total FLOAT,
    p_available FLOAT,
    k_value FLOAT,
    organic_matter FLOAT,
    ph FLOAT,
    pdf_url TEXT,
    raw_data JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_soil_samples_sub_parcel_id ON public.soil_samples(sub_parcel_id);

-- Create production_history table
CREATE TABLE IF NOT EXISTS public.production_history (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
    sub_parcel_id TEXT REFERENCES public.sub_parcels(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    tonnage FLOAT NOT NULL,
    size_distribution JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_production_history_sub_parcel_id ON public.production_history(sub_parcel_id);

-- Enable RLS
ALTER TABLE public.sub_parcels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soil_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_history ENABLE ROW LEVEL SECURITY;

-- Allow all for authenticated users
CREATE POLICY "Allow all for authenticated users on sub_parcels" ON public.sub_parcels FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users on soil_samples" ON public.soil_samples FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users on production_history" ON public.production_history FOR ALL USING (true);
