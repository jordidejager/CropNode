-- Migration 030: Add photo and GPS support to field_notes

-- Photo URL (public Supabase Storage URL)
ALTER TABLE field_notes
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- GPS coordinates
ALTER TABLE field_notes
  ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 7);
ALTER TABLE field_notes
  ADD COLUMN IF NOT EXISTS longitude DECIMAL(10, 7);

-- Spatial index for GPS queries
CREATE INDEX IF NOT EXISTS idx_field_notes_geo
  ON field_notes(latitude, longitude)
  WHERE latitude IS NOT NULL;

-- Storage bucket for field note photos (run via Supabase Dashboard if SQL fails)
INSERT INTO storage.buckets (id, name, public)
VALUES ('field-note-photos', 'field-note-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: authenticated users can upload to their own folder
CREATE POLICY "Users can upload own photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'field-note-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read access for all photos
CREATE POLICY "Public read access for field note photos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'field-note-photos');

-- Users can delete their own photos
CREATE POLICY "Users can delete own photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'field-note-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
