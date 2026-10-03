import { CopyInstall } from './copy-install';

// Trimmed from the Monday-morning inbox in docs/artifacts/demo-founder-week.txt.
const inbox = `$ codeloop inbox
    1 shipped this week, 4 waiting on you, oldest today

    Waiting for you (4)
      c-001  triage 2026-10-04: triage/file, gate proposals
      c-002  Dark theme for the dashboard: plan/proposed, gate proposal
      c-003  Export invoices as CSV: plan/proposed, gate proposal
      c-005  Rivalsoft shipped: Bulk CSV export: plan/proposed, gate proposal
    Shipped (1)
      c-004  scan  scan 2026-10-05`;

export function CallToAction() {
  return (
    <section id="week" className="scroll-mt-14 border-t border-border bg-card py-20 md:py-28">
      <div className="mx-auto grid max-w-5xl items-start gap-12 px-4 sm:px-6 lg:grid-cols-2">
        <div id="install" className="min-w-0 scroll-mt-20">
          <h2 className="text-3xl font-medium tracking-tight md:text-4xl">Start today.</h2>
          <p className="mt-6 max-w-[60ch] text-lg text-muted-foreground">Install it, or run it once.</p>
          <div className="mt-6 flex flex-col items-start gap-3">
            <CopyInstall />
            <CopyInstall command="npx @protoboxai/codeloop init" />
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <a
              href="https://github.com/sixfactors/codeloop"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              Read the code on GitHub
            </a>
            <a
              href="https://github.com/sixfactors/codeloop/blob/main/docs/artifacts/demo-founder-week.txt"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              Read the saved founder&apos;s week
            </a>
          </div>
        </div>

        <div className="min-w-0 overflow-hidden rounded-lg bg-code-bg">
          <div className="border-b border-white/10 bg-code-header px-4 py-2 font-mono text-xs text-code-filename">
            Monday morning, from the saved week
          </div>
          <pre className="overflow-x-auto p-4 font-mono text-[11px] leading-6 text-code-foreground sm:p-5 sm:text-xs">
            <code>{inbox}</code>
          </pre>
        </div>
      </div>
    </section>
  );
}
