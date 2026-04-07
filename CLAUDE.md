# CropNode

Intelligent crop protection management app for Dutch fruit farming (apples & pears).

## ⚠️ Git Remotes — Read Before Pushing

This submodule has TWO remotes. **Only `cropnode` is deployed.**

- `cropnode` → `github.com/jordidejager/CropNode.git` — **the live repo, deployed by Vercel**
- `origin` → `github.com/jordidejager/AgrisprayerPro.git` — legacy/parallel mirror, NOT deployed

```bash
# Always push to cropnode for the live app
git push cropnode main
```

Pushing only to `origin` silently leaves Vercel out of date. If you must push to both, push `cropnode` last so the deploy reflects your latest commit. The parent repo (`/Users/jordidejager/studio`) tracks the submodule pointer — push that to its own `origin` as usual after updating the submodule.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router + Turbopack) |
| Language | TypeScript 5, React 19 |
| AI | Genkit + Google Gemini 2.5 Flash Lite (intent classification & parsing) |
| Embeddings | googleai/text-embedding-004 (768-dim vectors for RAG) |
| Database | Supabase (PostgreSQL + pgvector) |
| Auth | Supabase Auth (email/password, RLS on all user tables) |
| Data Fetching | TanStack React Query |
| UI | shadcn/ui + Radix UI, Tailwind CSS 3, Framer Motion |
| Maps | Leaflet + leaflet-draw |
| Charts | Recharts |
| Forms | react-hook-form + Zod |

## External APIs

| API | Purpose |
|-----|---------|
| Gemini API | AI parsing & embeddings (via Genkit) |
| PDOK Gewaspercelen | RVO parcel data (`api.pdok.nl/rvo/gewaspercelen/`) |
| PDOK Locatieserver | Address search (`api.pdok.nl/bzk/locatieserver/`) |
| Open-Meteo | Weather data — forecast + historical (free, no key) |

## Global Conventions

### Theming
- **Dark mode only** — enabled via `class="dark"` on root
- **Primary color**: Emerald (#10b981) for accents and CTAs
- Cards use semi-transparent backgrounds with subtle borders
- Emerald glow effects on hover states

### Naming
- Files: kebab-case (`smart-invoer-feed.tsx`)
- Components: PascalCase (`SmartInvoerFeed`)
- Database: snake_case (`sub_parcels`)
- TypeScript types: PascalCase (`SprayableParcel`)

### Component Organization
- `components/ui/` — shadcn/ui primitives
- `components/domain/` — feature-specific components
- `components/layout/` — sidebar, navigation
- Server Components by default, `'use client'` only when needed

### Mobile-First
- Breakpoints: sm (640), md (768), lg (1024), xl (1280)
- Min 44px tap targets
- Bottom sheets for mobile modals

## Key Design Decisions

- **Two-tier parcel system**: Parcels (physical boundaries) → Sub-parcels/blocks (work units for spray registrations with specific crop/variety combos)
- **Combined intent + parsing**: Single AI call does both intent classification and spray parsing (saves 50% API calls)
- **Deterministic CTGB validation**: No AI for regulation checks — pure TypeScript logic with 6 priority checks (crop auth, dosage, interval, seasonal max, substance cumulation, safety period)
- **Flattened Gemini output**: Gemini has 5-level nesting limit, so output uses comma-separated strings with post-processing
- **Feedback loop**: User corrections stored in `smart_input_feedback` to improve future parsing (product aliases, dosage preferences, parcel groups)
- **Work day weighting**: Mon-Fri = 1, Sat = 0.5, Sun = 0 (for task hour calculations)
- **Smart Input V2 hybrid**: First message uses fast pipeline (classify+parse in 1 call), follow-ups use AI Agent with tools. Client-side context caching reduces response from 6-12s to 1-3s.

## Auth Flow

- Login/register via Supabase Auth (email + password)
- Session stored in cookies with auto-refresh
- Middleware protects all routes under `(app)` route group
- RLS enforces `auth.uid()` on all user-owned tables
- Auth actions in `/src/lib/auth-actions.ts`

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_URL=

# Google AI (Gemini)
GOOGLE_API_KEY=

# Weather cron job auth
CRON_SECRET=
```

## Development Commands

```bash
npm run dev              # Dev server (Turbopack)
npm run build            # Production build
npm run lint             # ESLint
npm run typecheck        # TypeScript check
npm run test:e2e         # Playwright E2E tests
npm run test:e2e:ui      # Playwright interactive UI
npm run test:e2e:headed  # Playwright with visible browser
npm run test:weather     # Weather Hub unit tests (32 tests)

# Smart Input V2 regression tests
npx tsx scripts/run-regression-tests.ts              # All 53 tests
npx tsx scripts/run-regression-tests.ts --verbose    # With details
npx tsx scripts/run-regression-tests.ts --category=simpel  # By category
```
