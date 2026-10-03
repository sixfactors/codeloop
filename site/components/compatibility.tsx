const tools = [
  { name: 'Claude Code', path: '.claude/agents/codeloop-<lane>-<stage>.md', note: 'one agent file per stage' },
  { name: 'Cursor', path: '.cursor/rules/codeloop-<lane>.mdc', note: 'one rule per lane' },
  { name: 'Codex', path: '.agents/skills/codeloop-<lane>/SKILL.md', note: 'one skill per lane' },
  { name: 'Any of them', path: 'AGENTS.md', note: 'a block between codeloop:start and codeloop:end' },
];

const cloud = [
  { cmd: 'codeloop cloud connect --url <mcp url> --key <api key>', note: 'uploads the board, config.yaml, the lanes and the wiki to a Protobox workspace' },
  { cmd: 'codeloop cloud status', note: 'every document as in-sync, local-ahead, cloud-ahead or both-changed' },
  { cmd: 'codeloop cloud pull | push', note: 'a version check on every card write, so two checkouts cannot both land a write from the same board' },
  { cmd: 'codeloop cloud disconnect', note: 'pulls everything back into the repo; the local files were a full working copy all along' },
];

export function Compatibility() {
  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Same files in Claude Code, Cursor and Codex
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            The lanes, the cards and the wiki are files in your repo. <code className="font-mono text-sm">codeloop render</code>{' '}
            writes each lane for the tool you open today. <code className="font-mono text-sm">codeloop run --agent claude</code>{' '}
            or <code className="font-mono text-sm">--agent codex</code> picks which one does the work unattended.
          </p>
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-2">
          {/* Tools */}
          <div className="rounded-xl border border-border/50 bg-surface-1 p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Tools
            </h3>
            <div className="mt-4 space-y-3">
              {tools.map((t) => (
                <div key={t.name} className="flex flex-col gap-0.5">
                  <span className="font-mono text-sm font-medium text-accent">{t.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{t.path}</span>
                  <span className="text-xs text-muted-foreground">{t.note}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Cloud, optional */}
          <div className="rounded-xl border border-border/50 bg-surface-1 p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Cloud, optional
            </h3>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Local files are the default and nothing here is needed. Several checkouts can share
              one board by saving it to a Protobox workspace. Only codeloop is installed; there is
              no Protobox CLI. There is no hosted service yet; this works against a Protobox
              workspace you have.
            </p>
            <div className="mt-4 space-y-3">
              {cloud.map((c) => (
                <div key={c.cmd} className="flex flex-col gap-0.5">
                  <span className="font-mono text-xs font-medium text-accent">{c.cmd}</span>
                  <span className="text-xs text-muted-foreground">{c.note}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
