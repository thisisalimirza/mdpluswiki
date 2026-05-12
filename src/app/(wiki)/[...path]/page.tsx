import { notFound } from 'next/navigation';
import Link from 'next/link';
import { MDXRemote } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import { getAllPages, getPage, getSectionLabel } from '@/lib/content';
import { extractToc } from '@/lib/toc';
import { mdxComponents } from '@/components/MdxComponents';
import WikiShell from '@/components/WikiShell';
import SearchHighlight from '@/components/SearchHighlight';
import EditHistory from '@/components/EditHistory';

export const dynamic = 'force-static';
export const dynamicParams = true;

export async function generateStaticParams() {
  return getAllPages({ includeDrafts: true }).map((p) => ({
    path: p.path.split('/'),
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const { path: pathSegments } = await params;
  const slug = pathSegments.pop()!;
  const section = pathSegments.join('/');
  const page = getPage(section, slug);
  if (!page) return { title: 'Not found · MDplus Wiki' };
  return {
    title: `${page.frontmatter.title} · MDplus Wiki`,
    description: `${page.frontmatter.title} — MDplus Leadership Wiki`,
  };
}

export default async function WikiPageRoute({ params }: { params: Promise<{ path: string[] }> }) {
  const { path: pathSegments } = await params;

  // Need at least section + slug
  if (pathSegments.length < 2) notFound();

  const slug = pathSegments[pathSegments.length - 1];
  const section = pathSegments.slice(0, -1).join('/');

  const page = getPage(section, slug);
  if (!page) notFound();

  const toc = extractToc(page.content);
  const allPages = getAllPages({ includeDrafts: true }).map((p) => ({
    title: p.frontmatter.title,
    path: p.path,
    section: p.frontmatter.section,
    published: p.frontmatter.published,
  }));

  const sectionLabel = getSectionLabel(page.frontmatter.section);

  // Build breadcrumb parts
  const breadcrumbs = section.split('/').map((part, idx, arr) => ({
    label: getSectionLabel(arr.slice(0, idx + 1).join('/')),
    path: arr.slice(0, idx + 1).join('/'),
  }));

  return (
    <WikiShell path={page.path} toc={toc} pages={allPages}>
      <SearchHighlight />
      <nav className="flex items-center gap-1.5 text-[12px] text-muted mb-3 flex-wrap">
        <Link href="/overview/home" className="hover:text-brand">
          MDplus Wiki
        </Link>
        {breadcrumbs.map((crumb, idx) => (
          <span key={crumb.path} className="flex items-center gap-1.5">
            <span>/</span>
            <span>{crumb.label}</span>
          </span>
        ))}
        <span>/</span>
        <span className="text-ink">{page.frontmatter.title}</span>
      </nav>

      <h1 className="font-serif text-[36px] leading-[1.15] mb-2">{page.frontmatter.title}</h1>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
        {page.frontmatter.updatedAt && (
          <span>
            Last updated {page.frontmatter.updatedAt}
            {page.frontmatter.updatedBy && (
              <> by <strong className="font-medium text-ink">{page.frontmatter.updatedBy}</strong></>
            )}
          </span>
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

      <EditHistory history={page.frontmatter.editHistory} />

      <div className="mb-7 pb-5 border-b border-hairline" />

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

function PageFooter({ section, slug }: { section: string; slug: string }) {
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
