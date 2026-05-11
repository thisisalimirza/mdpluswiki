'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Icons from '@tabler/icons-react';
import Fuse from 'fuse.js';
import type { NavGroup, NavPage, Section } from '@/lib/content';

type SearchablePage = NavPage & { section: Section; sectionLabel: string; searchContent: string };
type RecentChange = {
  title: string;
  path: string;
  section: Section;
  sectionLabel: string;
  updatedAt: string;
  icon?: string;
};

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

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function Sidebar({
  tree,
  searchablePages,
  recentChanges,
}: {
  tree: NavGroup[];
  searchablePages: SearchablePage[];
  recentChanges: RecentChange[];
}) {
  const pathname = usePathname();
  const [query, setQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize Fuse.js for full-text search
  const fuse = useMemo(
    () =>
      new Fuse(searchablePages, {
        keys: [
          { name: 'title', weight: 2 },
          { name: 'searchContent', weight: 1 },
        ],
        threshold: 0.4,
        includeMatches: true,
        minMatchCharLength: 2,
        ignoreLocation: true, // Search entire content, not just beginning
      }),
    [searchablePages]
  );

  // Search results
  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    return fuse.search(query).slice(0, 8);
  }, [fuse, query]);

  // Close search on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearch(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
      if (showSearch && searchResults.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, searchResults.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Enter' && searchResults[selectedIndex]) {
          e.preventDefault();
          window.location.href = `/${searchResults[selectedIndex].item.path}`;
        }
      }
      if (e.key === 'Escape') {
        setShowSearch(false);
        setQuery('');
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showSearch, searchResults, selectedIndex]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchResults]);

  // Filter nav tree for basic title search (when not using full search modal)
  const filtered = useMemo(() => {
    if (!query.trim()) return tree;
    const q = query.toLowerCase();
    return tree
      .map((g) => ({ ...g, pages: g.pages.filter((p) => p.title.toLowerCase().includes(q)) }))
      .filter((g) => g.pages.length > 0);
  }, [tree, query]);

  // Highlight matching text
  function highlightMatch(text: string, query: string): React.ReactNode {
    if (!query.trim()) return text;
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="bg-yellow-200 text-ink px-0.5 rounded">
          {part}
        </mark>
      ) : (
        part
      )
    );
  }

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

      {/* Search */}
      <div className="px-3 pb-3" ref={searchRef}>
        <div className="relative">
          <Icons.IconSearch
            size={14}
            stroke={1.75}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.trim()) setShowSearch(true);
            }}
            onFocus={() => query.trim() && setShowSearch(true)}
            placeholder="Search…"
            className="w-full pl-7 pr-12 py-1.5 text-[13px] bg-white border border-hairline rounded-md focus:outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
            ⌘K
          </kbd>
        </div>

        {/* Search Results Dropdown */}
        {showSearch && query.trim() && (
          <div className="absolute left-3 right-3 mt-1 bg-white border border-hairline rounded-lg shadow-lg z-50 max-h-[400px] overflow-y-auto">
            {searchResults.length > 0 ? (
              <div className="py-2">
                <div className="px-3 py-1.5 text-[10px] font-semibold text-muted uppercase tracking-wider">
                  Search Results
                </div>
                {searchResults.map((result, idx) => {
                  const Icon = getIcon(result.item.icon);
                  const isSelected = idx === selectedIndex;
                  return (
                    <Link
                      key={result.item.path}
                      href={`/${result.item.path}`}
                      onClick={() => {
                        setShowSearch(false);
                        setQuery('');
                      }}
                      className={`block px-3 py-2 ${isSelected ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
                    >
                      <div className="flex items-start gap-2">
                        <Icon
                          size={14}
                          stroke={1.75}
                          className="text-muted mt-0.5 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium text-ink">
                            {highlightMatch(result.item.title, query)}
                          </div>
                          <div className="text-[11px] text-muted">
                            {result.item.sectionLabel}
                          </div>
                          {result.item.contentPreview && (
                            <div className="text-[11px] text-muted/70 mt-0.5 line-clamp-2">
                              {highlightMatch(
                                result.item.contentPreview.slice(0, 150),
                                query
                              )}
                              ...
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="px-3 py-6 text-center text-[12px] text-muted">
                No results for "{query}"
              </div>
            )}
            <div className="border-t border-hairline px-3 py-2 text-[10px] text-muted flex items-center justify-between">
              <span>
                <kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-200 mr-1">↑↓</kbd>
                to navigate
              </span>
              <span>
                <kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-200 mr-1">↵</kbd>
                to select
              </span>
              <span>
                <kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-200 mr-1">esc</kbd>
                to close
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-3">
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

      {/* Recent Changes */}
      {recentChanges.length > 0 && (
        <div className="border-t border-hairline px-3 py-3">
          <div className="flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.08em] uppercase text-muted mb-2">
            <Icons.IconHistory size={12} stroke={1.75} />
            Recent Changes
          </div>
          <ul className="space-y-1">
            {recentChanges.slice(0, 3).map((change) => (
              <li key={change.path}>
                <Link
                  href={`/${change.path}`}
                  className="block py-1 hover:bg-black/[0.03] rounded px-1 -mx-1"
                >
                  <div className="text-[12px] text-ink truncate">{change.title}</div>
                  <div className="text-[10px] text-muted">{formatDate(change.updatedAt)}</div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

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
