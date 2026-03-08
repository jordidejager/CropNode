import type { Metadata } from 'next';
import { DM_Serif_Display, DM_Sans } from 'next/font/google';
import './globals.css';
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import { Toaster } from "@/components/ui/toaster";

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
  icons: {
    icon: [
      { url: '/logo/cropnode-icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/logo/cropnode-icon.svg',
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
      <body className="font-body antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
