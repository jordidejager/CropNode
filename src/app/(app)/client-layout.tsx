'use client';

import { Suspense } from 'react';
import { Sidebar, MobileSidebarProvider, MobileMenuButton } from '@/components/layout/sidebar';
import { MobileBackButton } from '@/components/layout/mobile-back-button';
import { Bell, Loader2 } from 'lucide-react';
import { Logo, LogoIcon } from '@/components/ui/logo';
import { Button } from '@/components/ui/button';
import { QueryProvider } from '@/lib/query-provider';

function PageSkeleton() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
    </div>
  );
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <MobileSidebarProvider>
        <div className="flex min-h-screen bg-[#020617] text-slate-100">
          <Sidebar />
          <div className="flex-1 flex flex-col min-h-0 bg-transparent">
            <header className="sticky top-0 z-20 md:z-30 flex h-16 items-center gap-4 border-b border-white/5 bg-[#020617]/80 px-4 md:px-6 backdrop-blur-md">
              {/* Mobile: hamburger + back + logo */}
              <div className="flex items-center gap-2 md:hidden">
                <MobileMenuButton />
                <MobileBackButton />
                <Logo variant="horizontal" theme="dark" width={100} height={24} style="animated" />
              </div>
              <div className="flex-1" />
              <Button variant="ghost" size="icon" className="rounded-xl bg-white/5 border border-white/10 hover:bg-white/10">
                <Bell className="h-5 w-5 text-slate-400 group-hover:text-emerald-400 transition-colors" />
                <span className="sr-only">Toggle notifications</span>
              </Button>
            </header>
            <main className="flex-1 flex flex-col p-4 md:p-6 overflow-y-auto custom-scrollbar">
              <Suspense fallback={<PageSkeleton />}>
                {children}
              </Suspense>
            </main>
          </div>
        </div>
      </MobileSidebarProvider>
    </QueryProvider>
  );
}
