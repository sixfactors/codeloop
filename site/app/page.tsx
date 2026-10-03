import { Navbar } from '@/components/navbar';
import { Hero } from '@/components/hero';
import { Problem } from '@/components/problem';
import { Guide } from '@/components/guide';
import { Plan } from '@/components/plan';
import { CallToAction } from '@/components/call-to-action';
import { Failure } from '@/components/failure';
import { Success } from '@/components/success';
import { Footer } from '@/components/footer';

// StoryBrand 7, one component per beat, in order.
export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Problem />
        <Guide />
        <Plan />
        <CallToAction />
        <Failure />
        <Success />
      </main>
      <Footer />
    </>
  );
}
