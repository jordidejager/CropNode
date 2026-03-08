#!/usr/bin/env python3
"""
Temporary script to fetch multi-model + ensemble data from Open-Meteo
and insert into Supabase. Run once to populate the database.
Uses subprocess + curl to avoid Python SSL cert issues on macOS.

Usage: python3 scripts/populate-expert-data.py
"""

import json
import os
import subprocess
import re
from collections import Counter

# --- Config ---
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

STATION_ID = "31b105f8-2975-4e18-9eaa-1fc3e8eeb927"
LAT = 51.47
LON = 3.93

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ENSEMBLE_URL = "https://ensemble-api.open-meteo.com/v1/ensemble"

HOURLY_PARAMS = "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,et0_fao_evapotranspiration,soil_temperature_6cm,cloud_cover,dew_point_2m,direct_radiation,diffuse_radiation"

MODEL_SUFFIX_MAP = {
    "ecmwf_ifs025": "ecmwf_ifs",
    "icon_eu": "icon_eu",
    "gfs_seamless": "gfs",
    "meteofrance_arpege_seamless": "meteofrance_arpege",
    "ecmwf_aifs025": "ecmwf_aifs",
}

ENSEMBLE_KEY_SUFFIX_MAP = {
    "ecmwf_ifs025_ensemble": "ecmwf_ifs",
    "ncep_gefs025": "gfs",
}

ENSEMBLE_HOURLY_PARAMS = "temperature_2m,precipitation,wind_speed_10m,relative_humidity_2m"


def curl_get(url):
    """Fetch JSON via curl."""
    result = subprocess.run(
        ["curl", "-s", url],
        capture_output=True, text=True, timeout=60
    )
    return json.loads(result.stdout)


def curl_post(url, data, headers):
    """POST JSON via curl using stdin to avoid arg length limits."""
    cmd = ["curl", "-s", "-w", "%{http_code}", "-o", "/dev/null", "-X", "POST", url]
    for k, v in headers.items():
        cmd.extend(["-H", f"{k}: {v}"])
    cmd.extend(["--data-binary", "@-"])
    payload = json.dumps(data)
    result = subprocess.run(
        cmd, capture_output=True, text=True, timeout=300,
        input=payload
    )
    code = result.stdout.strip()
    return int(code) if code.isdigit() else 500


def supabase_upsert(table, rows, on_conflict=""):
    """Upsert rows into Supabase table via curl."""
    oc = f"?on_conflict={on_conflict}" if on_conflict else ""
    url = f"{SUPABASE_URL}/rest/v1/{table}{oc}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    return curl_post(url, rows, headers)


def supabase_get(path):
    """GET from Supabase REST API via curl."""
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    result = subprocess.run(
        ["curl", "-s", url,
         "-H", f"apikey: {SUPABASE_KEY}",
         "-H", f"Authorization: Bearer {SUPABASE_KEY}"],
        capture_output=True, text=True, timeout=30
    )
    return json.loads(result.stdout)


def estimate_leaf_wetness(humidity, temp, dew_point, precip):
    if humidity is None:
        return None
    if precip is not None and precip > 0:
        return 100
    if humidity > 95:
        return 90
    if humidity > 90:
        return 70
    if temp is not None and dew_point is not None and (temp - dew_point) < 2:
        return 50
    if humidity > 85:
        return 30
    return 0


def fetch_multimodel():
    """Fetch and store multi-model data."""
    print("\n--- Multi-Model Fetch ---")
    models = ",".join(MODEL_SUFFIX_MAP.keys())
    url = f"{FORECAST_URL}?latitude={LAT}&longitude={LON}&models={models}&hourly={HOURLY_PARAMS}&forecast_days=16&past_days=2&timezone=Europe/Amsterdam"
    print(f"Fetching from Open-Meteo...")
    data = curl_get(url)
    hourly = data.get("hourly", {})
    times = hourly.get("time", [])
    print(f"Got {len(times)} timesteps")

    total = 0
    for suffix, model_name in MODEL_SUFFIX_MAP.items():
        rows = []
        for i, ts in enumerate(times):
            def get_val(variable, s=suffix, idx=i):
                key = f"{variable}_{s}"
                arr = hourly.get(key, [])
                return arr[idx] if idx < len(arr) else None

            temp = get_val("temperature_2m")
            humidity = get_val("relative_humidity_2m")
            precip = get_val("precipitation")
            dew_point = get_val("dew_point_2m")
            direct_rad = get_val("direct_radiation")
            diffuse_rad = get_val("diffuse_radiation")

            solar_rad = None
            if direct_rad is not None and diffuse_rad is not None:
                solar_rad = direct_rad + diffuse_rad
            elif direct_rad is not None:
                solar_rad = direct_rad
            elif diffuse_rad is not None:
                solar_rad = diffuse_rad

            leaf_wet = estimate_leaf_wetness(humidity, temp, dew_point, precip)

            rows.append({
                "station_id": STATION_ID,
                "timestamp": ts,
                "model_name": model_name,
                "temperature_c": temp,
                "humidity_pct": humidity,
                "precipitation_mm": precip,
                "wind_speed_ms": get_val("wind_speed_10m"),
                "wind_direction": get_val("wind_direction_10m"),
                "wind_gusts_ms": get_val("wind_gusts_10m"),
                "leaf_wetness_pct": leaf_wet,
                "soil_temp_6cm": get_val("soil_temperature_6cm"),
                "solar_radiation": solar_rad,
                "et0_mm": get_val("et0_fao_evapotranspiration"),
                "cloud_cover_pct": get_val("cloud_cover"),
                "dew_point_c": dew_point,
                "is_forecast": True,
                "data_source": "open-meteo",
            })

        # Check if model has data
        has_data = any(r["temperature_c"] is not None for r in rows)
        if not has_data:
            print(f"  {model_name}: no data, skipping")
            continue

        # Upsert in batches of 50
        model_total = 0
        batch_size = 50
        for j in range(0, len(rows), batch_size):
            batch = rows[j:j+batch_size]
            status = supabase_upsert("weather_data_hourly", batch, "station_id,timestamp,model_name,is_forecast")
            if status in (200, 201):
                model_total += len(batch)
            else:
                print(f"    Batch {j//batch_size+1} failed (HTTP {status})")

        print(f"  {model_name}: {model_total} rows")
        total += model_total

    print(f"Multi-model total: {total} rows")
    return total


def fetch_ensemble():
    """Fetch and store ensemble data."""
    print("\n--- Ensemble Fetch ---")
    url = f"{ENSEMBLE_URL}?latitude={LAT}&longitude={LON}&models=ecmwf_ifs025,gfs025&hourly={ENSEMBLE_HOURLY_PARAMS}&timezone=Europe/Amsterdam"
    print(f"Fetching from Open-Meteo...")
    data = curl_get(url)
    hourly = data.get("hourly", {})
    times = hourly.get("time", [])
    all_keys = list(hourly.keys())
    print(f"Got {len(times)} timesteps, {len(all_keys)} keys")

    total = 0
    for key_suffix, model_name in ENSEMBLE_KEY_SUFFIX_MAP.items():
        # Find member numbers
        member_nums = set()
        pattern = re.compile(rf"_member(\d+)_{re.escape(key_suffix)}$")
        for k in all_keys:
            m = pattern.search(k)
            if m:
                member_nums.add(int(m.group(1)))

        print(f"  {model_name}: {len(member_nums)} members")

        for member in sorted(member_nums):
            member_str = f"{member:02d}"
            rows = []

            for i, ts in enumerate(times):
                def get_val(variable, ms=member_str, ks=key_suffix, idx=i):
                    key = f"{variable}_member{ms}_{ks}"
                    arr = hourly.get(key, [])
                    return arr[idx] if idx < len(arr) else None

                rows.append({
                    "station_id": STATION_ID,
                    "timestamp": ts,
                    "model_name": model_name,
                    "member": member,
                    "temperature_c": get_val("temperature_2m"),
                    "precipitation_mm": get_val("precipitation"),
                    "wind_speed_ms": get_val("wind_speed_10m"),
                    "humidity_pct": get_val("relative_humidity_2m"),
                })

            # Upsert in batches
            member_total = 0
            batch_size = 50
            for j in range(0, len(rows), batch_size):
                batch = rows[j:j+batch_size]
                status = supabase_upsert("weather_ensemble_hourly", batch, "station_id,timestamp,model_name,member")
                if status in (200, 201):
                    member_total += len(batch)

            total += member_total

    print(f"Ensemble total: {total} rows")
    return total


def log_fetch(fetch_type, records):
    """Log the fetch in weather_fetch_log."""
    supabase_upsert("weather_fetch_log", [{
        "station_id": STATION_ID,
        "fetch_type": fetch_type,
        "status": "success",
        "records_fetched": records,
    }])


if __name__ == "__main__":
    print("=== Populating Expert Forecast Data ===")
    print(f"Station: {STATION_ID}")
    print(f"Location: {LAT}, {LON}")

    mm_count = fetch_multimodel()
    log_fetch("forecast_multimodel", mm_count)

    ens_count = fetch_ensemble()
    log_fetch("forecast_ensemble", ens_count)

    # Verify
    print("\n--- Verification ---")
    verify_data = supabase_get(
        f"weather_data_hourly?select=model_name&station_id=eq.{STATION_ID}&model_name=neq.best_match&is_forecast=eq.true&limit=1000"
    )
    model_counts = Counter(r["model_name"] for r in verify_data)
    print("Multi-model data:")
    for model, count in sorted(model_counts.items()):
        print(f"  {model}: {count}+ rows")

    verify_ens = supabase_get(
        f"weather_ensemble_hourly?select=model_name,member&station_id=eq.{STATION_ID}&limit=1000"
    )
    ens_models = {}
    for r in verify_ens:
        m = r["model_name"]
        if m not in ens_models:
            ens_models[m] = set()
        ens_models[m].add(r["member"])
    print("Ensemble data:")
    for model, members in sorted(ens_models.items()):
        print(f"  {model}: {len(members)} members")

    print("\nDone!")
