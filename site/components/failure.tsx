const lines = [
  'A release goes out that nobody checked.',
  'A feature ships and the launch post never gets written.',
  'The same mistake lands a third time.',
];

export function Failure() {
  return (
    <section className="border-t border-border py-20 md:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <h2 className="text-3xl font-medium tracking-tight md:text-4xl">Without it</h2>
        <ul className="mt-8 max-w-[60ch] space-y-4 text-lg text-muted-foreground">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
