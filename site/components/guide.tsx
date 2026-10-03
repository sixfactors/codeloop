const facts = [
  { value: 'MIT', label: 'open source' },
  { value: '289', label: 'tests' },
  { value: '75', label: 'checks in the scripted week' },
  { value: '14', label: 'cards in that week' },
];

export function Guide() {
  return (
    <section className="border-t border-border bg-card py-20 md:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <h2 className="text-3xl font-medium tracking-tight md:text-4xl">codeloop carries the rest.</h2>
        <p className="mt-6 max-w-[60ch] text-lg text-muted-foreground">
          We ship Protobox with the same agents and had the same week.
        </p>
        <p className="mt-3 max-w-[60ch] text-lg text-muted-foreground">
          Built on lanes and gates. The cloud runs on Protobox.
        </p>
        <dl className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
          {facts.map((f) => (
            <div key={f.label} className="rounded-lg border border-border bg-background p-5">
              <dt className="font-mono text-2xl font-medium text-primary">{f.value}</dt>
              <dd className="mt-1 text-sm text-muted-foreground">{f.label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
