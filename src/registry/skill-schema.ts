/**
 * SKILL.md schema — defines the format for publishable skills.
 *
 * A SKILL.md file has YAML frontmatter with required and optional fields,
 * followed by the skill content in markdown.
 */

export interface SkillManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  tags: string[];
  stack: string;
  tools: string[];              // Which AI tools support this skill
  'allowed-tools'?: string;     // Tools the skill can use
  'argument-hint'?: string;
  license?: string;
}

export interface ParsedSkill {
  manifest: SkillManifest;
  content: string;              // Full markdown content
  raw: string;                  // Raw file content
}

const REQUIRED_FIELDS: (keyof SkillManifest)[] = ['name', 'version', 'description', 'author'];

/**
 * Parse a SKILL.md file into its manifest and content.
 */
export function parseSkillFile(raw: string): ParsedSkill {
  const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatterMatch) {
    throw new SkillValidationError('SKILL.md must start with YAML frontmatter (--- ... ---)');
  }

  const [, yamlStr, content] = frontmatterMatch;
  let manifest: Record<string, unknown>;

  try {
    // Simple YAML parser for frontmatter (key: value pairs)
    manifest = parseSimpleYaml(yamlStr);
  } catch (e: any) {
    throw new SkillValidationError(`Invalid YAML frontmatter: ${e.message}`);
  }

  // Validate required fields
  for (const field of REQUIRED_FIELDS) {
    if (!manifest[field]) {
      throw new SkillValidationError(`Missing required field: ${field}`);
    }
  }

  // Validate version is semver
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version as string)) {
    throw new SkillValidationError(`Invalid version: "${manifest.version}" — must be semver (e.g., 1.0.0)`);
  }

  // Validate name is kebab-case
  if (!/^[a-z][a-z0-9-]*$/.test(manifest.name as string)) {
    throw new SkillValidationError(
      `Invalid name: "${manifest.name}" — must be lowercase kebab-case (e.g., "commit-review")`,
    );
  }

  return {
    manifest: {
      name: manifest.name as string,
      version: manifest.version as string,
      description: manifest.description as string,
      author: manifest.author as string,
      tags: Array.isArray(manifest.tags) ? manifest.tags : [],
      stack: (manifest.stack as string) ?? 'generic',
      tools: Array.isArray(manifest.tools) ? manifest.tools : ['claude', 'cursor', 'codex'],
      'allowed-tools': manifest['allowed-tools'] as string | undefined,
      'argument-hint': manifest['argument-hint'] as string | undefined,
      license: manifest.license as string | undefined,
    },
    content,
    raw,
  };
}

/**
 * Simple YAML parser for frontmatter.
 * Handles: key: value, key: [array], key: "quoted"
 */
function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let value: unknown = trimmed.slice(colonIdx + 1).trim();

    // Array value: [a, b, c]
    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(v => v.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    }
    // Quoted string
    else if (typeof value === 'string' && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }
    // Boolean
    else if (value === 'true') value = true;
    else if (value === 'false') value = false;

    result[key] = value;
  }

  return result;
}

export class SkillValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillValidationError';
  }
}
