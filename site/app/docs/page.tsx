import type { Metadata } from 'next';
import Link from 'next/link';
import { CopyInstall } from '@/components/copy-install';
import { DocPage } from '@/components/doc-page';
import { docsNav } from '@/lib/docs';

export const metadata: Metadata = {
  title: 'codeloop docs',
  description: 'Install codeloop, start a card, read the inbox, approve a gate. Then the concepts and the reference.',
};

const loop = [
  { cmd: 'codeloop start "<title>"', note: 'opens a card in a lane' },
  { cmd: 'codeloop run --agent', note: 'an agent does the stage, the check decides' },
  { cmd: 'codeloop approve <id>', note: 'you decide at the gates' },
  { cmd: 'codeloop lane propose', note: 'repeated rejections become a lane change' },
];

const paths = [
  { work: 'A feature', lane: 'build', start: 'codeloop start "<title>"', stops: 'spec, local, pr, prod' },
  { work: 'A release', lane: 'deploy', start: 'a git tag', stops: 'prod' },
  { work: 'A launch post', lane: 'market', start: 'a build card finishing', stops: 'copy, publish' },
  { work: "This week's plan", lane: 'plan', start: 'Monday 09:00', stops: 'backlog' },
  { work: 'Issues and feedback', lane: 'triage', start: 'every day 20:00', stops: 'proposals' },
  { work: 'What competitors shipped', lane: 'scan', start: 'Monday 07:00', stops: 'each proposal' },
  { work: 'The growth numbers', lane: 'analyze', start: 'Friday 09:00', stops: 'verdicts' },
  { work: 'A lesson', lane: 'learn', start: 'codeloop start "<title>" --lane learn', stops: 'rule' },
];

export default function DocsHome() {
  return (
    <DocPage title="codeloop docs" description={metadata.description as string}>
      <h2 id="install">Install</h2>
      <div className="not-doc my-4 flex flex-col items-start gap-3">
        <CopyInstall />
        <CopyInstall command="codeloop init" />
      </div>
      <p>
        Node 20 or newer. <code>init</code> writes <code>.codeloop/</code> with eight lanes and the skills for the host you
        pick. <Link href="/docs/start/install">Install</Link> shows what it writes.
      </p>

      <h2 id="the-loop">The loop</h2>
      <ol className="not-doc my-4 grid gap-3 sm:grid-cols-2">
        {loop.map((s, i) => (
          <li key={s.cmd} className="rounded-lg border border-border bg-card p-4">
            <span className="font-mono text-xs text-muted-foreground">{i + 1}</span>
            <code className="mt-1 block break-words font-mono text-sm font-medium text-card-foreground">{s.cmd}</code>
            <p className="mt-1 text-sm text-muted-foreground">{s.note}</p>
          </li>
        ))}
      </ol>
      <p>
        A stage is done when its check command exits 0. A gate holds the card until a person approves. Three rejections
        at one gate produce a lane proposal. <Link href="/docs/concepts/lanes">Lanes</Link> has the detail.
      </p>

      <h2 id="choose-your-path">Choose your path</h2>
      <p>Each kind of work has a lane. The lane says what starts it and where it stops for you.</p>
      <table>
        <thead>
          <tr>
            <th>Work</th>
            <th>Lane</th>
            <th>Starts from</th>
            <th>Stops for you at</th>
          </tr>
        </thead>
        <tbody>
          {paths.map((p) => (
            <tr key={p.lane}>
              <td>{p.work}</td>
              <td>
                <Link href={`/docs/reference/lanes#${p.lane}`}>
                  <code>{p.lane}</code>
                </Link>
              </td>
              <td>
                <code>{p.start}</code>
              </td>
              <td>{p.stops}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 id="pages">Pages</h2>
      <div className="not-doc grid gap-6 sm:grid-cols-2">
        {docsNav.map((g) => (
          <div key={g.title} className="rounded-lg border border-border bg-card p-5">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.title}</div>
            <ul className="space-y-1">
              {g.items.map((i) => (
                <li key={i.href}>
                  <Link href={i.href} className="text-sm text-primary underline-offset-4 hover:underline">
                    {i.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </DocPage>
  );
}
