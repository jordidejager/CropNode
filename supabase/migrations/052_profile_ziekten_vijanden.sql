-- Migration 052: Perceelprofiel uitbreiding — bestuiver afstand, ziekten/plagen, natuurlijke vijanden

ALTER TABLE parcel_profiles ADD COLUMN IF NOT EXISTS bestuiver_afstand INTEGER;
ALTER TABLE parcel_profiles ADD COLUMN IF NOT EXISTS ziekten_plagen JSONB DEFAULT '{}'::jsonb;
ALTER TABLE parcel_profiles ADD COLUMN IF NOT EXISTS natuurlijke_vijanden JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN parcel_profiles.bestuiver_afstand IS 'Afstand in meters tussen bestuiverbomen (om de X meter)';
COMMENT ON COLUMN parcel_profiles.ziekten_plagen IS 'Historische ziektedruk per ziekte/plaag, bijv. {"schurft": "hoog", "fruitmot": "laag"}';
COMMENT ON COLUMN parcel_profiles.natuurlijke_vijanden IS 'Aanwezigheid natuurlijke vijanden, bijv. {"oorwormen": "veel", "roofmijten": "matig"}';
