import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * GET /api/skills — List/search skills
 *
 * Query params:
 *   q       — search query (matches name, description, tags)
 *   tag     — filter by tag
 *   stack   — filter by stack
 *   limit   — max results (default 20)
 *   offset  — pagination offset (default 0)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const tag = searchParams.get('tag');
  const stack = searchParams.get('stack');
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  const sql = getDb();

  try {
    let query: string;
    const params: unknown[] = [];

    if (q) {
      query = `
        SELECT s.*, a.username as author_name,
               v.version as latest_version, v.artifact_url
        FROM skills s
        LEFT JOIN authors a ON s.author_id = a.id
        LEFT JOIN dist_tags dt ON dt.skill_id = s.id AND dt.tag = 'latest'
        LEFT JOIN versions v ON v.id = dt.version_id
        WHERE s.name ILIKE $1 OR s.description ILIKE $1 OR $2 = ANY(s.tags)
        ORDER BY s.downloads DESC
        LIMIT $3 OFFSET $4
      `;
      params.push(`%${q}%`, q, limit, offset);
    } else {
      query = `
        SELECT s.*, a.username as author_name,
               v.version as latest_version, v.artifact_url
        FROM skills s
        LEFT JOIN authors a ON s.author_id = a.id
        LEFT JOIN dist_tags dt ON dt.skill_id = s.id AND dt.tag = 'latest'
        LEFT JOIN versions v ON v.id = dt.version_id
        WHERE ($1::text IS NULL OR $1 = ANY(s.tags))
          AND ($2::text IS NULL OR s.stack = $2)
        ORDER BY s.downloads DESC
        LIMIT $3 OFFSET $4
      `;
      params.push(tag, stack, limit, offset);
    }

    const rows = await sql(query, params);

    return NextResponse.json({
      skills: rows,
      pagination: { limit, offset, hasMore: rows.length === limit },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
