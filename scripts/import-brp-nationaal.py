#!/usr/bin/env python3
"""
BRP Nationaal Import — Gewashistorie 2009-2025
Downloads GeoPackage files from PDOK and imports centroids into Supabase via REST API.

Usage:
    python3 scripts/import-brp-nationaal.py              # Import all years
    python3 scripts/import-brp-nationaal.py 2024 2025    # Import specific years

Requirements:
    brew install gdal
"""

import os
import sys
import time
import json
import zipfile
import urllib.request
import tempfile
import glob
from osgeo import ogr, osr

# ============================================
# Configuration
# ============================================

DOWNLOAD_URLS = {
    2025: "https://service.pdok.nl/rvo/gewaspercelen/atom/downloads/gewaspercelen_definitief_2025.gpkg",
    2024: "https://service.pdok.nl/rvo/gewaspercelen/atom/downloads/brpgewaspercelen_definitief_2024.gpkg",
    2023: "https://service.pdok.nl/rvo/gewaspercelen/atom/downloads/brpgewaspercelen_definitief_2023.gpkg",
    2022: "https://service.pdok.nl/rvo/gewaspercelen/atom/downloads/brpgewaspercelen_definitief_2022.gpkg",
    2021: "https://service.pdok.nl/rvo/gewaspercelen/atom/downloads/brpgewaspercelen_definitief_2021.gpkg",
    2020: "https://service.pdok.nl/rvo/gewaspercelen/atom/downloads/brpgewaspercelen_definitief_2020.gpkg",
    2019: "https://service.pdok.nl/rvo/gewaspercelen/atom/downloads/brpgewaspercelen_definitief_2019.zip",
    2018: "https://service.pdok.nl/rvo/gewaspercelen/atom/downloads/brpgewaspercelen_definitief_2018.zip",
    2017: "https://service.pdok.nl/rvo/gewaspercelen/atom/downloads/brpgewaspercelen_definitief_2017.zip",
    2016: "https://service.pdok.nl/rvo/gewaspercelen/atom/downloads/brpgewaspercelen_definitief_2016.zip",
    2015: "https://service.pdok.nl/rvo/gewaspercelen/atom/downloads/brpgewaspercelen_definitief_2015.zip",
    2014: "https://service.pdok.nl/rvo/gewaspercelen/atom/downloads/brpgewaspercelen_definitief_2014.zip",
    2013: "https://service.pdok.nl/rvo/gewaspercelen/atom/downloads/brpgewaspercelen_definitief_2013.zip",
    2012: "https://service.pdok.nl/rvo/gewaspercelen/atom/downloads/brpgewaspercelen_definitief_2012.zip",
    2011: "https://service.pdok.nl/rvo/gewaspercelen/atom/downloads/brpgewaspercelen_definitief_2011.zip",
    2010: "https://service.pdok.nl/rvo/gewaspercelen/atom/downloads/brpgewaspercelen_definitief_2010.zip",
    2009: "https://service.pdok.nl/rvo/gewaspercelen/atom/downloads/brpgewaspercelen_definitief_2009.zip",
}

BATCH_SIZE = 500  # REST API batch size (keep reasonable for HTTP payload)

# ============================================
# Supabase REST API client
# ============================================

class SupabaseRest:
    def __init__(self, url, service_role_key):
        self.base_url = f"{url}/rest/v1"
        self.headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }

    def count(self, table, column, value):
        """Count rows matching a filter."""
        url = f"{self.base_url}/{table}?{column}=eq.{value}&select=id"
        headers = {**self.headers, "Prefer": "count=exact", "Range-Unit": "items", "Range": "0-0"}
        req = urllib.request.Request(url, headers=headers, method='HEAD')
        try:
            resp = urllib.request.urlopen(req)
            content_range = resp.headers.get('Content-Range', '*/0')
            total = content_range.split('/')[-1]
            return int(total) if total != '*' else 0
        except Exception:
            return 0

    def insert_batch(self, table, rows):
        """Insert a batch of rows via POST."""
        url = f"{self.base_url}/{table}"
        data = json.dumps(rows).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers=self.headers, method='POST')
        resp = urllib.request.urlopen(req)
        return resp.status


# ============================================
# Helpers
# ============================================

def get_supabase_config():
    """Read Supabase URL and service role key from .env.local"""
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env.local')
    url = None
    key = None
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line.startswith('NEXT_PUBLIC_SUPABASE_URL='):
                url = line.split('=', 1)[1]
            elif line.startswith('SUPABASE_SERVICE_ROLE_KEY='):
                key = line.split('=', 1)[1]
    if not url or not key:
        raise RuntimeError("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in .env.local")
    return url, key


def download_file(url, dest_path):
    """Download a file with progress reporting."""
    print(f"  Downloading {os.path.basename(dest_path)}...")

    def reporthook(count, block_size, total_size):
        if total_size > 0:
            pct = min(100, count * block_size * 100 // total_size)
            mb = count * block_size / (1024 * 1024)
            total_mb = total_size / (1024 * 1024)
            sys.stdout.write(f"\r  {mb:.0f}/{total_mb:.0f} MB ({pct}%)")
            sys.stdout.flush()

    urllib.request.urlretrieve(url, dest_path, reporthook)
    print()  # newline after progress


def extract_geodata_from_zip(zip_path, extract_dir):
    """Extract .gpkg or .gdb from a ZIP archive. Returns path to extracted data source."""
    with zipfile.ZipFile(zip_path, 'r') as zf:
        names = zf.namelist()

        # Check for .gpkg first
        gpkg_files = [f for f in names if f.endswith('.gpkg')]
        if gpkg_files:
            zf.extract(gpkg_files[0], extract_dir)
            return os.path.join(extract_dir, gpkg_files[0])

        # Check for .gdb (FileGDB directory) — extract all files
        gdb_dirs = set()
        for f in names:
            if '.gdb/' in f or '.gdb\\' in f:
                gdb_dir = f.split('.gdb')[0] + '.gdb'
                gdb_dirs.add(gdb_dir)
        if gdb_dirs:
            gdb_dir = sorted(gdb_dirs)[0]
            # Extract all files belonging to this .gdb
            for f in names:
                if f.startswith(gdb_dir):
                    zf.extract(f, extract_dir)
            return os.path.join(extract_dir, gdb_dir)

        raise RuntimeError(f"No .gpkg or .gdb found in {zip_path}. Contents: {names[:10]}")


def process_year(db, jaar, gpkg_path):
    """Process a single GeoPackage file and insert centroids via REST API."""
    print(f"  Processing {gpkg_path}...")

    ds = ogr.Open(gpkg_path)
    if ds is None:
        print(f"  ERROR: Could not open {gpkg_path}")
        return 0

    layer = ds.GetLayer(0)
    feature_count = layer.GetFeatureCount()
    print(f"  Features: {feature_count:,}")

    # Setup coordinate transformation: RD New (EPSG:28992) → WGS84 (EPSG:4326)
    src_srs = layer.GetSpatialRef()
    dst_srs = osr.SpatialReference()
    dst_srs.SetFromUserInput('EPSG:4326')
    transform = osr.CoordinateTransformation(src_srs, dst_srs)

    # Find field indices
    layer_defn = layer.GetLayerDefn()
    field_names = [layer_defn.GetFieldDefn(i).GetName() for i in range(layer_defn.GetFieldCount())]

    # Field name variations across years
    gewas_field = next((f for f in field_names if f.lower() in ('gewas', 'gws_gewas')), None)
    code_field = next((f for f in field_names if f.lower() in ('gewascode', 'gws_gewascode', 'cat_gewascode')), None)
    cat_field = next((f for f in field_names if f.lower() in ('category', 'cat_gewascategorie', 'gws_gewascategorie')), None)

    if not gewas_field or not code_field:
        print(f"  WARNING: Could not find gewas/gewascode fields in {field_names}")
        print(f"  Available fields: {field_names}")
        ds = None
        return 0

    print(f"  Fields: gewas={gewas_field}, code={code_field}, category={cat_field}")

    batch = []
    inserted = 0

    for i, feature in enumerate(layer):
        geom = feature.GetGeometryRef()
        if geom is None:
            continue

        centroid = geom.Centroid()
        centroid.Transform(transform)

        lng = round(centroid.GetX(), 7)
        lat = round(centroid.GetY(), 7)

        gewas = feature.GetField(gewas_field) or 'Onbekend'
        gewascode = feature.GetField(code_field) or 0
        category = feature.GetField(cat_field) if cat_field else None

        batch.append({
            "jaar": jaar,
            "gewascode": int(gewascode),
            "gewas": gewas,
            "category": category,
            "lat": lat,
            "lng": lng,
        })

        if len(batch) >= BATCH_SIZE:
            try:
                db.insert_batch('brp_gewas_nationaal', batch)
            except Exception as e:
                print(f"\n  ERROR inserting batch at {inserted}: {e}")
                # Try smaller batches
                for mini in range(0, len(batch), 100):
                    try:
                        db.insert_batch('brp_gewas_nationaal', batch[mini:mini+100])
                    except Exception as e2:
                        print(f"\n  ERROR mini-batch at {inserted + mini}: {e2}")
            inserted += len(batch)
            batch = []
            if feature_count > 0:
                sys.stdout.write(f"\r  Inserted {inserted:,} / {feature_count:,} ({inserted * 100 // feature_count}%)")
                sys.stdout.flush()

    # Final batch
    if batch:
        try:
            db.insert_batch('brp_gewas_nationaal', batch)
        except Exception as e:
            print(f"\n  ERROR inserting final batch: {e}")
        inserted += len(batch)

    ds = None  # Close GDAL dataset
    print(f"\n  Done: {inserted:,} rows inserted for {jaar}")
    return inserted


# ============================================
# Main
# ============================================

def main():
    # Parse years from command line
    if len(sys.argv) > 1:
        years = [int(y) for y in sys.argv[1:]]
    else:
        years = sorted(DOWNLOAD_URLS.keys(), reverse=True)  # Newest first

    print("=" * 60)
    print("BRP Nationaal Import — Gewashistorie")
    print(f"Years to process: {years}")
    print("=" * 60)

    url, key = get_supabase_config()
    db = SupabaseRest(url, key)
    print(f"Connected to Supabase REST API")

    total_inserted = 0
    total_start = time.time()

    with tempfile.TemporaryDirectory() as tmpdir:
        for jaar in years:
            if jaar not in DOWNLOAD_URLS:
                print(f"\nSkipping {jaar}: no download URL")
                continue

            # Check if year already imported
            existing = db.count('brp_gewas_nationaal', 'jaar', jaar)
            if existing > 0:
                print(f"\n[{jaar}] Already imported ({existing:,} rows). Skipping.")
                continue

            print(f"\n{'='*60}")
            print(f"[{jaar}] Starting import...")
            start = time.time()

            dl_url = DOWNLOAD_URLS[jaar]
            is_zip = dl_url.endswith('.zip')
            filename = os.path.basename(dl_url)
            download_path = os.path.join(tmpdir, filename)

            try:
                # 1. Download
                download_file(dl_url, download_path)

                # 2. Extract if ZIP
                if is_zip:
                    print(f"  Extracting ZIP...")
                    gpkg_path = extract_geodata_from_zip(download_path, tmpdir)
                    os.remove(download_path)
                else:
                    gpkg_path = download_path

                # 3. Process and insert
                count = process_year(db, jaar, gpkg_path)
                total_inserted += count

                # 4. Cleanup
                import shutil
                if os.path.exists(gpkg_path):
                    if os.path.isdir(gpkg_path):
                        shutil.rmtree(gpkg_path)
                    else:
                        os.remove(gpkg_path)
                # Also clean up any other extracted files
                for f in glob.glob(os.path.join(tmpdir, '*.gpkg')):
                    os.remove(f)
                for f in glob.glob(os.path.join(tmpdir, '*.gdb')):
                    shutil.rmtree(f)

                elapsed = time.time() - start
                print(f"  Year {jaar} completed in {elapsed:.0f}s")

            except Exception as e:
                print(f"  ERROR processing {jaar}: {e}")
                import traceback
                traceback.print_exc()
                continue

    total_elapsed = time.time() - total_start

    print(f"\n{'='*60}")
    print(f"Import complete!")
    print(f"Total rows inserted: {total_inserted:,}")
    print(f"Total time: {total_elapsed:.0f}s ({total_elapsed/60:.1f} min)")
    print(f"{'='*60}")


if __name__ == '__main__':
    main()
