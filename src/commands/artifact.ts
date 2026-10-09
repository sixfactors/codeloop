import { Command } from 'commander';
import { ARTIFACT_KINDS, newArtifact, writeArtifactsIndex, type ArtifactKind } from '../lib/artifact.js';
import { newMock } from '../lib/mock.js';
import { guard } from './guard.js';

const isKind = (k: string): k is ArtifactKind => (ARTIFACT_KINDS as readonly string[]).includes(k);

export const artifactCommand = new Command('artifact').description(
  "A card's artifact — mock, system design, or workflow — built from the shared templates so every artifact looks like the same product",
);

artifactCommand
  .command('new <card>')
  .description(
    'Create docs/artifacts/<project>/<topic>/<card-id>-<kind>.html from templates/artifacts/<kind>/template.html. ' +
      '`--kind mock` is the same engine as `codeloop mock new`: it writes docs/mocks/<project>/<topic>/<card-id>.html instead.',
  )
  .requiredOption('--kind <kind>', `Which artifact to create: ${ARTIFACT_KINDS.join(' | ')}`)
  .requiredOption('--topic <topic>', 'Folder the artifact is filed under, e.g. board')
  .option('--from <card-id|latest|none>', 'The artifact to build on: a card id, the newest of this kind in this topic, or none for the bare template', 'latest')
  .action(
    guard((card: string, opts: { kind: string; topic: string; from: string }) => {
      if (!isKind(opts.kind)) throw new Error(`--kind must be one of: ${ARTIFACT_KINDS.join(', ')}`);
      if (opts.kind === 'mock') {
        const { path, created, from } = newMock(process.cwd(), card, opts.topic, opts.from);
        console.log(created ? `  created ${path}${from ? ` from ${from}` : ''}` : `  ${path} already exists; left as it is`);
        console.log(`Next: draw one <section data-screen="..."> per screen, then \`codeloop check artifact ${card} --kind mock\`.`);
        return;
      }
      const { path, created, from } = newArtifact(process.cwd(), card, opts.topic, opts.kind, opts.from);
      console.log(created ? `  created ${path}${from ? ` from ${from}` : ''}` : `  ${path} already exists; left as it is`);
      console.log(`Next: fill in the frontmatter list and the sections it names, then \`codeloop check artifact ${card} --kind ${opts.kind}\`.`);
    }),
  );

export const artifactsCommand = new Command('artifacts').description('The artifact gallery: mocks, system designs and workflows, grouped by kind, topic and lineage');

artifactsCommand
  .command('index')
  .description('Write docs/artifacts/index.html: kind, then project, then topic, then cards, newest first')
  .action(
    guard(() => {
      const { path, artifacts } = writeArtifactsIndex(process.cwd());
      console.log(`  ${path}: ${artifacts} ${artifacts === 1 ? 'artifact' : 'artifacts'}.`);
    }),
  );
