import { Navbar } from '@/components/navbar';
import { HeroSplit } from '@/components/sections/hero-split';
import { RealityToday } from '@/components/sections/reality-today';
import { SolutionOverview } from '@/components/sections/solution-overview';
import { FeaturesGrid } from '@/components/sections/features-grid';
import { WhoFor } from '@/components/sections/who-for';
import { ProofStrip } from '@/components/sections/proof-strip';
import { FaqSection } from '@/components/sections/faq-section';
import { PageTail } from '@/components/sections/page-tail';
import { Footer } from '@/components/footer';

// StoryBrand order: character (hero), problem, guide (loop, features, who it is for), proof,
// call to action. Sections are copies of chanl-site/src/components/sections with strings inlined.
export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <HeroSplit />
        <RealityToday />
        <SolutionOverview />
        <FeaturesGrid />
        <WhoFor />
        <ProofStrip />
        <FaqSection />
        <PageTail />
      </main>
      <Footer />
    </>
  );
}
