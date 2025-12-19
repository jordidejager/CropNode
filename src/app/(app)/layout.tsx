import Link from 'next/link';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarTrigger,
  SidebarInset,
} from '@/components/ui/sidebar';
import { Leaf, BookOpen, Tractor, Rows, ListChecks, Bell, Apple } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ActivePath } from '@/components/active-path';
import { PlaceHolderImages } from '@/lib/placeholder-images';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const userAvatar = PlaceHolderImages.find(p => p.id === 'user-avatar');

  const navItems = [
    { href: '/', icon: <Tractor />, label: 'Invoer' },
    { href: '/logboek', icon: <BookOpen />, label: 'Logboek' },
    { href: '/perceelhistorie', icon: <Rows />, label: 'Perceelhistorie' },
    { href: '/percelen', icon: <Apple />, label: 'Percelen' },
    { href: '/middelmatrix', icon: <ListChecks />, label: 'MiddelMatrix' },
  ];

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary shadow-md">
              <Leaf className="size-5 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-bold text-foreground">AgriSprayer Pro</h1>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {navItems.map((item) => (
              <ActivePath key={item.href} href={item.href} passHref>
                <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Link href={item.href}>
                        {item.icon}
                        {item.label}
                      </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
              </ActivePath>
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
          <SidebarTrigger className="md:hidden" />
          <div className="w-full flex-1">
            {/* Can add a search bar here later */}
          </div>
          <Button variant="ghost" size="icon" className="rounded-full">
            <Bell className="h-5 w-5" />
            <span className="sr-only">Toggle notifications</span>
          </Button>
        </header>
        <main className="flex-1 p-4 lg:p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
