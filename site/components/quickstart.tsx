import { CopyInstall } from './copy-install';

export function Quickstart() {
  return (
    <section id="quickstart" className="py-20 md:py-28">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Get started</h2>
        <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
          Install globally, init in your project, and start the board. That&apos;s it.
        </p>

        {/* Terminal block */}
        <div className="mx-auto mt-10 max-w-md overflow-hidden rounded-xl border border-border/50 bg-surface-1 text-left">
          <div className="flex items-center gap-2 border-b border-border/50 px-4 py-2.5">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
            <span className="ml-2 text-xs text-muted-foreground">terminal</span>
          </div>
          <div className="p-5 font-mono text-sm leading-7">
            <div>
              <span className="text-muted-foreground">$</span>{' '}
              <span className="text-accent">npm install -g</span> @sixfactors-ai/codeloop
            </div>
            <div>
              <span className="text-muted-foreground">$</span>{' '}
              <span className="text-muted-foreground">cd</span> your-project
            </div>
            <div>
              <span className="text-muted-foreground">$</span>{' '}
              <span className="text-accent">codeloop</span> init
            </div>
            <div>
              <span className="text-muted-foreground">$</span>{' '}
              <span className="text-accent">codeloop</span> serve
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <CopyInstall />
          <a
            href="https://github.com/sixfactors/codeloop"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-border px-5 py-3 text-sm text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            Star on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
