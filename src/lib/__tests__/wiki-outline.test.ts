import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { buildOutline, outlineSummary, REPO_FACTS_PATH, scanRepo, scanTopFolders, writeOutline } from '../wiki-outline.js';
import { WIKI_DIR } from '../wiki.js';

let dir: string;

function write(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

/** Express + Mongoose: a package.json, a Makefile, a route file and a schema file. */
function expressMongooseRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'codeloop-outline-express-'));
  write(root, 'README.md', '# widget-api\n\nServes widgets to the storefront over a small REST API.\n');
  write(root, 'package.json', JSON.stringify({ name: 'widget-api', dependencies: { express: '^4.0.0', mongoose: '^8.0.0' }, scripts: { test: 'vitest run' } }));
  write(root, 'package-lock.json', '{}');
  write(root, 'Makefile', ['dev:', '\tnode server.js', '', 'test:', '\tnpm test', ''].join('\n'));
  write(
    root,
    'src/routes/widgets.ts',
    [
      "import { Router } from 'express';",
      'const router = Router();',
      "router.get('/widgets', listWidgets);",
      "router.post('/widgets', createWidget);",
      'export default router;',
    ].join('\n'),
  );
  write(
    root,
    'src/models/widget.ts',
    [
      "import mongoose from 'mongoose';",
      'const widgetSchema = new mongoose.Schema({',
      '  name: String,',
      '  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "Owner" },',
      '});',
      "export const Widget = mongoose.model('Widget', widgetSchema);",
    ].join('\n'),
  );
  return root;
}

/** Next.js + Prisma: an app/api route handler and a prisma schema. */
function nextPrismaRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'codeloop-outline-next-'));
  write(root, 'package.json', JSON.stringify({ name: 'storefront', dependencies: { next: '^14.0.0', react: '^18.0.0' }, devDependencies: { prisma: '^5.0.0' } }));
  write(
    root,
    'app/api/orders/[id]/route.ts',
    ['export async function GET() {', "  return new Response('ok');", '}'].join('\n'),
  );
  write(
    root,
    'prisma/schema.prisma',
    ['model Order {', '  id        String   @id', '  total     Int', '  customer  Customer @relation(fields: [customerId], references: [id])', '  customerId String', '}', '', 'model Customer {', '  id    String @id', '  name  String', '}'].join('\n'),
  );
  return root;
}

/** FastAPI + SQLAlchemy: a routes module and a models module. */
function fastapiSqlalchemyRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'codeloop-outline-fastapi-'));
  write(root, 'pyproject.toml', '[project]\nname = "ledger-api"\ndependencies = ["fastapi", "sqlalchemy"]\n');
  write(
    root,
    'app/routes.py',
    ['from fastapi import APIRouter', 'router = APIRouter()', '', '@router.get("/accounts")', 'def list_accounts():', '    return []', '', '@router.post("/accounts")', 'def create_account():', '    return {}'].join('\n'),
  );
  write(
    root,
    'app/models.py',
    [
      'from sqlalchemy import Column, Integer, String',
      'from sqlalchemy.orm import relationship',
      'from .base import Base',
      '',
      'class Account(Base):',
      "    __tablename__ = 'accounts'",
      '    id = Column(Integer, primary_key=True)',
      '    name = Column(String)',
      "    entries = relationship('Entry')",
    ].join('\n'),
  );
  return root;
}

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('wiki-outline: scanning', () => {
  it('detects the stack of each fixture from its own manifest', () => {
    dir = expressMongooseRepo();
    const express = scanRepo(dir).stack;
    expect(express.map(s => s.tech)).toEqual(expect.arrayContaining(['Node.js', 'express', 'mongoose']));
    rmSync(dir, { recursive: true, force: true });

    dir = nextPrismaRepo();
    const next = scanRepo(dir).stack;
    expect(next.map(s => s.tech)).toEqual(expect.arrayContaining(['Node.js', 'next']));
    rmSync(dir, { recursive: true, force: true });

    dir = fastapiSqlalchemyRepo();
    const fastapi = scanRepo(dir).stack;
    expect(fastapi).toEqual(expect.arrayContaining([expect.objectContaining({ tech: 'Python', source: 'pyproject.toml' }), expect.objectContaining({ tech: 'fastapi' }), expect.objectContaining({ tech: 'sqlalchemy' })]));
  });

  it('finds routes in Express, Next route handlers and FastAPI', () => {
    dir = expressMongooseRepo();
    expect(scanRepo(dir).routes).toEqual(expect.arrayContaining([{ method: 'GET', path: '/widgets', file: 'src/routes/widgets.ts', handler: 'src/routes/widgets.ts' }, { method: 'POST', path: '/widgets', file: 'src/routes/widgets.ts', handler: 'src/routes/widgets.ts' }]));
    rmSync(dir, { recursive: true, force: true });

    dir = nextPrismaRepo();
    expect(scanRepo(dir).routes).toEqual([{ method: 'GET', path: '/api/orders/:id', file: 'app/api/orders/[id]/route.ts', handler: 'GET' }]);
    rmSync(dir, { recursive: true, force: true });

    dir = fastapiSqlalchemyRepo();
    const fastapiRoutes = scanRepo(dir).routes;
    expect(fastapiRoutes).toEqual(expect.arrayContaining([expect.objectContaining({ method: 'GET', path: '/accounts' }), expect.objectContaining({ method: 'POST', path: '/accounts' })]));
  });

  it('draws the ERD from Mongoose refs and Prisma relations', () => {
    dir = expressMongooseRepo();
    const mongoose = scanRepo(dir).entities;
    expect(mongoose).toHaveLength(1);
    expect(mongoose[0]).toMatchObject({ name: 'Widget', relations: [{ to: 'Owner', kind: 'ref' }], source: 'src/models/widget.ts' });
    expect(mongoose[0].fields).toEqual(expect.arrayContaining(['ownerId', 'name']));
    const erd = buildOutline(dir).find(p => p.path.endsWith('erd.md'))!;
    expect(erd.body).toContain('erDiagram');
    expect(erd.body).toContain('Widget }o--o{ Owner');
    rmSync(dir, { recursive: true, force: true });

    dir = nextPrismaRepo();
    const prisma = scanRepo(dir).entities;
    expect(prisma.map(e => e.name)).toEqual(['Order', 'Customer']);
    expect(prisma.find(e => e.name === 'Order')!.relations).toEqual([{ to: 'Customer', kind: 'one' }]);
  });

  it('scans Makefile targets and npm scripts into repo-facts.json, for the architecture skill to write into runbooks/commands.md itself', () => {
    dir = expressMongooseRepo();
    const facts = scanRepo(dir);
    expect(facts.makeTargets.map(t => t.name)).toEqual(['dev', 'test']);
    expect(facts.makeTargets.find(t => t.name === 'dev')!.command).toContain('node server.js');
    expect(facts.scripts).toEqual([{ name: 'test', command: 'vitest run', source: 'package.json' }]);
  });

  it('writes no page outside reference/: the scanner no longer seeds product/, runbooks/, decisions/, gotchas/, glossary.md or numbers/', () => {
    dir = mkdtempSync(join(tmpdir(), 'codeloop-outline-empty-'));
    const pages = buildOutline(dir);
    expect(pages.every(p => p.path.startsWith(`${WIKI_DIR}/reference/`))).toBe(true);
    const erd = pages.find(p => p.path.endsWith('erd.md'))!;
    expect(erd.body).toContain('assumption: no Prisma, Mongoose, SQLAlchemy or TypeORM schema files were found');
  });
});

describe('wiki-outline: writing', () => {
  it('dry run reports pages, facts and assumptions without writing anything', () => {
    dir = expressMongooseRepo();
    const summary = outlineSummary(dir);
    expect(summary.length).toBeGreaterThan(0);
    expect(summary.every(p => !p.exists)).toBe(true);
    expect(existsSync(join(dir, '.codeloop'))).toBe(false);
  });

  it('writes the C4 context and containers pages under reference/, not architecture/, with a mermaid diagram each', () => {
    dir = expressMongooseRepo();
    writeOutline(dir);
    expect(existsSync(join(dir, '.codeloop/wiki/architecture'))).toBe(false);
    const context = readFileSync(join(dir, '.codeloop/wiki/reference/context.md'), 'utf-8');
    expect(context).toContain('```mermaid\nC4Context');
    expect(context).toMatch(/System\(sys, "/);
    const containers = readFileSync(join(dir, '.codeloop/wiki/reference/containers.md'), 'utf-8');
    expect(containers).toContain('```mermaid\nflowchart TB');
    expect(containers).toMatch(/subgraph L0\["/);
    expect(containers.slice(0, containers.indexOf('```', containers.indexOf('flowchart TB')))).not.toContain('package manager');
    expect(containers).toContain('| Layer | Tech | Where | Source |');
  });

  it('writes every page on first run, then skips existing pages unless --force', () => {
    dir = expressMongooseRepo();
    const first = writeOutline(dir);
    expect(first.skipped).toEqual([]);
    expect(first.written.length).toBeGreaterThan(0);
    const stackPath = join(dir, '.codeloop/wiki/reference/stack.md');
    expect(existsSync(stackPath)).toBe(true);

    writeFileSync(stackPath, readFileSync(stackPath, 'utf-8') + '\nHand-edited.\n');
    const second = writeOutline(dir);
    expect(second.written).toEqual([REPO_FACTS_PATH]);
    expect(second.skipped).toEqual(expect.arrayContaining(['.codeloop/wiki/reference/stack.md']));
    expect(readFileSync(stackPath, 'utf-8')).toContain('Hand-edited.');

    const forced = writeOutline(dir, { force: true });
    expect(forced.skipped).toEqual([]);
    expect(readFileSync(stackPath, 'utf-8')).not.toContain('Hand-edited.');
  });

  it('wiki build refreshes only reference pages and keeps a hand-written page elsewhere untouched', () => {
    dir = expressMongooseRepo();
    writeOutline(dir);
    const stackPath = join(dir, '.codeloop/wiki/reference/stack.md');
    const startHerePath = join(dir, '.codeloop/wiki/start-here.md');
    write(dir, '.codeloop/wiki/start-here.md', '# Start here\n\nHand-written.\n');
    writeFileSync(stackPath, readFileSync(stackPath, 'utf-8') + '\nStale.\n');
    writeOutline(dir, { forceUnder: '.codeloop/wiki/reference/' });
    expect(readFileSync(stackPath, 'utf-8')).not.toContain('Stale.');
    expect(readFileSync(startHerePath, 'utf-8')).toContain('Hand-written.');
  });

  it('writes .codeloop/state/repo-facts.json with the scanned facts and the top-level source folders', () => {
    dir = expressMongooseRepo();
    writeOutline(dir);
    const factsPath = join(dir, REPO_FACTS_PATH);
    expect(existsSync(factsPath)).toBe(true);
    const facts = JSON.parse(readFileSync(factsPath, 'utf-8'));
    expect(facts.stack.map((s: { tech: string }) => s.tech)).toEqual(expect.arrayContaining(['Node.js', 'express', 'mongoose']));
    expect(facts.topFolders).toEqual(expect.arrayContaining(['src']));
    expect(scanTopFolders(dir)).toEqual(expect.arrayContaining(['src']));
  });
});
