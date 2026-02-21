/**
 * Database connection for Neon Postgres.
 *
 * Schema:
 *
 * CREATE TABLE authors (
 *   id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   github_id   TEXT UNIQUE NOT NULL,
 *   username    TEXT NOT NULL,
 *   verified    BOOLEAN DEFAULT false,
 *   created_at  TIMESTAMPTZ DEFAULT now()
 * );
 *
 * CREATE TABLE skills (
 *   id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   name        TEXT UNIQUE NOT NULL,
 *   author_id   UUID REFERENCES authors,
 *   description TEXT NOT NULL,
 *   tags        TEXT[] DEFAULT '{}',
 *   stack       TEXT DEFAULT 'generic',
 *   tier        TEXT DEFAULT 'unreviewed',
 *   downloads   INTEGER DEFAULT 0,
 *   source_url  TEXT,
 *   created_at  TIMESTAMPTZ DEFAULT now(),
 *   updated_at  TIMESTAMPTZ DEFAULT now()
 * );
 *
 * CREATE TABLE versions (
 *   id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   skill_id    UUID REFERENCES skills NOT NULL,
 *   version     TEXT NOT NULL,
 *   artifact_url TEXT NOT NULL,
 *   integrity   TEXT NOT NULL,
 *   manifest    JSONB NOT NULL,
 *   published_at TIMESTAMPTZ DEFAULT now(),
 *   UNIQUE(skill_id, version)
 * );
 *
 * CREATE TABLE dist_tags (
 *   skill_id    UUID REFERENCES skills NOT NULL,
 *   tag         TEXT NOT NULL,
 *   version_id  UUID REFERENCES versions NOT NULL,
 *   PRIMARY KEY (skill_id, tag)
 * );
 */

import { neon } from '@neondatabase/serverless';

export function getDb() {
  const sql = neon(process.env.DATABASE_URL!);
  return sql;
}

export type DbClient = ReturnType<typeof getDb>;
