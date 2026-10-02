import { Command } from 'commander';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { buildPack } from '../lib/pack.js';
import { guard } from './guard.js';

export const packCommand = new Command('pack').description('Package lanes and their skills');

packCommand
  .command('build')
  .description('Compile lanes and the skills they name into a Protobox skills-only manifest')
  .option('--out <file>', 'Output file', 'dist/pack.json')
  .option('--pack-version <version>', 'Manifest version', '1.0.0')
  .action(guard((opts: { out: string; packVersion: string }) => {
    const manifest = buildPack(process.cwd(), opts.packVersion);
    const out = resolve(process.cwd(), opts.out);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`  wrote ${opts.out} with ${manifest.skills.length} skills`);
  }));
