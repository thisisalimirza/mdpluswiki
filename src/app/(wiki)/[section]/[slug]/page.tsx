import { notFound } from 'next/navigation';
import Link from 'next/link';
import { MDXRemote } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import { getAllPages, getPage, SECTION_LABELS, SECTION_ORDER, type Section } from '@/lib/content';
import { extractToc } from '@/lib/toc';
import { mdxComponents } from '@/components/MdxComponents';
import WikiShell from '@/components/WikiShell';

export const dynamic = 'force-static';
export const dynamicParams = true;

export async function generateStaticParams() {
  return getAllPages({ includeDrafts: true }).map((p) => ({
    section: p.section,
    slug: p.slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string; slug: string }>;
}) {
  const { section, slug } = await params;
  const page = getPage(section, slug);
  if (!page) return { title: 'Not found · MDplus Wiki' };
  return {
    title: `${page.frontmatter.title} · MDplus Wiki`,
    description: `${page.frontmatter.title} — MDplus Leadership Wiki`,
  };
}

export default async function WikiPageRoute({ params }: { params: Promise<{ section: string; slug: string }> }) {
  const { section, slug } = await params;
  const page = getPage(section, slug);
  if (!page) notFound();
  const toc = extractToc(page.content);
  const allPages = getAllPages({ includeDrafts: true }).map((p) => ({
    title: p.frontmatter.title,
    path: p.path,
    section: p.frontmatter.section,
    published: p.frontmatter.published,
  }));
  const sectionLabel = SECTION_LABELS[page.frontmatter.section as Section];

  return (
    <WikiShell path={page.path} toc={toc} pages={allPages}>
      <nav className="flex items-center gap-1.5 text-[12px] text-muted mb-3">
        <Link href="/overview/home" className="hover:text-brand">
          MDplus Wiki
        </Link>
        <span>/</span>
        <span>{sectionLabel}</span>
        <span>/</span>
        <span className="text-ink">{page.frontmatter.title}</span>
      </nav>

      <h1 className="font-serif text-[36px] leading-[1.15] mb-2">{page.frontmatter.title}</h1>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted mb-7 pb-5 border-b border-hairline">
        {page.frontmatter.updatedAt && (
          <span>Last updated {page.frontmatter.updatedAt}</span>
        )}
        <span className="hidden sm:inline">·</span>
        <span>
          File: <code className="bg-sidebar px-1 py-0.5 rounded">content/{page.path}.mdx</code>
        </span>
        {page.frontmatter.published === false && (
          <span className="px-1.5 py-0.5 rounded bg-sidebar border border-hairline text-muted">
            Draft
          </span>
        )}
      </div>

      <article className="prose">
        <MDXRemote
          source={page.content}
          components={mdxComponents}
          options={{
            mdxOptions: {
              remarkPlugins: [remarkGfm],
              rehypePlugins: [rehypeSlug],
            },
          }}
        />
      </article>

      <PageFooter section={page.frontmatter.section} slug={slug} />
    </WikiShell>
  );
}

function PageFooter({ section, slug }: { section: Section; slug: string }) {
  const all = getAllPages().filter((p) => p.frontmatter.section === section);
  const idx = all.findIndex((p) => p.slug === slug);
  const prev = idx > 0 ? all[idx - 1] : null;
  const next = idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null;
  return (
    <div className="mt-12 pt-6 border-t border-hairline grid grid-cols-2 gap-3">
      <div>
        {prev && (
          <Link
            href={`/${prev.path}`}
            className="block p-3 rounded-card border border-hairline hover:border-brand hover:bg-brand-50/40"
          >
            <div className="text-[10.5px] uppercase tracking-wide text-muted mb-0.5">Previous</div>
            <div className="text-[14px] font-medium text-ink">{prev.frontmatter.title}</div>
          </Link>
        )}
      </div>
      <div>
        {next && (
          <Link
            href={`/${next.path}`}
            className="block p-3 rounded-card border border-hairline hover:border-brand hover:bg-brand-50/40 text-right"
          >
            <div className="text-[10.5px] uppercase tracking-wide text-muted mb-0.5">Next</div>
            <div className="text-[14px] font-medium text-ink">{next.frontmatter.title}</div>
          </Link>
        )}
      </div>
    </div>
  );
}

