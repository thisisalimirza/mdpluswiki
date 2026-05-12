import { NextRequest, NextResponse } from 'next/server';
import { getPage, isValidPath } from '@/lib/content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams.get('path');
  if (!p || !isValidPath(p)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }
  // Support nested sections: "flagship-events/catalyst/overview" -> section="flagship-events/catalyst", slug="overview"
  const parts = p.split('/');
  const slug = parts.pop()!;
  const section = parts.join('/');
  const page = getPage(section, slug);
  if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ raw: page.raw });
}
