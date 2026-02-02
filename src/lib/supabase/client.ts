'use client'

// Re-export the singleton client from the main supabase file
// This ensures auth and data operations use the SAME client instance
import { getSupabase } from '@/lib/supabase'

export function createClient() {
  return getSupabase()
}
