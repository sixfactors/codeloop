import { BookOpen, GitBranch, Inbox, Kanban, Layers, type LucideIcon, Plug } from 'lucide-react';

// Copied from chanl-site/src/components/sections/features-grid.tsx and feature-cards.tsx: the
// badge, title, description and large faded icon per card. Filter tabs, links, analytics and the
// Card primitive are dropped; six fixed cards instead of a catalog.
interface Feature {
  badge: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

const FEATURES: Feature[] = [
  { badge: 'Work', title: 'Board', description: 'Every card by lane and stage. Proposed cards wait in the backlog.', icon: Kanban },
  { badge: 'Work', title: 'Inbox', description: 'What waits on you, oldest first, with the exact commands to type.', icon: Inbox },
  { badge: 'Work', title: 'Initiatives and priority', description: 'Initiative, epic, feature, story, each with a metric and a goal.', icon: Layers },
  { badge: 'Knowledge', title: 'Wiki', description: 'Pages agents read before a stage and write after. The same lesson three times becomes critical.', icon: BookOpen },
  { badge: 'Engine', title: 'Lanes and gates', description: 'A lane file per kind of work. A stage is done when its command exits 0. An agent cannot approve a gate.', icon: GitBranch },
  { badge: 'Engine', title: 'Any host', description: 'Claude Code, Cursor, Codex and any MCP client. init writes the skills for each.', icon: Plug },
];

export function FeaturesGrid() {
  return (
    <section className="section-padding container">
      <div className="mb-10 lg:mb-14">
        <div className="mb-4 flex items-center gap-2">
          <span className="size-3 rounded-full bg-primary" />
          <span className="text-sm font-semibold uppercase tracking-wider text-primary">What ships</span>
        </div>
        <h2 className="max-w-3xl text-4xl font-medium leading-tight tracking-tight md:text-5xl">
          A board, an inbox and an engine that keeps score.
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="flex h-full min-h-[240px] flex-col rounded-xl border border-border bg-card p-8">
            <div className="space-y-3">
              <span className="mb-2 inline-block rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
                {f.badge}
              </span>
              <h3 className="text-2xl font-medium text-card-foreground">{f.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{f.description}</p>
            </div>
            <div className="mt-auto flex justify-end pt-6">
              <f.icon className="size-16 text-muted-foreground/25" strokeWidth={1.2} aria-hidden />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
