import {
  Navbar,
  Hero,
  WhyCropNode,
  PlatformOverview,
  TrustBlock,
  Pricing,
  FinalCTA,
  Footer,
} from '@/components/landing';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#020617] overflow-x-hidden">
      <Navbar />
      <Hero />
      <WhyCropNode />
      <PlatformOverview />
      <TrustBlock />
      <Pricing />
      <FinalCTA />
      <Footer />
    </main>
  );
}
