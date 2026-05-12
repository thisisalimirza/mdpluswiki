import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const CONTENT_DIR = path.join(process.cwd(), 'content');

// Section metadata can be stored in _section.json in each folder
export interface SectionMeta {
  label: string;
  icon?: string;
  order?: number;
}

export interface SectionInfo {
  id: string; // e.g., "operations" or "operations/meetings"
  label: string;
  icon?: string;
  order: number;
  depth: number;
  parent?: string;
}

// Discover all sections (folders) in the content directory
export function discoverSections(): SectionInfo[] {
  const sections: SectionInfo[] = [];

  function scanDir(dir: string, parentId: string = '', depth: number = 0) {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;

      const sectionId = parentId ? `${parentId}/${entry.name}` : entry.name;
      const sectionPath = path.join(dir, entry.name);

      // Try to read _section.json for metadata
      let meta: SectionMeta = { label: formatLabel(entry.name), order: 999 };
      const metaPath = path.join(sectionPath, '_section.json');
      if (fs.existsSync(metaPath)) {
        try {
          meta = { ...meta, ...JSON.parse(fs.readFileSync(metaPath, 'utf8')) };
        } catch {
          // Ignore parse errors
        }
      }

      sections.push({
        id: sectionId,
        label: meta.label,
        icon: meta.icon,
        order: meta.order ?? 999,
        depth,
        parent: parentId || undefined,
      });

      // Recursively scan subdirectories (limit to 2 levels deep for sanity)
      if (depth < 2) {
        scanDir(sectionPath, sectionId, depth + 1);
      }
    }
  }

  scanDir(CONTENT_DIR);

  // Sort hierarchically: parents first, then children under their parent
  // Build a tree and flatten it
  const topLevel = sections.filter(s => s.depth === 0).sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.label.localeCompare(b.label);
  });

  const result: SectionInfo[] = [];
  for (const parent of topLevel) {
    result.push(parent);
    // Find children of this parent
    const children = sections
      .filter(s => s.parent === parent.id)
      .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.label.localeCompare(b.label);
      });
    result.push(...children);
  }

  return result;
}

// Format folder name to label (e.g., "my-section" -> "My Section")
function formatLabel(name: string): string {
  return name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Get all section IDs (for validation)
export function getAllSectionIds(): string[] {
  return discoverSections().map((s) => s.id);
}

// Check if a section exists
export function sectionExists(sectionId: string): boolean {
  const sectionPath = path.join(CONTENT_DIR, sectionId);
  return fs.existsSync(sectionPath) && fs.statSync(sectionPath).isDirectory();
}

// Create a new section
export function createSection(sectionId: string, meta: SectionMeta): boolean {
  const sectionPath = path.join(CONTENT_DIR, sectionId);

  // Validate section ID
  if (!/^[a-z0-9][a-z0-9-/]*[a-z0-9]$|^[a-z0-9]$/.test(sectionId)) {
    return false;
  }

  // Don't allow creating if it already exists
  if (fs.existsSync(sectionPath)) {
    return false;
  }

  // Create the directory
  fs.mkdirSync(sectionPath, { recursive: true });

  // Write _section.json
  fs.writeFileSync(
    path.join(sectionPath, '_section.json'),
    JSON.stringify(meta, null, 2)
  );

  return true;
}

// Get section label by ID
export function getSectionLabel(sectionId: string): string {
  const sections = discoverSections();
  const section = sections.find((s) => s.id === sectionId);
  return section?.label ?? formatLabel(sectionId.split('/').pop() || sectionId);
}

// Get full section metadata by ID
export function getSectionMeta(sectionId: string): SectionMeta | null {
  const sections = discoverSections();
  const section = sections.find((s) => s.id === sectionId);
  if (!section) return null;
  return {
    label: section.label,
    icon: section.icon,
    order: section.order,
  };
}

// Legacy type alias for backward compatibility
export type Section = string;

export interface EditHistoryEntry {
  name: string;
  date: string;
  summary?: string;
}

export interface PageFrontmatter {
  title: string;
  section: string;
  icon?: string;
  updatedAt?: string;
  updatedBy?: string;
  editHistory?: EditHistoryEntry[];
  published?: boolean;
  order?: number;
}

export interface WikiPage {
  slug: string;
  section: string;
  path: string;
  frontmatter: PageFrontmatter;
  content: string;
  raw: string;
}

export function getContentRoot(): string {
  return CONTENT_DIR;
}

function readPageFile(section: string, slug: string): WikiPage | null {
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
      section: fm.section ?? section,
      icon: fm.icon,
      updatedAt: fm.updatedAt,
      updatedBy: fm.updatedBy,
      editHistory: fm.editHistory,
      published: fm.published !== false,
      order: fm.order,
    },
    content,
    raw,
  };
}

export function getPage(sectionPath: string, slug: string): WikiPage | null {
  if (!sectionExists(sectionPath)) return null;
  return readPageFile(sectionPath, slug);
}

// Get page by full path (e.g., "operations/meetings/standup")
export function getPageByPath(pagePath: string): WikiPage | null {
  const parts = pagePath.split('/');
  if (parts.length < 2) return null;
  const slug = parts.pop()!;
  const section = parts.join('/');
  return getPage(section, slug);
}

export function getAllPages(opts: { includeDrafts?: boolean } = {}): WikiPage[] {
  const pages: WikiPage[] = [];
  const sections = discoverSections();

  for (const section of sections) {
    const dir = path.join(CONTENT_DIR, section.id);
    if (!fs.existsSync(dir)) continue;

    const entries = fs.readdirSync(dir).filter((f) => f.endsWith('.mdx'));
    for (const entry of entries) {
      const slug = entry.replace(/\.mdx$/, '');
      const page = readPageFile(section.id, slug);
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
  section: string;
  label: string;
  icon?: string;
  depth: number;
  parent?: string;
  pages: NavPage[];
}

// Extract plain text from markdown for search
function extractPlainText(content: string): string {
  return content
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_#`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getNavTree(opts: { includeDrafts?: boolean; includeContent?: boolean } = {}): NavGroup[] {
  const pages = getAllPages(opts);
  const sections = discoverSections();

  // Group pages by section
  const grouped: Record<string, NavPage[]> = {};
  for (const section of sections) {
    grouped[section.id] = [];
  }

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
    if (grouped[p.section]) {
      grouped[p.section].push(navPage);
    }
  }

  return sections.map((section) => ({
    section: section.id,
    label: section.label,
    icon: section.icon,
    depth: section.depth,
    parent: section.parent,
    pages: grouped[section.id] || [],
  }));
}

// Get all pages with content for full-text search
export function getSearchablePages(): Array<NavPage & { section: string; sectionLabel: string; searchContent: string }> {
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
      sectionLabel: getSectionLabel(p.frontmatter.section),
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
  wikiSection: string;
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
          sectionLabel: getSectionLabel(page.frontmatter.section),
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
  section: string;
  sectionLabel: string;
  updatedAt: string;
  icon?: string;
}> {
  const pages = getAllPages();

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
    sectionLabel: getSectionLabel(p.frontmatter.section),
    updatedAt: p.frontmatter.updatedAt || '',
    icon: p.frontmatter.icon,
  }));
}

export function isValidPath(p: string): boolean {
  if (!p || typeof p !== 'string') return false;
  if (p.includes('..') || p.startsWith('/') || p.includes('\\')) return false;

  const parts = p.split('/');
  if (parts.length < 2) return false;

  const slug = parts.pop()!;
  const section = parts.join('/');

  if (!sectionExists(section)) return false;
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
