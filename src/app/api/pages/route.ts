import { NextResponse } from 'next/server';
import { getAllPages } from '@/lib/content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const pages = getAllPages({ includeDrafts: true }).map((p) => ({
    title: p.frontmatter.title,
    section: p.frontmatter.section,
    slug: p.slug,
    path: p.path,
    icon: p.frontmatter.icon,
    updatedAt: p.frontmatter.updatedAt,
    published: p.frontmatter.published,
    order: p.frontmatter.order ?? 999,
  }));
  return NextResponse.json({ pages });
}
