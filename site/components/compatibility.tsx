const stacks = [
  { name: 'TypeScript', detected: 'tsconfig.json', config: 'Typecheck, console.log scan, any warnings' },
  { name: 'Python', detected: 'pyproject.toml', config: 'mypy, ruff, print() detection, pdb scan' },
  { name: 'Go', detected: 'go.mod', config: 'go vet, go build, fmt.Print detection' },
  { name: 'Generic', detected: 'Fallback', config: 'Minimal — you configure' },
];

const tools = [
  { name: 'Claude Code', path: '.claude/commands/', format: 'Markdown + frontmatter' },
  { name: 'Cursor', path: '.cursor/commands/', format: 'Markdown + frontmatter' },
  { name: 'Codex', path: '.agents/skills/', format: 'SKILL.md with YAML frontmatter' },
];

export function Compatibility() {
  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Works with everything
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Auto-detects your stack and your tools. The knowledge base is shared — same gotchas,
            same patterns, same rules across all tools.
          </p>
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-2">
          {/* Stacks */}
          <div className="rounded-xl border border-border/50 bg-surface-1 p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Stacks
            </h3>
            <div className="mt-4 space-y-3">
              {stacks.map((s) => (
                <div key={s.name} className="flex items-start gap-3">
                  <span className="mt-0.5 font-mono text-sm font-medium text-accent">{s.name}</span>
                  <span className="text-xs text-muted-foreground">{s.config}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tools */}
          <div className="rounded-xl border border-border/50 bg-surface-1 p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Tools
            </h3>
            <div className="mt-4 space-y-3">
              {tools.map((t) => (
                <div key={t.name} className="flex items-start gap-3">
                  <span className="mt-0.5 font-mono text-sm font-medium text-accent">{t.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {t.path} &middot; {t.format}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
