import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase-client';
import { resolveParcelForUser } from '@/lib/weather/resolve-parcel';

/**
 * GET /api/physical-stations
 *   List all physical stations the signed-in user owns.
 *
 * POST /api/physical-stations
 *   Register a new station. Body: { deviceId, devEui, applicationId, label?, parcelId? }
 */

// ---- GET ----

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('physical_weather_stations')
    .select(`
      id, device_id, dev_eui, application_id, label,
      hardware_model, firmware_version,
      parcel_id, latitude, longitude, elevation_m,
      active, installed_at, last_seen_at, last_frame_counter,
      created_at, updated_at,
      parcels ( id, name )
    `)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}

// ---- POST ----

interface RegisterBody {
  deviceId: string;
  devEui: string;
  applicationId: string;
  label?: string;
  parcelId?: string | null;
  hardwareModel?: string;
  firmwareVersion?: string;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: RegisterBody;
  try {
    body = (await request.json()) as RegisterBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.deviceId || !body.devEui || !body.applicationId) {
    return NextResponse.json(
      { error: 'deviceId, devEui and applicationId are required' },
      { status: 400 }
    );
  }

  // Normalize dev_eui to uppercase (TTN returns either case)
  const devEui = body.devEui.toUpperCase();

  // If a parcel is given, make sure it's the user's parcel + use its lat/lng.
  // The id may be either a parcel or a sub_parcel — resolveParcelForUser
  // handles both and returns the canonical parent parcel id.
  let latitude: number | null = null;
  let longitude: number | null = null;
  let resolvedParcelId: string | null = null;

  if (body.parcelId) {
    const resolved = await resolveParcelForUser(supabase, user.id, body.parcelId);
    if (!resolved) {
      return NextResponse.json(
        { error: 'Parcel not found or not yours' },
        { status: 403 }
      );
    }
    resolvedParcelId = resolved.parcelId;
    latitude = resolved.latitude;
    longitude = resolved.longitude;
  }

  // Insert the station
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Admin client unavailable' }, { status: 500 });
  }

  const { data: inserted, error: insertErr } = await (admin as any)
    .from('physical_weather_stations')
    .insert({
      user_id: user.id,
      device_id: body.deviceId.trim(),
      dev_eui: devEui,
      application_id: body.applicationId.trim(),
      label: body.label?.trim() || null,
      hardware_model: body.hardwareModel?.trim() || 'WSC2-Compact-LS',
      firmware_version: body.firmwareVersion?.trim() || null,
      parcel_id: body.parcelId || null,
      latitude,
      longitude,
      installed_at: new Date().toISOString(),
      active: true,
    })
    .select()
    .single();

  if (insertErr) {
    // Unique violation = already registered
    if (insertErr.code === '23505') {
      return NextResponse.json(
        { error: 'This device_id or dev_eui is already registered' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // If we have coordinates and no virtual station is linked yet, mirror-create
  // one so Weather Hub's forecast features (Open-Meteo) also work at this site.
  if (latitude !== null && longitude !== null) {
    const { data: existingVirtual } = await (admin as any)
      .from('weather_stations')
      .select('id')
      .eq('user_id', user.id)
      .eq('latitude', Math.round(latitude * 100) / 100)
      .eq('longitude', Math.round(longitude * 100) / 100)
      .maybeSingle();

    let virtualId: string | null = existingVirtual?.id ?? null;
    if (!virtualId) {
      const { data: newVirtual } = await (admin as any)
        .from('weather_stations')
        .insert({
          user_id: user.id,
          latitude: Math.round(latitude * 100) / 100,
          longitude: Math.round(longitude * 100) / 100,
          timezone: 'Europe/Amsterdam',
        })
        .select('id')
        .single();
      virtualId = newVirtual?.id ?? null;
    }

    if (virtualId) {
      await (admin as any)
        .from('physical_weather_stations')
        .update({ virtual_station_id: virtualId })
        .eq('id', inserted.id);
    }
  }

  return NextResponse.json({ success: true, data: inserted });
}
