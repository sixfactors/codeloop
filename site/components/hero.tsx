import { CopyInstall } from './copy-install';

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-16 md:pt-40 md:pb-24">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 h-[600px] w-[800px] rounded-full bg-accent-glow blur-[120px] opacity-40" />

      <div className="relative mx-auto max-w-4xl px-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
          Code agents that{' '}
          <span className="text-accent">project manage themselves.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
          Your AI agent designs, plans, tests, deploys, and debugs — learning from every
          mistake across sessions, across tools.
        </p>

        <div className="mt-10 flex flex-col items-center gap-4">
          <CopyInstall />
          <a
            href="#loop"
            className="text-sm text-muted-foreground transition-colors hover:text-accent"
          >
            See how it works &darr;
          </a>
        </div>
      </div>

      {/* Board screenshot */}
      <div className="relative mx-auto mt-16 max-w-5xl px-6">
        <div className="rounded-xl border border-border/50 bg-surface-1 p-2 shadow-2xl shadow-accent/5">
          <img
            src="/board.png"
            alt="Codeloop board — live task tracking for AI agents"
            className="w-full rounded-lg"
          />
        </div>
      </div>
    </section>
  );
}
