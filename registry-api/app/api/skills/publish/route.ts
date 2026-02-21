import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * POST /api/skills/publish — Publish a new skill version
 *
 * Body:
 *   name        — skill name (kebab-case)
 *   version     — semver version string
 *   description — skill description
 *   manifest    — full SKILL.md frontmatter as JSON
 *   integrity   — sha256 content hash
 *   artifact_url — URL to the skill archive (GitHub Release)
 *   tags        — string array of tags
 *   stack       — target stack (generic, node-typescript, python, go)
 *   source_url  — GitHub repo URL (optional)
 *
 * Headers:
 *   Authorization: Bearer <github-token>
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
  }

  const token = authHeader.slice(7);

  // Verify GitHub token and get user info
  let githubUser: { id: string; login: string };
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!res.ok) {
      return NextResponse.json({ error: 'Invalid GitHub token' }, { status: 401 });
    }
    const data = await res.json();
    githubUser = { id: String(data.id), login: data.login };
  } catch {
    return NextResponse.json({ error: 'Failed to verify GitHub token' }, { status: 401 });
  }

  const body = await request.json();
  const { name, version, description, manifest, integrity, artifact_url, tags, stack, source_url } = body;

  // Validate required fields
  if (!name || !version || !description || !manifest || !integrity || !artifact_url) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Validate name format
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    return NextResponse.json({ error: 'Invalid name — must be lowercase kebab-case' }, { status: 400 });
  }

  // Validate semver
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    return NextResponse.json({ error: 'Invalid version — must be semver (e.g., 1.0.0)' }, { status: 400 });
  }

  const sql = getDb();

  try {
    // Upsert author
    await sql(
      `INSERT INTO authors (github_id, username)
       VALUES ($1, $2)
       ON CONFLICT (github_id) DO UPDATE SET username = $2`,
      [githubUser.id, githubUser.login],
    );

    const authors = await sql(`SELECT id FROM authors WHERE github_id = $1`, [githubUser.id]);
    const authorId = authors[0].id;

    // Check if skill exists
    let skills = await sql(`SELECT id, author_id FROM skills WHERE name = $1`, [name]);

    if (skills.length > 0) {
      // Skill exists — verify ownership
      if (skills[0].author_id !== authorId) {
        return NextResponse.json({ error: 'Skill is owned by a different author' }, { status: 403 });
      }

      // Update description/tags
      await sql(
        `UPDATE skills SET description = $1, tags = $2, stack = $3, source_url = $4, updated_at = now()
         WHERE id = $5`,
        [description, tags || [], stack || 'generic', source_url, skills[0].id],
      );
    } else {
      // Create new skill
      await sql(
        `INSERT INTO skills (name, author_id, description, tags, stack, source_url)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [name, authorId, description, tags || [], stack || 'generic', source_url],
      );
      skills = await sql(`SELECT id FROM skills WHERE name = $1`, [name]);
    }

    const skillId = skills[0].id;

    // Check version doesn't already exist (immutable)
    const existingVersions = await sql(
      `SELECT id FROM versions WHERE skill_id = $1 AND version = $2`,
      [skillId, version],
    );

    if (existingVersions.length > 0) {
      return NextResponse.json(
        { error: `Version ${version} already exists — published versions are immutable` },
        { status: 409 },
      );
    }

    // Create version
    await sql(
      `INSERT INTO versions (skill_id, version, artifact_url, integrity, manifest)
       VALUES ($1, $2, $3, $4, $5)`,
      [skillId, version, artifact_url, integrity, JSON.stringify(manifest)],
    );

    const versionRows = await sql(
      `SELECT id FROM versions WHERE skill_id = $1 AND version = $2`,
      [skillId, version],
    );

    // Update "latest" dist tag
    await sql(
      `INSERT INTO dist_tags (skill_id, tag, version_id)
       VALUES ($1, 'latest', $2)
       ON CONFLICT (skill_id, tag) DO UPDATE SET version_id = $2`,
      [skillId, versionRows[0].id],
    );

    return NextResponse.json({
      published: true,
      name,
      version,
      skill_id: skillId,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
