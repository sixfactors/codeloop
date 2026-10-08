import { z } from 'zod';
import type { Card } from '../cards.js';
import type { Lane } from '../lane.js';

export type { Card } from '../cards.js';
export type { Lane } from '../lane.js';

/** The engine's Card as the store hands it back: the same fields, plus the version of cards.json it was read from. */
export type CardRecord = Card & { version?: string };

// Plain types with zod beside them, no decorators: a SQL driver maps these to its own tables and
// the engine never learns which driver is underneath.

const version = z.union([z.string(), z.number()]).optional();

/** Loose on purpose: cards.json is the engine's and carries fields the store does not interpret. */
export const CardSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    lane: z.string(),
    laneVersion: z.number(),
    stage: z.string(),
    retries: z.record(z.string(), z.number()),
    evidence: z.array(z.string()),
    events: z.array(z.record(z.string(), z.unknown())),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .loose();

export const LaneSchema = z
  .object({
    id: z.string(),
    version: z.number(),
    metric: z.object({ name: z.string(), source: z.string(), target: z.string().optional() }),
    retries: z.number(),
    stages: z.array(z.object({ id: z.string() }).loose()),
  })
  .loose();

/** Any markdown page under .codeloop/wiki or specs: id is its path from the project root. */
export const WikiPageSchema = z.object({
  id: z.string(),
  /** `gotchas`, `initiatives`, `cards` for wiki pages; `specs/001-…` for spec pages. */
  folder: z.string(),
  title: z.string(),
  frontmatter: z.record(z.string(), z.unknown()),
  body: z.string(),
  version,
});
export type WikiPage = z.infer<typeof WikiPageSchema>;

/** `.codeloop/wiki/initiatives/<id>.md`: the frontmatter fields, and the hypothesis is the body. */
export const BetSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string().optional(),
  metric: z.string().optional(),
  goal: z.string().optional(),
  persona: z.string().optional(),
  hypothesis: z.string(),
  version,
});
export type Initiative = z.infer<typeof BetSchema>;

/** RICE on a feature: reach, impact and confidence on 1–10, effort in weeks. */
export const RiceSchema = z.object({
  reach: z.number().min(1).max(10),
  impact: z.number().min(1).max(10),
  confidence: z.number().min(1).max(10),
  effort: z.number().positive(),
});
export type Rice = z.infer<typeof RiceSchema>;

const slug = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'a plain name (letters, digits, dot, dash, underscore)');

/** `.codeloop/wiki/epics/<id>.md`: an outcome that takes several features; the body is its description. */
export const EpicSchema = z.object({
  id: slug,
  title: z.string(),
  initiative: slug,
  status: z.string().optional(),
  goal: z.string().optional(),
  body: z.string(),
  version,
});
export type Epic = z.infer<typeof EpicSchema>;

/** `.codeloop/wiki/features/<id>.md`: a capability the user gets, scored by RICE; the body is its description. */
export const FeatureSchema = z.object({
  id: slug,
  title: z.string(),
  initiative: slug,
  epic: slug.optional(),
  status: z.string().optional(),
  /** Target release tag, or `next`. */
  release: z.string().optional(),
  rice: RiceSchema.optional(),
  body: z.string(),
  version,
});
export type Feature = z.infer<typeof FeatureSchema>;

export const QuestionSchema = z.object({
  /** `<cardId>#<n>`. */
  id: z.string(),
  cardId: z.string(),
  n: z.number().int().positive(),
  question: z.string(),
  recommended: z.string(),
  answer: z.string(),
  version,
});
export type Question = z.infer<typeof QuestionSchema>;

export const EVIDENCE_KINDS = ['md', 'json', 'txt', 'image', 'other'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** `evidence/<nnn>/`: one entry per card folder, its files listed. */
export const EvidenceSchema = z.object({
  /** The three-digit card number the folder is named by. */
  id: z.string(),
  /** The card keyed by that number, when the board has one. */
  cardId: z.string().optional(),
  files: z.array(z.object({ name: z.string(), kind: z.enum(EVIDENCE_KINDS), path: z.string() })),
  version,
});
export type Evidence = z.infer<typeof EvidenceSchema>;

/** A mock under docs/mocks/<project>/<topic>/<card>.html, or a page under docs/artifacts/*.html. */
export const ArtifactSchema = z.object({
  /** The file's path from the project root. */
  id: z.string(),
  kind: z.enum(['mock', 'artifact']),
  project: z.string().optional(),
  topic: z.string().optional(),
  cardId: z.string().optional(),
  /** The mock this one was copied from, `base` for the bare template; unset for an artifact. */
  from: z.string().optional(),
  /** The whole lineage comment, this mock first and `base` last; unset for an artifact. */
  lineage: z.array(z.string()).optional(),
  title: z.string(),
  version,
});
export type Artifact = z.infer<typeof ArtifactSchema>;

export type Entities = { cards: CardRecord; lanes: Lane; pages: WikiPage; initiatives: Initiative; epics: Epic; features: Feature; questions: Question; evidence: Evidence; artifacts: Artifact };
