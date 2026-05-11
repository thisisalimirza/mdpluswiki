'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Icons from '@tabler/icons-react';
import type { NavGroup } from '@/lib/content';

function getIcon(name: string | undefined) {
  if (!name) return Icons.IconFile;
  const key =
    'Icon' +
    name
      .split('-')
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join('');
  const I = (Icons as unknown as Record<string, React.ComponentType<{ size?: number; stroke?: number }>>)[key];
  return I ?? Icons.IconFile;
}

export default function Sidebar({ tree }: { tree: NavGroup[] }) {
  const pathname = usePathname();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return tree;
    const q = query.toLowerCase();
    return tree
      .map((g) => ({ ...g, pages: g.pages.filter((p) => p.title.toLowerCase().includes(q)) }))
      .filter((g) => g.pages.length > 0);
  }, [tree, query]);

  return (
    <aside className="hidden md:flex md:w-[240px] md:flex-col border-r border-hairline bg-sidebar h-screen sticky top-0">
      <div className="px-4 pt-5 pb-3">
        <Link href="/overview/home" className="flex items-center gap-2.5 group">
          <div className="w-7 h-7 rounded-md bg-brand text-white grid place-items-center font-serif text-sm">
            M
          </div>
          <div className="leading-tight">
            <div className="font-semibold text-[14px] text-ink">MDplus</div>
            <div className="text-[11px] text-muted">Leadership Wiki</div>
          </div>
        </Link>
      </div>

      <div className="px-3 pb-3">
        <div className="relative">
          <Icons.IconSearch
            size={14}
            stroke={1.75}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages…"
            className="w-full pl-7 pr-2 py-1.5 text-[13px] bg-white border border-hairline rounded-md focus:outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-5">
        {filtered.map((group) => (
          <div key={group.section} className="mb-4">
            <div className="px-2 pt-2 pb-1.5 text-[10.5px] font-semibold tracking-[0.08em] uppercase text-muted">
              {group.label}
            </div>
            <ul>
              {group.pages.map((page) => {
                const Icon = getIcon(page.icon);
                const href = `/${page.path}`;
                const active = pathname === href;
                return (
                  <li key={page.path}>
                    <Link
                      href={href}
                      className={[
                        'flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px]',
                        active
                          ? 'bg-brand text-white'
                          : 'text-ink hover:bg-black/[0.04]',
                        page.published === false ? 'opacity-60 italic' : '',
                      ].join(' ')}
                    >
                      <Icon
                        size={15}
                        stroke={1.75}
                        className={active ? 'text-white' : 'text-muted'}
                      />
                      <span className="truncate">{page.title}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="px-2 py-6 text-[12px] text-muted text-center">No pages match.</div>
        )}
      </nav>

      <div className="border-t border-hairline px-4 py-3 text-[11px] text-muted">
        <a
          href="https://mdplus.community"
          target="_blank"
          rel="noreferrer"
          className="hover:text-brand"
        >
          mdplus.community ↗
        </a>
      </div>
    </aside>
  );
}
