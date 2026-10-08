import Link from 'next/link';
import { CopyInstall } from '@/components/copy-install';

// The closer, in the place chanl-site's page-tail.tsx holds. Its blog and newsletter strips do
// not apply here; this is the install line and the two links.
export function PageTail() {
  return (
    <section id="install" className="section-padding container scroll-mt-20">
      <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center md:px-16 md:py-16">
        <h2 className="text-3xl font-medium tracking-tight md:text-4xl">Install it.</h2>
        <p className="mx-auto mt-4 max-w-[50ch] text-lg text-muted-foreground">
          Your repo, your agent, your gates.
        </p>
        <div className="mt-8 flex justify-center">
          <CopyInstall />
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
          <Link href="/docs/start/install" className="text-primary underline-offset-4 hover:underline">
            Read the docs
          </Link>
          <a
            href="https://github.com/sixfactors/codeloop"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            Read the code on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
