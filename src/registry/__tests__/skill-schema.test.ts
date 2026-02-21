import { describe, it, expect } from 'vitest';
import { parseSkillFile, SkillValidationError } from '../skill-schema.js';

describe('parseSkillFile', () => {
  it('parses valid SKILL.md', () => {
    const raw = `---
name: commit-review
version: 1.0.0
description: Enhanced commit review with extra checks
author: testuser
tags: [git, review, quality]
stack: node-typescript
---

# /commit-review

This skill reviews commits with extra quality checks.
`;

    const parsed = parseSkillFile(raw);
    expect(parsed.manifest.name).toBe('commit-review');
    expect(parsed.manifest.version).toBe('1.0.0');
    expect(parsed.manifest.description).toBe('Enhanced commit review with extra checks');
    expect(parsed.manifest.author).toBe('testuser');
    expect(parsed.manifest.tags).toEqual(['git', 'review', 'quality']);
    expect(parsed.manifest.stack).toBe('node-typescript');
    expect(parsed.content).toContain('# /commit-review');
  });

  it('throws on missing frontmatter', () => {
    expect(() => parseSkillFile('# No frontmatter here')).toThrow(SkillValidationError);
  });

  it('throws on missing required fields', () => {
    const raw = `---
name: test
---

# test
`;
    expect(() => parseSkillFile(raw)).toThrow('Missing required field: version');
  });

  it('throws on invalid version', () => {
    const raw = `---
name: test
version: v1
description: test
author: test
---

# test
`;
    expect(() => parseSkillFile(raw)).toThrow('Invalid version');
  });

  it('throws on invalid name (uppercase)', () => {
    const raw = `---
name: MySkill
version: 1.0.0
description: test
author: test
---

# test
`;
    expect(() => parseSkillFile(raw)).toThrow('Invalid name');
  });

  it('throws on invalid name (spaces)', () => {
    const raw = `---
name: my skill
version: 1.0.0
description: test
author: test
---

# test
`;
    expect(() => parseSkillFile(raw)).toThrow('Invalid name');
  });

  it('defaults stack to generic', () => {
    const raw = `---
name: test-skill
version: 1.0.0
description: test
author: test
---

# test
`;
    const parsed = parseSkillFile(raw);
    expect(parsed.manifest.stack).toBe('generic');
  });

  it('defaults tools to all three', () => {
    const raw = `---
name: test-skill
version: 1.0.0
description: test
author: test
---

# test
`;
    const parsed = parseSkillFile(raw);
    expect(parsed.manifest.tools).toEqual(['claude', 'cursor', 'codex']);
  });
});
