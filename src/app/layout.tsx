import type { Metadata } from 'next';
import './globals.css';
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import { Toaster } from "@/components/ui/toaster";
// import FirebaseClientProvider from '@/firebase/client-provider';

export const metadata: Metadata = {
  title: 'AgriSprayer Pro',
  description: 'Een slimme registratie-app voor gewasbescherming.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl" suppressHydrationWarning className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=PT+Sans:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        {/* <FirebaseClientProvider> */}
        {children}
        {/* </FirebaseClientProvider> */}
        <Toaster />
      </body>
    </html>
  );
}
