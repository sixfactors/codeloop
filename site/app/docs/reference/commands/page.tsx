import type { Metadata } from 'next';
import { DocPage } from '@/components/doc-page';
import { prevNext } from '@/lib/docs';
import data from '@/content/commands.json';

export const metadata: Metadata = {
  title: 'Commands',
  description: 'Every codeloop command and flag, generated from the CLI help output.',
};

type Row = { signature: string; description: string };
type Cmd = { name: string; usage: string; description: string; arguments: Row[]; options: Row[]; commands: Cmd[] };

function Rows({ rows, label }: { rows: Row[]; label: string }) {
  if (!rows.length) return null;
  return (
    <table>
      <thead>
        <tr>
          <th>{label}</th>
          <th>What it does</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.signature}>
            <td>
              <code>{r.signature}</code>
            </td>
            <td>{r.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Command({ cmd, depth }: { cmd: Cmd; depth: number }) {
  const id = cmd.name.replace(/\s+/g, '-');
  const H = depth === 0 ? 'h2' : 'h3';
  return (
    <section>
      <H id={id}>
        <code>codeloop {cmd.name}</code>
      </H>
      <p>{cmd.description}</p>
      <div className="code">
        <pre>
          <code>{cmd.usage}</code>
        </pre>
      </div>
      <Rows rows={cmd.arguments} label="Argument" />
      <Rows rows={cmd.options} label="Option" />
      {cmd.commands.map((c) => (
        <Command key={c.name} cmd={c} depth={depth + 1} />
      ))}
    </section>
  );
}

export default function CommandsPage() {
  const { prev, next } = prevNext('/docs/reference/commands');
  const commands = data.commands as Cmd[];
  return (
    <DocPage title="Commands" description={metadata.description as string} prev={prev} next={next}>
      <p>
        Generated from <code>codeloop --help</code> and every <code>&lt;command&gt; --help</code> at build time by{' '}
        <code>site/scripts/gen-commands.mjs</code>. codeloop {data.version}. Nothing on this page is typed by hand, so a
        flag listed here is a flag the CLI has.
      </p>
      <h2 id="all-commands">All commands</h2>
      <ul>
        {commands.map((c) => (
          <li key={c.name}>
            <a href={`#${c.name.replace(/\s+/g, '-')}`}>
              <code>{c.name}</code>
            </a>{' '}
            {c.description}
          </li>
        ))}
      </ul>
      {commands.map((c) => (
        <Command key={c.name} cmd={c} depth={0} />
      ))}
    </DocPage>
  );
}
