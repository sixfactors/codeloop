import { ArrowDown } from 'lucide-react';
import { CopyInstall } from './copy-install';

export function Hero() {
  return (
    <section className="pt-32 pb-20 md:pt-44 md:pb-28">
      <div className="mx-auto max-w-5xl px-4 text-center sm:px-6">
        <h1 className="mx-auto max-w-[20ch] text-4xl font-medium tracking-tight sm:text-5xl md:text-6xl">
          Your product moves forward every day.
        </h1>
        <p className="mx-auto mt-6 max-w-[60ch] text-lg text-muted-foreground md:text-xl">
          Agents do the stages of each job. You approve at the gates.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4">
          <CopyInstall />
          <a
            href="#week"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            See a week <ArrowDown className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </section>
  );
}
