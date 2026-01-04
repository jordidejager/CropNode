'use client';

import Link from 'next/link';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { Leaf, Bell, BookOpen, Tractor, Map, TestTubeDiagonal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { ActivePath } from '@/components/active-path';

const menuItems = [
  { href: '/', label: 'Slimme Invoer', icon: Tractor },
  { href: '/perceelhistorie', label: 'Perceelhistorie', icon: Map },
  { href: '/percelen', label: 'Percelen', icon: Map },
  { href: '/middelmatrix', label: 'MiddelMatrix', icon: TestTubeDiagonal },
];

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const userAvatar = PlaceHolderImages.find(p => p.id === 'user-avatar');

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary shadow-md">
              <Leaf className="size-5 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-bold text-foreground">AgriSprayer Pro</h1>
          </div>
        </SidebarHeader>
        <SidebarContent className="flex-grow">
          <SidebarMenu>
            {menuItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <Link href={item.href} passHref>
                  <ActivePath href={item.href}>
                    <SidebarMenuButton tooltip={item.label}>
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </ActivePath>
                </Link>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <div className="flex items-center gap-3 rounded-md border p-2">
            <Avatar className="size-9">
              <AvatarImage src={userAvatar?.imageUrl} data-ai-hint={userAvatar?.imageHint} alt="User" />
              <AvatarFallback>JT</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="text-sm font-semibold">JagerTech</span>
              <span className="text-xs text-muted-foreground">demo@jagertech.nl</span>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-sm lg:h-[60px] lg:px-6">
          <div className="w-full flex-1">
            {/* Can add a search bar here later */}
          </div>
          <Button variant="ghost" size="icon" className="rounded-full">
            <Bell className="h-5 w-5" />
            <span className="sr-only">Toggle notifications</span>
          </Button>
        </header>
        <main className="flex-1 flex flex-col p-4 lg:p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
