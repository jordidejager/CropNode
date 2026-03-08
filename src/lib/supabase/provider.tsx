'use client';

import { createContext, useContext, useMemo, ReactNode } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '../supabase';

const SupabaseContext = createContext<SupabaseClient | null>(null);

export function SupabaseProvider({ children }: { children: ReactNode }) {
  // Use getSupabase() to ensure we always get the singleton instance
  const client = useMemo(() => getSupabase(), []);

  return (
    <SupabaseContext.Provider value={client}>
      {children}
    </SupabaseContext.Provider>
  );
}

export function useSupabase() {
  const context = useContext(SupabaseContext);
  if (!context) {
    throw new Error('useSupabase must be used within a SupabaseProvider');
  }
  return context;
}
