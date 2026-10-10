import type { Metadata } from 'next';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { DocsSidebar } from '@/components/docs-sidebar';
import { docsNav, searchIndex } from '@/lib/docs';

export const metadata: Metadata = {
  title: { default: 'codeloop docs', template: '%s · codeloop docs' },
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const index = searchIndex();
  return (
    <>
      <Navbar />
      <div className="mx-auto max-w-6xl px-4 pt-24 pb-20 sm:px-6 md:grid md:grid-cols-[14rem_minmax(0,1fr)] md:gap-10 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <DocsSidebar nav={docsNav} index={index} />
        <main className="min-w-0">{children}</main>
      </div>
      <Footer />
    </>
  );
}
