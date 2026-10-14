import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

// A version bump without a changelog entry ships silently. The heading may carry a date or
// "(unreleased)" after the number.
describe('changelog', () => {
  it('has a heading for the version package.json names', () => {
    const { version } = JSON.parse(readFileSync('package.json', 'utf-8'));
    const changelog = readFileSync('CHANGELOG.md', 'utf-8');
    expect(changelog).toMatch(new RegExp(`^## ${version.replace(/\\./g, '\\.')}( |$)`, 'm'));
  });
});
