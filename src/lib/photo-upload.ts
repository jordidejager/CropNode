'use client';

import imageCompression from 'browser-image-compression';
import { createClient } from '@/lib/supabase/client';

/**
 * Compress a photo for upload (max 1920px, JPEG 80%, < 1MB).
 */
export async function compressPhoto(file: File): Promise<File> {
  return imageCompression(file, {
    maxWidthOrHeight: 1920,
    maxSizeMB: 1,
    useWebWorker: true,
    fileType: 'image/jpeg',
  });
}

/**
 * Extract GPS coordinates from photo EXIF data.
 * Returns null on any failure (missing EXIF, no GPS, parse error).
 */
export async function extractGpsFromPhoto(
  file: File
): Promise<{ lat: number; lng: number } | null> {
  try {
    // Dynamic import to keep bundle small when not used
    const exifr = await import('exifr');
    const gps = await exifr.gps(file);
    if (gps?.latitude && gps?.longitude) {
      return { lat: gps.latitude, lng: gps.longitude };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Upload a compressed photo to Supabase Storage.
 * Path: field-note-photos/{userId}/{timestamp}.jpg
 * Returns the public URL.
 */
export async function uploadPhotoToSupabase(
  file: File,
  userId: string
): Promise<string> {
  const supabase = createClient();
  const path = `${userId}/${Date.now()}.jpg`;

  const { error } = await supabase.storage
    .from('field-note-photos')
    .upload(path, file, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (error) {
    throw new Error(`Foto upload mislukt: ${error.message}`);
  }

  const { data: urlData } = supabase.storage
    .from('field-note-photos')
    .getPublicUrl(path);

  return urlData.publicUrl;
}
