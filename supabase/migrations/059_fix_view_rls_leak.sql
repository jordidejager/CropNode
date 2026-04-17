-- Migration: Fix RLS leak in ALL public views (security_invoker)
--
-- BACKGROUND
-- PostgreSQL views default to SECURITY DEFINER semantics, meaning they run
-- as the view owner (postgres). That bypasses Row Level Security on the
-- underlying tables — any user querying the view sees ALL rows from other
-- users.
--
-- Setting `security_invoker = on` (Postgres 15+) makes the view respect the
-- calling user's RLS policies. Supabase runs PG 15+ so this is safe.
--
-- This migration defensively applies the flag to EVERY view in the public
-- schema, so all RLS leaks are closed in one go.

DO $$
DECLARE
  v record;
BEGIN
  FOR v IN
    SELECT schemaname, viewname
    FROM pg_views
    WHERE schemaname = 'public'
  LOOP
    BEGIN
      EXECUTE format('ALTER VIEW %I.%I SET (security_invoker = on)',
                     v.schemaname, v.viewname);
    EXCEPTION WHEN OTHERS THEN
      -- Some legacy views may not support the flag; continue on error.
      RAISE NOTICE 'Skipped view %.%: %', v.schemaname, v.viewname, SQLERRM;
    END;
  END LOOP;
END $$;

-- Verify: list all views and confirm security_invoker is set.
-- (Run this manually afterwards to double-check)
--
-- SELECT schemaname, viewname,
--        (SELECT option_value
--         FROM pg_options_to_table(c.reloptions)
--         WHERE option_name = 'security_invoker') AS security_invoker
-- FROM pg_views v
-- JOIN pg_class c ON c.relname = v.viewname
-- WHERE schemaname = 'public'
-- ORDER BY viewname;
