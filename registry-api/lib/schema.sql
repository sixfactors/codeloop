-- Codeloop Skill Registry Schema
-- Run this against your Neon Postgres database to initialize.

-- Authors (GitHub OAuth)
CREATE TABLE IF NOT EXISTS authors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id   TEXT UNIQUE NOT NULL,
  username    TEXT NOT NULL,
  verified    BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Skills (one per unique name)
CREATE TABLE IF NOT EXISTS skills (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT UNIQUE NOT NULL,
  author_id   UUID REFERENCES authors,
  description TEXT NOT NULL,
  tags        TEXT[] DEFAULT '{}',
  stack       TEXT DEFAULT 'generic',
  tier        TEXT DEFAULT 'unreviewed',
  downloads   INTEGER DEFAULT 0,
  source_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Versions (immutable per publish)
CREATE TABLE IF NOT EXISTS versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id    UUID REFERENCES skills NOT NULL,
  version     TEXT NOT NULL,
  artifact_url TEXT NOT NULL,
  integrity   TEXT NOT NULL,
  manifest    JSONB NOT NULL,
  published_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(skill_id, version)
);

-- Dist tags (mutable pointers like "latest", "next")
CREATE TABLE IF NOT EXISTS dist_tags (
  skill_id    UUID REFERENCES skills NOT NULL,
  tag         TEXT NOT NULL,
  version_id  UUID REFERENCES versions NOT NULL,
  PRIMARY KEY (skill_id, tag)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);
CREATE INDEX IF NOT EXISTS idx_skills_tags ON skills USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_versions_skill ON versions(skill_id);
CREATE INDEX IF NOT EXISTS idx_dist_tags_skill ON dist_tags(skill_id);
