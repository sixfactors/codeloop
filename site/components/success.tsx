const outcomes = [
  'Public steps stop before they act. Nothing goes live until you approve.',
  'After three rejections at one gate, the lane proposes its own change and applies it only when you approve.',
  'A lesson saved once blocks the same mistake the next time.',
];

export function Success() {
  return (
    <section className="border-t border-border bg-card py-20 md:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <h2 className="text-3xl font-medium tracking-tight md:text-4xl">With it</h2>
        <ul className="mt-8 max-w-[60ch] space-y-4 text-lg text-muted-foreground">
          {outcomes.map((o) => (
            <li key={o} className="flex gap-3">
              <span className="mt-2.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" aria-hidden />
              <span>{o}</span>
            </li>
          ))}
        </ul>
        <p className="mt-12 max-w-[60ch] text-base text-foreground">
          Works in Claude Code, Cursor and Codex. Cloud optional, on Protobox. Nothing else to install.
        </p>
      </div>
    </section>
  );
}
