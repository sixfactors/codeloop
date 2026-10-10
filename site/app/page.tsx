import { Navbar } from '@/components/navbar';
import { HeroSplit } from '@/components/sections/hero-split';
import { TerminalProof } from '@/components/sections/terminal-proof';
import { RealityToday } from '@/components/sections/reality-today';
import { TypicalDay } from '@/components/sections/typical-day';
import { CompareLine } from '@/components/sections/compare-line';
import { SolutionOverview } from '@/components/sections/solution-overview';
import { FeaturesGrid } from '@/components/sections/features-grid';
import { WhoFor } from '@/components/sections/who-for';
import { ProofStrip } from '@/components/sections/proof-strip';
import { FaqSection } from '@/components/sections/faq-section';
import { PageTail } from '@/components/sections/page-tail';
import { Footer } from '@/components/footer';

// Order: hero, a runnable proof, the problem, three steps, a day with one card, what is in the
// package, the comparison line, who it is for, proof numbers, questions, install. Sections are copies of chanl-site/src/components/sections with strings inlined.
export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <HeroSplit />
        <RealityToday />
        <SolutionOverview />
        <TypicalDay />
        <TerminalProof />
        <FeaturesGrid />
        <CompareLine />
        <WhoFor />
        <ProofStrip />
        <FaqSection />
        <PageTail />
      </main>
      <Footer />
    </>
  );
}
