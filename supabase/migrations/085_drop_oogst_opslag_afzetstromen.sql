-- ============================================================================
-- 085_drop_oogst_opslag_afzetstromen.sql
-- ============================================================================
-- Verwijdert het volledige Oogst & Opslag (koelcel) + Afzetstromen domein uit
-- CropNode. Deze features verhuizen naar het aparte "StoreNode" platform.
--
-- ⚠️ DIT VERWIJDERT DATA DEFINITIEF. Bewust gekozen (geen export):
--    - storage_cells: ~22 rijen (incl. de echte koelhuis-indeling van
--      jordi@cmdejager.nl — 14 cellen met deuren/verdampers/posities)
--    - production_summaries: ~165 echte productie-rijen (Analytics Productie)
--    - batches/batch_events/incoming_orders/batch_pallets: echte Fruitmasters
--      orders/prijzen/pallets
--    Run deze migratie pas als je zeker weet dat je dit niet meer nodig hebt
--    in CropNode (StoreNode bouwt dit opnieuw op).
--
-- BLIJFT staan (NIET aangeraakt):
--    - harvest_year KOLOM op spuitschrift / parcel_history  (Analytics kosten)
--    - email_ingestions / email_inbound_addresses / email_ingestion_attachments
--      (migratie 069 — gedeeld met de voorraad/facturen-module)
--    - purchase_invoices / suppliers / product_prices / inventory_movements
--      (migratie 075 — inkoop/voorraad, los van afzetstromen)
--    - phenology_reference, products, weather_*, soil_analyses, parcel_profiles
--
-- Idempotent: alles met IF EXISTS + CASCADE. Veilig om twee keer te draaien.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Views eerst (anders blokkeren ze de table-drops)
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS v_incoming_orders_with_links CASCADE;
DROP VIEW IF EXISTS v_batch_pallets_enriched     CASCADE;
DROP VIEW IF EXISTS v_batch_parcels_enriched      CASCADE;
DROP VIEW IF EXISTS v_batch_current_storage       CASCADE;
DROP VIEW IF EXISTS v_batch_totals                CASCADE;
DROP VIEW IF EXISTS v_batches_enriched            CASCADE;
DROP VIEW IF EXISTS v_cold_cell_daily             CASCADE;
DROP VIEW IF EXISTS v_harvest_registration_totals CASCADE;
DROP VIEW IF EXISTS v_position_stacks             CASCADE;
DROP VIEW IF EXISTS v_cell_sub_parcel_totals      CASCADE;
DROP VIEW IF EXISTS v_storage_cells_summary       CASCADE;

-- ---------------------------------------------------------------------------
-- 2. Afzetstromen-tabellen (kinderen → ouder)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS batch_orders         CASCADE;
DROP TABLE IF EXISTS incoming_order_lines CASCADE;
DROP TABLE IF EXISTS incoming_orders      CASCADE;
DROP TABLE IF EXISTS batch_pallets        CASCADE;
DROP TABLE IF EXISTS batch_documents      CASCADE;
DROP TABLE IF EXISTS batch_parcels        CASCADE;
DROP TABLE IF EXISTS batch_sources        CASCADE;
DROP TABLE IF EXISTS batch_events         CASCADE;
DROP TABLE IF EXISTS batches              CASCADE;

-- ---------------------------------------------------------------------------
-- 3. Analytics productie
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS production_summaries CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Koelcel klimaat (cold_cell_measurements is partitioned → CASCADE pakt
--    alle maand-partities mee)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS cold_cell_measurements CASCADE;
DROP TABLE IF EXISTS cold_cell_setpoints    CASCADE;

-- ---------------------------------------------------------------------------
-- 5. Oogstregistratie
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS harvest_registrations CASCADE;

-- ---------------------------------------------------------------------------
-- 6. Opslag / koelcelbeheer (kinderen → ouder)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS storage_position_contents CASCADE;
DROP TABLE IF EXISTS cell_sub_parcels          CASCADE;
DROP TABLE IF EXISTS storage_positions         CASCADE;
DROP TABLE IF EXISTS storage_cells             CASCADE;
DROP TABLE IF EXISTS storage_complex           CASCADE;

-- ---------------------------------------------------------------------------
-- 7. Enums (alleen door verwijderde tabellen gebruikt)
-- ---------------------------------------------------------------------------
DROP TYPE IF EXISTS batch_event_type   CASCADE;
DROP TYPE IF EXISTS batch_source_type  CASCADE;
DROP TYPE IF EXISTS pallet_aanvoertype CASCADE;

-- ---------------------------------------------------------------------------
-- 8. Functies die alleen bij dit domein hoorden
--    (table-gebonden triggers/updated_at-functies vallen al weg met de tabel)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS get_or_create_default_complex(uuid) CASCADE;
DROP FUNCTION IF EXISTS get_or_create_default_complex()     CASCADE;

COMMIT;

-- ============================================================================
-- Klaar. Controleer daarna in Analytics dat kosten/bemesting/ziektedruk nog
-- werken (die gebruiken de harvest_year-kolom, niet de verwijderde tabellen).
-- ============================================================================
