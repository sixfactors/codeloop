// Two cards in the features-grid card style: what the published package has, and what the trunk
// adds. Versions come from CHANGELOG.md; update both lists at each publish.
const RELEASES = [
  {
    badge: 'Published',
    title: '0.4.3',
    items: [
      'Workspace board, inbox and initiatives',
      'Story fields, interview stage, questions and answers',
      'Wiki with diagrams; the C4 architecture folder seeded by wiki init',
      'Claude Code, Cursor, Codex and MCP hosts',
    ],
  },
  {
    badge: 'Unreleased',
    title: '0.5.0',
    items: [
      'One main tree by default: builders under file leases, fixed forward',
      'Everything codeloop writes lives under .codeloop/',
      'codeloop off and on pause hooks and the orchestrator',
      'codeloop orch run with one budget per run, stop reasons and a memory ceiling',
      'Story journey: activity stream, one state per card, rubric rows at gates',
      'Hook daemon: session start in 0.3 s instead of 3 s',
    ],
  },
];

export function WhatsNew() {
  return (
    <section className="section-padding container">
      <div className="mb-10 lg:mb-14">
        <div className="mb-4 flex items-center gap-2">
          <span className="size-3 rounded-full bg-primary" />
          <span className="text-sm font-semibold uppercase tracking-wider text-primary">Releases</span>
        </div>
        <h2 className="max-w-3xl text-4xl font-medium leading-tight tracking-tight md:text-5xl">
          What is in each version
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {RELEASES.map((r) => (
          <div key={r.title} className="flex h-full flex-col rounded-xl border border-border bg-card p-8">
            <span className="mb-2 inline-block w-fit rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
              {r.badge}
            </span>
            <h3 className="text-2xl font-medium text-card-foreground">{r.title}</h3>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
              {r.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
