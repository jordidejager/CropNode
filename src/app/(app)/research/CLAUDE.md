# Research Hub

Knowledge management: research papers, pests & diseases encyclopedia, and field signals (team observation feed).

## Three Components

1. **Research papers** — PDF uploads with AI summaries, categorized as `disease`/`storage`/`cultivation`/`general`, verdict: `practical`/`experimental`/`theoretical`
2. **Pests & diseases encyclopedia** — 20+ entries with lifecycle timelines (12-month activity data), symptoms (staged progression), and control methods (biological/cultural/chemical)
3. **Field signals** — social feed for team observations with tags, likes, comments. Min 1 tag required.

## Pest/Disease Taxonomy

- **Types**: fungus, insect, bacteria, virus, mite, other
- **Crops**: apple, pear, both
- **Impact**: critical (zero-tolerance), high (preventive action essential), medium (monitor), low (minimal concern)

## RAG Infrastructure (Prepared, Not Active)

- `research_papers.embedding` and `field_signals.embedding` columns exist (VECTOR(768))
- pgvector extension enabled
- Embedding service at `/src/lib/embedding-service.ts` using Google AI text-embedding-004
- Not yet wired into search — ready for incremental activation

## Available Signal Tags

```
Appel, Peer, Schurft, Kanker, Bemesting, Nieuws, Waarschuwing
```

## Storage

Research PDFs stored in Supabase Storage bucket `research_pdfs` (max 20MB, PDF only).
