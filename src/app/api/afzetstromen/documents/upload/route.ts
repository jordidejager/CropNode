import { NextRequest } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase-client';
import { apiError, apiSuccess, ErrorCodes } from '@/lib/api-utils';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'text/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const ALLOWED_DOCUMENT_TYPES = new Set([
  'sorteer_overzicht',
  'factuur',
  'klant_order',
  'overig',
]);

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

/**
 * POST /api/afzetstromen/documents/upload
 *
 * Multipart body:
 *   file          — required File
 *   batchId       — optional UUID (omit for inbox)
 *   documentType  — optional: sorteer_overzicht | factuur | klant_order | overig
 *   notes         — optional text
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return apiError('Niet ingelogd', ErrorCodes.UNAUTHORIZED, 401);
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const batchId = (formData.get('batchId') as string | null) || null;
    const rawDocType = (formData.get('documentType') as string | null) || 'overig';
    const documentType = ALLOWED_DOCUMENT_TYPES.has(rawDocType) ? rawDocType : 'overig';
    const notes = (formData.get('notes') as string | null) || null;

    if (!file) {
      return apiError('Geen bestand geüpload', ErrorCodes.VALIDATION_ERROR, 400);
    }

    if (file.size > MAX_FILE_SIZE) {
      return apiError('Bestand mag maximaal 20 MB zijn', ErrorCodes.VALIDATION_ERROR, 400);
    }

    if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
      return apiError(
        `Bestandstype ${file.type} niet ondersteund. Gebruik PDF, CSV, Excel of afbeelding.`,
        ErrorCodes.VALIDATION_ERROR,
        400
      );
    }

    // Validate batch ownership if batchId given
    if (batchId) {
      const { data: batchCheck, error: batchErr } = await supabase
        .from('batches')
        .select('id')
        .eq('id', batchId)
        .maybeSingle();
      if (batchErr || !batchCheck) {
        return apiError('Partij niet gevonden of geen toegang', ErrorCodes.NOT_FOUND, 404);
      }
    }

    const adminClient = createServiceRoleClient();

    const timestamp = Date.now();
    const folder = batchId ?? 'inbox';
    const storagePath = `${user.id}/${folder}/${timestamp}-${safeFilename(file.name)}`;

    const fileBuffer = await file.arrayBuffer();
    const { error: uploadError } = await adminClient.storage
      .from('partij-documenten')
      .upload(storagePath, fileBuffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      return apiError(`Upload mislukt: ${uploadError.message}`, ErrorCodes.INTERNAL_ERROR, 500);
    }

    const { data: record, error: insertError } = await adminClient
      .from('batch_documents')
      .insert({
        user_id: user.id,
        batch_id: batchId,
        storage_path: storagePath,
        filename: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
        document_type: documentType,
        processing_status: batchId ? 'linked' : 'pending',
        notes,
        processed_at: batchId ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (insertError) {
      // Try to clean up the uploaded file
      await adminClient.storage.from('partij-documenten').remove([storagePath]);
      return apiError(
        `Record aanmaken mislukt: ${insertError.message}`,
        ErrorCodes.INTERNAL_ERROR,
        500
      );
    }

    return apiSuccess({
      id: record.id,
      batchId: record.batch_id,
      linkedEventId: record.linked_event_id,
      storagePath: record.storage_path,
      filename: record.filename,
      mimeType: record.mime_type,
      sizeBytes: record.size_bytes,
      documentType: record.document_type,
      processingStatus: record.processing_status,
      notes: record.notes,
      uploadedAt: new Date(record.uploaded_at),
      processedAt: record.processed_at ? new Date(record.processed_at) : null,
      createdAt: new Date(record.created_at),
      updatedAt: new Date(record.updated_at),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout';
    return apiError(message, ErrorCodes.INTERNAL_ERROR, 500);
  }
}
