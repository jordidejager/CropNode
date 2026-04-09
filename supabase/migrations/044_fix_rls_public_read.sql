-- ============================================
-- 044: Fix RLS - allow public read on product tables
-- CTGB products and fertilizers are public data
-- They should be readable without authentication
-- ============================================

-- ctgb_products: public read
DROP POLICY IF EXISTS "Allow public read access" ON ctgb_products;
DROP POLICY IF EXISTS "Authenticated users can read ctgb_products" ON ctgb_products;
DROP POLICY IF EXISTS "Allow all access" ON ctgb_products;
CREATE POLICY "Allow public read ctgb_products" ON ctgb_products
  FOR SELECT USING (true);

-- fertilizers: public read
DROP POLICY IF EXISTS "Allow public read access" ON fertilizers;
DROP POLICY IF EXISTS "Allow all access" ON fertilizers;
CREATE POLICY "Allow public read fertilizers" ON fertilizers
  FOR SELECT USING (true);

-- products (unified): public read
DROP POLICY IF EXISTS "Allow public read products" ON products;
CREATE POLICY "Allow public read products" ON products
  FOR SELECT USING (true);

-- product_aliases_unified: public read
DROP POLICY IF EXISTS "Allow public read pau" ON product_aliases_unified;
CREATE POLICY "Allow public read pau" ON product_aliases_unified
  FOR SELECT USING (true);

-- active_substances: public read
DROP POLICY IF EXISTS "Allow public read active_substances" ON active_substances;
CREATE POLICY "Allow public read active_substances" ON active_substances
  FOR SELECT USING (true);

-- product_substances: public read
DROP POLICY IF EXISTS "Allow public read product_substances" ON product_substances;
CREATE POLICY "Allow public read product_substances" ON product_substances
  FOR SELECT USING (true);
