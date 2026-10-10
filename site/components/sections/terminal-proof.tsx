import Image from 'next/image';
import Link from 'next/link';

// Four commands from install to an agent running. Each line is a real command; the notes say
// what the reader sees after it. The Start docs carry the full output.
const STEPS = [
  { cmd: 'npm install -g @protoboxai/codeloop', note: 'One package. Node 20 or newer.' },
  { cmd: 'codeloop init --tools claude', note: 'Writes the workflows, stage skills and hooks into your repo. Also cursor, codex.' },
  { cmd: 'codeloop serve --open', note: 'Opens the board. Add your first user story with the New story button.' },
  { cmd: 'codeloop run --agent', note: 'Starts your agent on the first stage. Watch the story move on the board.' },
];

function Line({ cmd }: { cmd: string }) {
  const [name, ...rest] = cmd.split(' ');
  return (
    <code className="block whitespace-pre-wrap font-mono text-sm md:text-base">
      <span className="text-muted-foreground">$ </span>
      <span className="text-primary">{name}</span>
      {rest.map((part, i) => (
        <span key={i} className={part.startsWith('--') ? 'text-muted-foreground' : 'text-card-foreground'}>
          {' '}
          {part}
        </span>
      ))}
    </code>
  );
}

export function TerminalProof() {
  return (
    <section className="section-padding container">
      <div className="mb-10">
        <div className="mb-4 flex items-center gap-2">
          <span className="size-3 rounded-full bg-primary" />
          <span className="text-sm font-semibold uppercase tracking-wider text-primary">Get started</span>
        </div>
        <h2 className="max-w-3xl text-4xl font-medium leading-tight tracking-tight md:text-5xl">
          Four commands to a running agent
        </h2>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-12 lg:gap-8">
        <ol className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card lg:col-span-6">
          {STEPS.map((s, i) => (
            <li key={s.cmd} className="flex gap-4 p-5">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 font-mono text-xs font-medium text-primary">
                {i + 1}
              </span>
              <div className="min-w-0">
                <Line cmd={s.cmd} />
                <p className="mt-1.5 text-sm text-muted-foreground">{s.note}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="lg:col-span-6">
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-lg">
            <Image src="/screens/board.png" alt="The board after the first story is added" width={1440} height={900} unoptimized className="block h-auto w-full" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Unattended runs need an agent command in <code>.codeloop/config.yaml</code>, for example <code>claude -p</code>.
            Prefer the terminal?{' '}
            <Link href="/docs/start/first-card" className="text-primary underline-offset-4 hover:underline">
              Your first story, command by command
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
