import { Activity, GripVertical, Moon, Monitor } from 'lucide-react';

const features = [
  {
    icon: Activity,
    title: 'Real-time SSE',
    description: 'Watch tasks move as your agent works. Live streaming updates.',
  },
  {
    icon: GripVertical,
    title: 'Drag and drop',
    description: 'Reorder and reprioritize tasks with drag-and-drop.',
  },
  {
    icon: Moon,
    title: 'Dark theme',
    description: 'Built for developers. Dark by default, easy on the eyes.',
  },
  {
    icon: Monitor,
    title: 'codeloop serve',
    description: 'One command to start the board. Open in your browser.',
  },
];

export function LiveBoard() {
  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          {/* Text */}
          <div>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Watch your agent think.
            </h2>
            <p className="mt-4 text-muted-foreground">
              A live kanban board that updates in real-time as your AI agent works. See
              what&apos;s planned, what&apos;s in progress, and what just shipped.
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

          {/* Screenshot */}
          <div className="rounded-xl border border-border/50 bg-surface-1 p-2 shadow-xl shadow-accent/5">
            <img
              src="/board.png"
              alt="Codeloop live board"
              className="w-full rounded-lg"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
