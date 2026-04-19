import type { Metadata } from 'next';
import { DM_Serif_Display, DM_Sans } from 'next/font/google';
import './globals.css';
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import { Toaster } from "@/components/ui/toaster";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";

const dmSerifDisplay = DM_Serif_Display({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'CropNode — Agriculture Intelligence Platform',
  description: 'CropNode is het Agriculture Intelligence Platform voor de moderne fruitteelt. AI-gestuurde registraties, 5-model weerensemble, CTGB-validatie, perceelbeheer en meer — alles in één platform.',
  manifest: '/manifest.json',
  // Note: Next.js App Router auto-picks up src/app/icon.png and src/app/apple-icon.png
  // We only need `icon` entries here for the SVG favicon fallback.
  icons: {
    icon: [
      { url: '/logo/cropnode-icon.svg', type: 'image/svg+xml' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'CropNode',
  },
  openGraph: {
    title: 'CropNode — Agriculture Intelligence Platform',
    description: 'Het complete Agriculture Intelligence Platform voor fruitteelt. AI-registraties, weermodellen, CTGB-validatie, perceelbeheer en meer.',
    type: 'website',
    locale: 'nl_NL',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CropNode — Agriculture Intelligence Platform',
    description: 'Het complete Agriculture Intelligence Platform voor fruitteelt. AI-registraties, weermodellen, CTGB-validatie, perceelbeheer en meer.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl" suppressHydrationWarning className={`dark ${dmSerifDisplay.variable} ${dmSans.variable}`}>
      <head>
        <meta name="theme-color" content="#10b981" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="font-body antialiased">
        {children}
        <Toaster />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
