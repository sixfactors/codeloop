import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { NavItem } from '@/lib/docs';

type Props = {
  title: string;
  description?: string;
  prev?: NavItem;
  next?: NavItem;
  children: React.ReactNode;
};

// The shell every docs page renders into: title, lede, body, prev/next.
export function DocPage({ title, description, prev, next, children }: Props) {
  return (
    <article>
      <header className="mb-8 border-b border-border pb-6">
        <h1 className="text-3xl font-medium tracking-tight md:text-4xl">{title}</h1>
        {description && <p className="mt-3 max-w-[60ch] text-lg text-muted-foreground">{description}</p>}
      </header>
      <div className="doc">{children}</div>
      {(prev || next) && (
        <nav className="mt-14 flex flex-col gap-3 border-t border-border pt-6 text-sm sm:flex-row sm:justify-between" aria-label="Pages">
          <div>
            {prev && (
              <Link href={prev.href} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary">
                <ArrowLeft className="h-3.5 w-3.5" /> {prev.title}
              </Link>
            )}
          </div>
          <div>
            {next && (
              <Link href={next.href} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary">
                {next.title} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </nav>
      )}
    </article>
  );
}
