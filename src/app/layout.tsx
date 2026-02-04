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
  title: 'CropOS — Het platform voor moderne fruitteelt',
  description: 'CropOS brengt je percelen, gewasbescherming, uren en bedrijfsdata samen in één slim platform. Begin met typen — CropOS begrijpt de rest.',
  openGraph: {
    title: 'CropOS — Het platform voor moderne fruitteelt',
    description: 'CropOS brengt je percelen, gewasbescherming, uren en bedrijfsdata samen in één slim platform.',
    type: 'website',
    locale: 'nl_NL',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CropOS — Het platform voor moderne fruitteelt',
    description: 'CropOS brengt je percelen, gewasbescherming, uren en bedrijfsdata samen in één slim platform.',
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
