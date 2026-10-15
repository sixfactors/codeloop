import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { createApp } from '../server.js';

const at = '2026-10-15T10:00:00.000Z';
const card = (id: string, spec: string) => ({ id, title: `Story ${id}`, lane: 'build', laneVersion: 1, stage: 'build', spec, retries: {}, evidence: [], events: [], createdAt: at, updatedAt: at });

describe('GET /api/artifacts for the Mocks page', () => {
  let dir: string;
  const write = (path: string, text: string) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'codeloop-gallery-'));
    write('.codeloop/config.yaml', 'project:\n  name: demo\nmock:\n  target: app\n  app_dir: workspace/app\n');
    write('.codeloop/lanes/build.yaml', 'id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: build\n    done: { cmd: "true" }\n');
    write('.codeloop/cards.json', JSON.stringify({ version: 1, cards: [card('c-118', 'specs/118-holder'), card('c-140', 'specs/140-reuse')] }));
    write('specs/118-holder/spec.md', '# Holder\n\nscreens:\n- story-properties\n- story-links\n');
    write('workspace/app/mocks/118-holder/page.tsx', '<section data-screen="story-properties" />\n<section data-screen={"story-links"} />\n');
    write('specs/140-reuse/spec.md', '# Reuse\n\nscreens:\n- story page (mocks/118)\n');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('lists an in-app mock with its folder, one frame per data-screen, and the cards that take a screen from it', async () => {
    const { app } = createApp(dir, undefined, { token: 't' });
    const { artifacts } = await (await app.request('/api/artifacts')).json() as { artifacts: { cardId?: string; folder?: string; frames: string[]; referencedBy: { cardId: string; screen: string }[] }[] };
    const mock = artifacts.find(a => a.cardId === 'c-118');
    expect(mock?.folder).toBe('118-holder');
    expect(mock?.frames).toEqual(['story-properties', 'story-links']);
    expect(mock?.referencedBy).toEqual([{ cardId: 'c-140', screen: 'story page' }]);
  });
});
