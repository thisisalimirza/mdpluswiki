import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

export type Section = 'overview' | 'operations' | 'communities' | 'admin';

export const SECTION_ORDER: Section[] = ['overview', 'operations', 'communities', 'admin'];

export const SECTION_LABELS: Record<Section, string> = {
  overview: 'Overview',
  operations: 'Operations',
  communities: 'Communities',
  admin: 'Admin',
};

export interface PageFrontmatter {
  title: string;
  section: Section;
  icon?: string;
  updatedAt?: string;
  published?: boolean;
  order?: number;
}

export interface WikiPage {
  slug: string;
  section: Section;
  path: string;
  frontmatter: PageFrontmatter;
  content: string;
  raw: string;
}

const CONTENT_DIR = path.join(process.cwd(), 'content');

export function getContentRoot(): string {
  return CONTENT_DIR;
}

function readPageFile(section: Section, slug: string): WikiPage | null {
  const filePath = path.join(CONTENT_DIR, section, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8');
  const { data, content } = matter(raw);
  const fm = data as PageFrontmatter;
  return {
    slug,
    section,
    path: `${section}/${slug}`,
    frontmatter: {
      title: fm.title ?? slug,
      section: (fm.section ?? section) as Section,
      icon: fm.icon,
      updatedAt: fm.updatedAt,
      published: fm.published !== false,
      order: fm.order,
    },
    content,
    raw,
  };
}

export function getPage(section: string, slug: string): WikiPage | null {
  if (!SECTION_ORDER.includes(section as Section)) return null;
  return readPageFile(section as Section, slug);
}

export function getAllPages(opts: { includeDrafts?: boolean } = {}): WikiPage[] {
  const pages: WikiPage[] = [];
  for (const section of SECTION_ORDER) {
    const dir = path.join(CONTENT_DIR, section);
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir).filter((f) => f.endsWith('.mdx'));
    for (const entry of entries) {
      const slug = entry.replace(/\.mdx$/, '');
      const page = readPageFile(section, slug);
      if (!page) continue;
      if (!opts.includeDrafts && page.frontmatter.published === false) continue;
      pages.push(page);
    }
  }
  return pages.sort((a, b) => {
    const ao = a.frontmatter.order ?? 999;
    const bo = b.frontmatter.order ?? 999;
    if (ao !== bo) return ao - bo;
    return a.frontmatter.title.localeCompare(b.frontmatter.title);
  });
}

export interface NavPage {
  title: string;
  slug: string;
  path: string;
  icon?: string;
  published?: boolean;
}

export interface NavGroup {
  section: Section;
  label: string;
  pages: NavPage[];
}

export function getNavTree(opts: { includeDrafts?: boolean } = {}): NavGroup[] {
  const pages = getAllPages(opts);
  const grouped: Record<Section, NavPage[]> = {
    overview: [],
    operations: [],
    communities: [],
    admin: [],
  };
  for (const p of pages) {
    grouped[p.frontmatter.section].push({
      title: p.frontmatter.title,
      slug: p.slug,
      path: p.path,
      icon: p.frontmatter.icon,
      published: p.frontmatter.published,
    });
  }
  return SECTION_ORDER.map((section) => ({
    section,
    label: SECTION_LABELS[section],
    pages: grouped[section],
  }));
}

export function isValidPath(p: string): boolean {
  if (!p || typeof p !== 'string') return false;
  if (p.includes('..') || p.startsWith('/') || p.includes('\\')) return false;
  const parts = p.split('/');
  if (parts.length !== 2) return false;
  const [section, slug] = parts;
  if (!SECTION_ORDER.includes(section as Section)) return false;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return false;
  return true;
}

export function todayHuman(): string {
  return new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}
