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
  updatedAt?: string;
  contentPreview?: string;
}

export interface NavGroup {
  section: Section;
  label: string;
  pages: NavPage[];
}

// Extract plain text from markdown for search
function extractPlainText(content: string): string {
  return content
    // Remove MDX components
    .replace(/<[^>]+>/g, ' ')
    // Remove markdown links
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove markdown formatting
    .replace(/[*_#`~]/g, '')
    // Remove extra whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

export function getNavTree(opts: { includeDrafts?: boolean; includeContent?: boolean } = {}): NavGroup[] {
  const pages = getAllPages(opts);
  const grouped: Record<Section, NavPage[]> = {
    overview: [],
    operations: [],
    communities: [],
    admin: [],
  };
  for (const p of pages) {
    const navPage: NavPage = {
      title: p.frontmatter.title,
      slug: p.slug,
      path: p.path,
      icon: p.frontmatter.icon,
      published: p.frontmatter.published,
      updatedAt: p.frontmatter.updatedAt,
    };
    if (opts.includeContent) {
      navPage.contentPreview = extractPlainText(p.content).slice(0, 500);
    }
    grouped[p.frontmatter.section].push(navPage);
  }
  return SECTION_ORDER.map((section) => ({
    section,
    label: SECTION_LABELS[section],
    pages: grouped[section],
  }));
}

// Get all pages with content for full-text search (legacy - kept for compatibility)
export function getSearchablePages(): Array<NavPage & { section: Section; sectionLabel: string; searchContent: string }> {
  const pages = getAllPages();
  return pages.map((p) => {
    const plainText = extractPlainText(p.content);
    return {
      title: p.frontmatter.title,
      slug: p.slug,
      path: p.path,
      icon: p.frontmatter.icon,
      published: p.frontmatter.published,
      updatedAt: p.frontmatter.updatedAt,
      contentPreview: plainText.slice(0, 500),
      searchContent: plainText,
      section: p.frontmatter.section,
      sectionLabel: SECTION_LABELS[p.frontmatter.section],
    };
  });
}

// Convert heading text to URL-friendly slug
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Parse markdown content into sections by heading
export interface SearchSection {
  pageTitle: string;
  pagePath: string;
  pageIcon?: string;
  wikiSection: Section;
  sectionLabel: string;
  heading: string;
  headingSlug: string;
  headingLevel: number;
  content: string;
}

export function getSearchIndex(): SearchSection[] {
  const pages = getAllPages();
  const sections: SearchSection[] = [];

  for (const page of pages) {
    const lines = page.content.split('\n');
    let currentHeading = page.frontmatter.title;
    let currentSlug = '';
    let currentLevel = 1;
    let currentContent: string[] = [];

    const flushSection = () => {
      const content = currentContent
        .join('\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[*_`~]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (content.length > 0) {
        sections.push({
          pageTitle: page.frontmatter.title,
          pagePath: page.path,
          pageIcon: page.frontmatter.icon,
          wikiSection: page.frontmatter.section,
          sectionLabel: SECTION_LABELS[page.frontmatter.section],
          heading: currentHeading,
          headingSlug: currentSlug,
          headingLevel: currentLevel,
          content,
        });
      }
    };

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        flushSection();
        currentLevel = headingMatch[1].length;
        currentHeading = headingMatch[2].replace(/[*_`]/g, '');
        currentSlug = slugify(currentHeading);
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    }
    flushSection();
  }

  return sections;
}

// Get recent changes sorted by updatedAt
export function getRecentChanges(limit: number = 10): Array<{
  title: string;
  path: string;
  section: Section;
  sectionLabel: string;
  updatedAt: string;
  icon?: string;
}> {
  const pages = getAllPages();

  // Sort by updatedAt descending
  const sorted = pages
    .filter((p) => p.frontmatter.updatedAt)
    .sort((a, b) => {
      const dateA = new Date(a.frontmatter.updatedAt || '').getTime();
      const dateB = new Date(b.frontmatter.updatedAt || '').getTime();
      return dateB - dateA;
    })
    .slice(0, limit);

  return sorted.map((p) => ({
    title: p.frontmatter.title,
    path: p.path,
    section: p.frontmatter.section,
    sectionLabel: SECTION_LABELS[p.frontmatter.section],
    updatedAt: p.frontmatter.updatedAt || '',
    icon: p.frontmatter.icon,
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
