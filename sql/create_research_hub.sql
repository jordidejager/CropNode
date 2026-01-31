-- Create categories enum
CREATE TYPE research_category AS ENUM ('disease', 'storage', 'cultivation', 'general');

-- Create verdict enum
CREATE TYPE research_verdict AS ENUM ('practical', 'experimental', 'theoretical');

-- Create research_papers table
CREATE TABLE research_papers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    title TEXT NOT NULL,
    summary_ai TEXT,
    content_url TEXT, -- Link to PDF bucket
    category research_category NOT NULL DEFAULT 'general',
    verdict research_verdict NOT NULL DEFAULT 'theoretical',
    tags TEXT[] DEFAULT '{}',
    embedding VECTOR(768) -- For later use with RAG
);

-- Enable Row Level Security
ALTER TABLE research_papers ENABLE ROW LEVEL SECURITY;

-- Simple policy: authenticated users can read, only service role (or specific admins) can write
CREATE POLICY "Allow authenticated read access" ON research_papers
    FOR SELECT USING (auth.role() = 'authenticated');

-- Storage Bucket setup (Note: This might need to be run in the Supabase Dashboard if not supported via SQL for all providers, but standard Supabase SQL works)
-- Create bucket if not exists
INSERT INTO storage.buckets (id, name, public) 
VALUES ('research_pdfs', 'research_pdfs', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policy: Allow authenticated users to upload
CREATE POLICY "Allow authenticated uploads" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'research_pdfs' AND auth.role() = 'authenticated');

-- Storage Policy: Allow public read access to PDFs
CREATE POLICY "Allow public read access" ON storage.objects
    FOR SELECT USING (bucket_id = 'research_pdfs');
