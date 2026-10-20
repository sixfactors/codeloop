import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { detectProject, detectStack } from '../detect.js';

// One fixture per stack the first day must recognise. Each is the smallest repository that a
// real service in that language would have at its root, so a wrong marker shows up as the wrong
// stack, not as a missing file.

describe('detectProject across stacks', () => {
  let dir: string;
  const write = (rel: string, text = '') => {
    mkdirSync(join(dir, rel, '..'), { recursive: true });
    writeFileSync(join(dir, rel), text);
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'codeloop-detect-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('reads a Maven service as Java with mvnw commands, its modules, database and pipeline', () => {
    write('pom.xml', '<project><artifactId>billing</artifactId><dependencies><dependency><artifactId>spring-boot-starter-web</artifactId></dependency><dependency><artifactId>flyway-core</artifactId></dependency></dependencies></project>');
    write('mvnw', '#!/bin/sh');
    write('src/main/java/com/acme/billing/invoice/Invoice.java', 'class Invoice {}');
    write('src/main/java/com/acme/billing/payment/Payment.java', 'class Payment {}');
    write('src/main/resources/db/migration/V1__init.sql', 'create table t();');
    write('docker-compose.yml', 'services:\n  db:\n    image: postgres:16\n');
    write('.github/workflows/ci.yml', 'name: ci\njobs:\n  test:\n    steps:\n      - run: ./mvnw test\n');
    const d = detectProject(dir);
    expect(detectStack(dir).stack).toBe('java');
    expect(d.languages.map(l => l.name)).toEqual(['Java']);
    expect(d.commands.map(c => c.command)).toEqual(['./mvnw -q compile', './mvnw -q test']);
    expect(d.testCommand).toBe('./mvnw -q test');
    expect(d.modules).toEqual(['invoice', 'payment']);
    expect(d.database.map(x => x.tech)).toEqual(['PostgreSQL', 'Flyway migrations']);
    expect(d.pipeline.map(x => x.file)).toEqual(['.github/workflows/ci.yml']);
    expect(d.frameworks).toContain('spring-boot');
  });

  it('reads a Gradle service as Java with the wrapper', () => {
    write('build.gradle.kts', 'plugins { java }');
    write('gradlew', '#!/bin/sh');
    const d = detectProject(dir);
    expect(d.stack.stack).toBe('java');
    expect(d.commands.map(c => c.command)).toEqual(['./gradlew build -x test', './gradlew test']);
  });

  it('reads a solution as .NET with dotnet build and test', () => {
    write('Billing.sln', '');
    write('src/Billing.Api/Billing.Api.csproj', '<Project><ItemGroup><PackageReference Include="Microsoft.EntityFrameworkCore" /></ItemGroup></Project>');
    write('src/Billing.Api/Program.cs', 'var x = 1;');
    const d = detectProject(dir);
    expect(d.stack.stack).toBe('dotnet');
    expect(d.commands.map(c => c.command)).toEqual(['dotnet build', 'dotnet test']);
    expect(d.database.map(x => x.tech)).toContain('Entity Framework');
  });

  it('reads go.mod as Go with build and test', () => {
    write('go.mod', 'module example.com/svc\n');
    write('cmd/svc/main.go', 'package main');
    const d = detectProject(dir);
    expect(d.stack.stack).toBe('go');
    expect(d.commands.map(c => c.command)).toEqual(['go build ./...', 'go test ./...']);
    expect(d.modules).toEqual(['cmd']);
  });

  it('reads pyproject as Python with pytest, and alembic as the migrations', () => {
    write('pyproject.toml', '[project]\nname = "dispatch"\ndependencies = ["fastapi", "sqlalchemy", "alembic"]\n[tool.pytest.ini_options]\n');
    write('alembic/env.py', '');
    write('src/dispatch/app.py', 'x = 1');
    const d = detectProject(dir);
    expect(d.stack.stack).toBe('python');
    expect(d.commands.map(c => c.command)).toEqual(['pytest']);
    expect(d.testCommand).toBe('pytest');
    expect(d.database.map(x => x.tech)).toEqual(['SQLAlchemy', 'Alembic migrations']);
  });

  it('reads package scripts as the TypeScript commands, build before test', () => {
    write('package.json', JSON.stringify({ scripts: { build: 'tsc', test: 'vitest run', lint: 'eslint .' }, devDependencies: { typescript: '5', vitest: '4' } }));
    write('tsconfig.json', '{}');
    write('package-lock.json', '{}');
    const d = detectProject(dir);
    expect(d.stack.stack).toBe('node-typescript');
    expect(d.commands.map(c => c.command)).toEqual(['npm run build', 'npm run lint', 'npx tsc --noEmit', 'npm test']);
    expect(d.testCommand).toBe('npm test');
  });

  it('names both languages when a Java service carries a TypeScript admin', () => {
    write('pom.xml', '<project/>');
    write('admin/package.json', JSON.stringify({ scripts: { build: 'vite build' } }));
    write('admin/tsconfig.json', '{}');
    const d = detectProject(dir);
    expect(d.languages.map(l => `${l.name}@${l.where}`)).toEqual(['Java@pom.xml', 'TypeScript@admin/tsconfig.json']);
    expect(d.commands.find(c => c.cwd === 'admin')?.command).toBe('npm run build');
  });

  it('falls back to generic and says so when nothing matches', () => {
    write('README.md', '# nothing');
    const d = detectProject(dir);
    expect(d.stack.stack).toBe('generic');
    expect(d.languages).toEqual([]);
    expect(d.commands).toEqual([]);
    expect(d.undetected).toMatch(/no pom\.xml|not detected/i);
  });
});
