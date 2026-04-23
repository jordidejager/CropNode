import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveParcelForUser } from '@/lib/weather/resolve-parcel';

/**
 * PATCH /api/physical-stations/[id]  — update station (parcel link, label, active)
 * DELETE /api/physical-stations/[id] — delete station + all its measurements
 */

interface UpdateBody {
  label?: string | null;
  parcelId?: string | null;
  active?: boolean;
  firmwareVersion?: string | null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: UpdateBody;
  try {
    body = (await request.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Verify ownership
  const { data: station } = await supabase
    .from('physical_weather_stations')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle();

  if (!station || station.user_id !== user.id) {
    return NextResponse.json({ error: 'Station not found' }, { status: 404 });
  }

  // Build patch object (only touch provided fields)
  const patch: Record<string, unknown> = {};
  if (body.label !== undefined) patch.label = body.label || null;
  if (body.active !== undefined) patch.active = body.active;
  if (body.firmwareVersion !== undefined) patch.firmware_version = body.firmwareVersion || null;

  // Parcel change — also refresh coordinates + virtual-station link
  if (body.parcelId !== undefined) {
    if (body.parcelId === null || body.parcelId === '') {
      patch.parcel_id = null;
      patch.latitude = null;
      patch.longitude = null;
      patch.virtual_station_id = null;
    } else {
      const resolved = await resolveParcelForUser(supabase, user.id, body.parcelId);
      if (!resolved) {
        return NextResponse.json(
          { error: 'Parcel not found or not yours' },
          { status: 403 }
        );
      }
      patch.parcel_id = resolved.parcelId;
      patch.latitude = resolved.latitude;
      patch.longitude = resolved.longitude;
    }
  }

  const { data: updated, error } = await supabase
    .from('physical_weather_stations')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { error } = await supabase
    .from('physical_weather_stations')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
