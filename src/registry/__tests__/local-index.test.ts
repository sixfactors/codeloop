import { describe, it, expect } from 'vitest';
import { searchLocalIndex, findInLocalIndex, type LocalIndex } from '../local-index.js';

const TEST_INDEX: LocalIndex = {
  version: 1,
  updatedAt: '2026-02-21T00:00:00Z',
  skills: [
    {
      name: 'design',
      version: '0.2.0',
      description: 'Architecture before code',
      author: 'sixfactors',
      tags: ['pipeline', 'architecture'],
      stack: 'generic',
      tier: 'trusted',
      source: 'builtin',
    },
    {
      name: 'deploy',
      version: '0.2.0',
      description: 'Deploy to staging or production',
      author: 'sixfactors',
      tags: ['pipeline', 'deploy'],
      stack: 'generic',
      tier: 'trusted',
      source: 'builtin',
    },
    {
      name: 'debug',
      version: '0.2.0',
      description: 'Investigate production issues',
      author: 'sixfactors',
      tags: ['pipeline', 'debugging'],
      stack: 'generic',
      tier: 'trusted',
      source: 'builtin',
    },
  ],
};

describe('searchLocalIndex', () => {
  it('finds skills by name', () => {
    const results = searchLocalIndex(TEST_INDEX, 'deploy');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe('deploy');
  });

  it('finds skills by description', () => {
    const results = searchLocalIndex(TEST_INDEX, 'production');
    expect(results.length).toBe(2); // deploy + debug both mention production
  });

  it('finds skills by tag', () => {
    const results = searchLocalIndex(TEST_INDEX, 'architecture');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('design');
  });

  it('ranks name matches higher', () => {
    const results = searchLocalIndex(TEST_INDEX, 'debug');
    expect(results[0].name).toBe('debug'); // Exact name match first
  });

  it('returns empty for no match', () => {
    const results = searchLocalIndex(TEST_INDEX, 'nonexistent');
    expect(results).toEqual([]);
  });
});

describe('findInLocalIndex', () => {
  it('finds by exact name', () => {
    const result = findInLocalIndex(TEST_INDEX, 'design');
    expect(result?.name).toBe('design');
  });

  it('returns undefined for missing name', () => {
    const result = findInLocalIndex(TEST_INDEX, 'nonexistent');
    expect(result).toBeUndefined();
  });
});
