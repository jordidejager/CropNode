/**
 * WhatsApp Media Download & Supabase Upload.
 *
 * Downloads media (photos) from Meta Cloud API and uploads to Supabase Storage.
 * Used for field note photo attachments via WhatsApp.
 *
 * Flow:
 * 1. GET graph.facebook.com/v21.0/{media-id} → { url }
 * 2. GET {url} → binary data
 * 3. Upload to Supabase Storage bucket "field-note-photos"
 * 4. Return public URL
 */

import { createClient } from '@supabase/supabase-js';

const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0';
const STORAGE_BUCKET = 'field-note-photos';

function getAccessToken(): string {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error('WHATSAPP_ACCESS_TOKEN not set');
  return token;
}

/**
 * Download media binary from WhatsApp Cloud API.
 *
 * Step 1: GET /{media-id} → { url, mime_type, sha256, file_size, id }
 * Step 2: GET {url} with auth → binary ArrayBuffer
 */
export async function downloadWhatsAppMedia(mediaId: string): Promise<{
  buffer: ArrayBuffer;
  mimeType: string;
}> {
  const token = getAccessToken();

  // Step 1: Get the media URL
  const metaResponse = await fetch(`${WHATSAPP_API_URL}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!metaResponse.ok) {
    const errBody = await metaResponse.text();
    throw new Error(`Media URL ophalen mislukt (${metaResponse.status}): ${errBody}`);
  }

  const metaData = await metaResponse.json();
  const mediaUrl: string = metaData.url;
  const mimeType: string = metaData.mime_type || 'image/jpeg';

  if (!mediaUrl) {
    throw new Error('Geen media URL ontvangen van WhatsApp API');
  }

  // Step 2: Download the actual binary
  const mediaResponse = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!mediaResponse.ok) {
    throw new Error(`Media download mislukt (${mediaResponse.status})`);
  }

  const buffer = await mediaResponse.arrayBuffer();
  return { buffer, mimeType };
}

/**
 * Upload a media buffer to Supabase Storage and return the public URL.
 * Uses the service role client (server-side, bypasses RLS).
 */
export async function uploadMediaToSupabase(
  buffer: ArrayBuffer,
  userId: string,
  mimeType: string = 'image/jpeg'
): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase configuratie ontbreekt voor foto upload');
  }

  // Use service role client for server-side upload (bypasses storage policies)
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const ext = mimeType.includes('png') ? 'png' : 'jpg';
  const path = `${userId}/${Date.now()}.${ext}`;

  const { error } = await adminClient.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Foto upload mislukt: ${error.message}`);
  }

  const { data: urlData } = adminClient.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(path);

  return urlData.publicUrl;
}

/**
 * Download a WhatsApp media file and upload it to Supabase Storage.
 * Returns the public URL and the raw buffer (for EXIF extraction).
 */
export async function processWhatsAppMedia(
  mediaId: string,
  userId: string
): Promise<{ publicUrl: string; buffer: ArrayBuffer }> {
  const { buffer, mimeType } = await downloadWhatsAppMedia(mediaId);
  const publicUrl = await uploadMediaToSupabase(buffer, userId, mimeType);
  return { publicUrl, buffer };
}

/**
 * Extract GPS coordinates from EXIF metadata in a photo buffer.
 * Returns { latitude, longitude } or null if no GPS data found.
 * Uses the exifr library (same as the web app's photo-upload.ts).
 */
export async function extractExifGps(
  buffer: Buffer | ArrayBuffer
): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const exifr = await import('exifr');
    const gps = await exifr.gps(buffer);
    if (gps?.latitude && gps?.longitude) {
      return { latitude: gps.latitude, longitude: gps.longitude };
    }
    return null;
  } catch {
    // No EXIF data or parsing failed — that's fine
    return null;
  }
}
