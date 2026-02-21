import { Navbar } from '@/components/navbar';
import { Hero } from '@/components/hero';
import { Problem } from '@/components/problem';
import { Loop } from '@/components/loop';
import { Knowledge } from '@/components/knowledge';
import { LiveBoard } from '@/components/live-board';
import { Compatibility } from '@/components/compatibility';
import { Quickstart } from '@/components/quickstart';
import { Footer } from '@/components/footer';

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Problem />
        <Loop />
        <Knowledge />
        <LiveBoard />
        <Compatibility />
        <Quickstart />
      </main>
      <Footer />
    </>
  );
}
