import { Inbox, Monitor, ShieldCheck, Undo2 } from 'lucide-react';

const features = [
  {
    icon: Inbox,
    title: 'codeloop inbox',
    description:
      'Opens with one line: shipped this week, waiting on you, oldest. For each waiting card, the file to read and the last check result.',
  },
  {
    icon: Monitor,
    title: 'codeloop serve',
    description:
      'The board in a browser: one column per stage of a lane, a "waiting for you" badge with the gate name, a detail panel with events, evidence and the card’s mock. Approve and Reject on the page need --owner.',
  },
  {
    icon: ShieldCheck,
    title: 'Public steps wait before they act',
    description:
      'Publish and production are marked outward. The card stops when it enters the stage. Nothing runs until you approve, and an agent can never approve.',
  },
  {
    icon: Undo2,
    title: 'codeloop reject c-009 "…"',
    description:
      'Your note goes into the agent’s next brief. The stage is redone once from the note, then the card waits for you again.',
  },
];

const inbox = `$ codeloop inbox
    1 shipped this week, 4 waiting on you, oldest today

    Waiting for you (4)
      c-001  triage 2026-10-04: triage/file, gate proposals
            read: triage/c-001/proposals.md   last check: passed
            codeloop approve c-001   or   codeloop reject c-001 "<what to change>"
      c-002  Dark theme for the dashboard: plan/proposed, gate proposal
            proposed from issues/12; \`codeloop card show c-002\` has the detail
            codeloop approve c-002   puts it in the plan lane   or   codeloop reject c-002 "<why not>"   drops it
      c-003  Export invoices as CSV: plan/proposed, gate proposal
            proposed from issues/15; \`codeloop card show c-003\` has the detail
            codeloop approve c-003   puts it in the plan lane   or   codeloop reject c-003 "<why not>"   drops it
      c-005  Rivalsoft shipped: Bulk CSV export: plan/proposed, gate proposal
            proposed from http://127.0.0.1:51068/changelog; \`codeloop card show c-005\` has the detail
            codeloop approve c-005   puts it in the plan lane   or   codeloop reject c-005 "<why not>"   drops it
    Shipped (1)
      c-004  scan  scan 2026-10-05
    Numbers
      analyze    active 0  waiting 0  done 0  human turns/card -  first pass -
      build      active 0  waiting 0  done 0  human turns/card -  first pass -
      deploy     active 0  waiting 0  done 0  human turns/card -  first pass -
      learn      active 0  waiting 0  done 0  human turns/card -  first pass -
      market     active 0  waiting 0  done 0  human turns/card -  first pass -
      plan       active 0  waiting 3  done 0  human turns/card 0.0  first pass -
      scan       active 0  waiting 0  done 1  human turns/card 0.0  first pass 100%
      triage     active 0  waiting 1  done 0  human turns/card 0.0  first pass -`;

export function LiveBoard() {
  return (
    <section id="board" className="py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid items-start gap-12 lg:grid-cols-2">
          {/* Text */}
          <div>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Monday morning: four things wait for you.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Overnight, the triage lane read the issues and proposed two cards. At 07:00 the scan
              read a competitor&apos;s changelog and proposed a third. Nobody typed a command. The
              inbox below is the real output from the saved demo run.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {features.map((f) => (
                <div key={f.title} className="flex gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <f.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{f.title}</p>
                    <p className="text-xs text-muted-foreground">{f.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Inbox */}
          <div className="overflow-hidden rounded-xl border border-border/50 bg-surface-1 text-left">
            <div className="flex items-center gap-2 border-b border-border/50 px-4 py-2.5">
              <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
              <span className="h-3 w-3 rounded-full bg-[#28c840]" />
              <span className="ml-2 text-xs text-muted-foreground">terminal</span>
            </div>
            <pre className="overflow-x-auto p-5 font-mono text-[11px] leading-5 text-foreground/90">
              <code>{inbox}</code>
            </pre>
          </div>
        </div>

        {/* Screenshot */}
        <div className="mt-12 rounded-xl border border-border/50 bg-surface-1 p-2 shadow-xl shadow-accent/5">
          <img
            src="/board.png"
            alt="codeloop serve: the board in a browser"
            className="w-full rounded-lg"
          />
        </div>
      </div>
    </section>
  );
}
