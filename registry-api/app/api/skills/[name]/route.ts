import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * GET /api/skills/:name — Get a single skill with all versions
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const sql = getDb();

  try {
    // Get skill
    const skills = await sql(
      `SELECT s.*, a.username as author_name
       FROM skills s
       LEFT JOIN authors a ON s.author_id = a.id
       WHERE s.name = $1`,
      [name],
    );

    if (skills.length === 0) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }

    const skill = skills[0];

    // Get versions
    const versions = await sql(
      `SELECT v.*, dt.tag as dist_tag
       FROM versions v
       LEFT JOIN dist_tags dt ON dt.version_id = v.id AND dt.skill_id = v.skill_id
       WHERE v.skill_id = $1
       ORDER BY v.published_at DESC`,
      [skill.id],
    );

    // Increment download counter (fire and forget)
    sql(`UPDATE skills SET downloads = downloads + 1 WHERE id = $1`, [skill.id]).catch(() => {});

    return NextResponse.json({
      skill,
      versions,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
