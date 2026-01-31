'use client';

import { Sidebar } from '@/components/layout/sidebar';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QueryProvider } from '@/lib/query-provider';

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <div className="flex min-h-screen bg-[#020617] text-slate-100">
        <Sidebar />
        <div className="flex-1 flex flex-col min-h-0 bg-transparent">
          <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-white/5 bg-[#020617]/80 px-6 backdrop-blur-md">
            <div className="flex-1" />
            <Button variant="ghost" size="icon" className="rounded-xl bg-white/5 border border-white/10 hover:bg-white/10">
              <Bell className="h-5 w-5 text-slate-400 group-hover:text-emerald-400 transition-colors" />
              <span className="sr-only">Toggle notifications</span>
            </Button>
          </header>
          <main className="flex-1 flex flex-col p-6 overflow-y-auto custom-scrollbar">
            {children}
          </main>
        </div>
      </div>
    </QueryProvider>
  );
}
