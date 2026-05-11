'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import * as Icons from '@tabler/icons-react';
import type { SearchSection } from '@/lib/content';

interface SearchMatch {
  section: SearchSection;
  matchStart: number;
  matchEnd: number;
  snippet: string;
  highlightStart: number;
  highlightEnd: number;
}

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

// Extract snippet around a match with context
function extractSnippet(
  content: string,
  matchStart: number,
  matchEnd: number,
  contextChars: number = 60
): { snippet: string; highlightStart: number; highlightEnd: number } {
  const start = Math.max(0, matchStart - contextChars);
  const end = Math.min(content.length, matchEnd + contextChars);

  let snippet = content.slice(start, end);
  let highlightStart = matchStart - start;
  let highlightEnd = matchEnd - start;

  // Add ellipsis if truncated
  if (start > 0) {
    snippet = '...' + snippet;
    highlightStart += 3;
    highlightEnd += 3;
  }
  if (end < content.length) {
    snippet = snippet + '...';
  }

  return { snippet, highlightStart, highlightEnd };
}

// Find all matches in search index
function findMatches(sections: SearchSection[], query: string): SearchMatch[] {
  if (!query.trim() || query.length < 2) return [];

  const matches: SearchMatch[] = [];
  const q = query.toLowerCase();

  for (const section of sections) {
    // Search in heading
    const headingLower = section.heading.toLowerCase();
    let idx = headingLower.indexOf(q);
    if (idx !== -1) {
      const { snippet, highlightStart, highlightEnd } = extractSnippet(
        section.heading,
        idx,
        idx + query.length,
        30
      );
      matches.push({
        section,
        matchStart: idx,
        matchEnd: idx + query.length,
        snippet: `**${snippet}**`, // Bold to indicate heading match
        highlightStart,
        highlightEnd,
      });
    }

    // Search in content
    const contentLower = section.content.toLowerCase();
    idx = 0;
    let matchCount = 0;
    while ((idx = contentLower.indexOf(q, idx)) !== -1 && matchCount < 2) {
      const { snippet, highlightStart, highlightEnd } = extractSnippet(
        section.content,
        idx,
        idx + query.length,
        60
      );
      matches.push({
        section,
        matchStart: idx,
        matchEnd: idx + query.length,
        snippet,
        highlightStart,
        highlightEnd,
      });
      idx += query.length;
      matchCount++;
    }
  }

  return matches.slice(0, 20); // Limit total results
}

// Group matches by page
function groupByPage(matches: SearchMatch[]): Map<string, SearchMatch[]> {
  const grouped = new Map<string, SearchMatch[]>();
  for (const match of matches) {
    const key = match.section.pagePath;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(match);
  }
  return grouped;
}

export default function SearchModal({ searchIndex }: { searchIndex: SearchSection[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Find matches
  const matches = useMemo(() => findMatches(searchIndex, query), [searchIndex, query]);
  const groupedMatches = useMemo(() => groupByPage(matches), [matches]);
  const flatResults = useMemo(() => Array.from(groupedMatches.entries()), [groupedMatches]);

  // Build flat list of navigable items for keyboard nav
  const navItems = useMemo(() => {
    const items: { pagePath: string; headingSlug: string; index: number }[] = [];
    let idx = 0;
    for (const [pagePath, pageMatches] of flatResults) {
      for (const match of pageMatches) {
        items.push({ pagePath, headingSlug: match.section.headingSlug, index: idx++ });
      }
    }
    return items;
  }, [flatResults]);

  // Navigate to result
  const navigateToResult = useCallback((pagePath: string, headingSlug: string) => {
    const hash = headingSlug ? `#${headingSlug}` : '';
    const url = `/${pagePath}${hash}`;

    // Store search term for highlighting
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('wiki-search-term', query);
    }

    router.push(url);
    setIsOpen(false);
    setQuery('');
  }, [router, query]);

  // Global keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === '/' && !isOpen &&
          document.activeElement?.tagName !== 'INPUT' &&
          document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setIsOpen(true);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Modal keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, navItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && navItems[selectedIndex]) {
        e.preventDefault();
        const item = navItems[selectedIndex];
        navigateToResult(item.pagePath, item.headingSlug);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, navItems, selectedIndex, navigateToResult]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [matches]);

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current && navItems.length > 0) {
      const selectedEl = resultsRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selectedEl?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, navItems.length]);

  // Render snippet with highlighted match
  function renderSnippet(snippet: string, highlightStart: number, highlightEnd: number, q: string) {
    // For heading matches (bold), render differently
    if (snippet.startsWith('**') && snippet.endsWith('**')) {
      const inner = snippet.slice(2, -2);
      return (
        <span className="font-medium">
          {renderHighlight(inner, highlightStart, highlightEnd)}
        </span>
      );
    }
    return renderHighlight(snippet, highlightStart, highlightEnd);
  }

  function renderHighlight(text: string, start: number, end: number) {
    if (start < 0 || end > text.length) return text;
    return (
      <>
        {text.slice(0, start)}
        <mark className="bg-yellow-200 text-yellow-900 px-0.5 rounded font-medium">
          {text.slice(start, end)}
        </mark>
        {text.slice(end)}
      </>
    );
  }

  if (!isOpen) return null;

  let globalIdx = 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] sm:pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setIsOpen(false)}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl mx-4 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
          <Icons.IconSearch size={20} stroke={1.75} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search wiki..."
            className="flex-1 text-[16px] outline-none bg-transparent placeholder:text-gray-400"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <Icons.IconX size={16} stroke={1.75} className="text-gray-400" />
            </button>
          )}
          <kbd className="text-[11px] text-gray-500 bg-gray-100 px-2 py-1 rounded border border-gray-200">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={resultsRef} className="max-h-[60vh] overflow-y-auto">
          {query.trim() === '' ? (
            <div className="px-4 py-12 text-center text-gray-500">
              <Icons.IconSearch size={40} stroke={1.25} className="mx-auto mb-3 text-gray-300" />
              <p className="text-[15px] font-medium">Search the wiki</p>
              <p className="text-[13px] mt-1">Find pages, headings, and content</p>
            </div>
          ) : query.length < 2 ? (
            <div className="px-4 py-12 text-center text-gray-500">
              <p className="text-[14px]">Type at least 2 characters to search</p>
            </div>
          ) : matches.length > 0 ? (
            <div className="py-2">
              {flatResults.map(([pagePath, pageMatches]) => {
                const firstMatch = pageMatches[0];
                const Icon = getIcon(firstMatch.section.pageIcon);

                return (
                  <div key={pagePath} className="px-2">
                    {/* Page header */}
                    <div className="flex items-center gap-2 px-2 pt-3 pb-1">
                      <Icon size={14} stroke={1.75} className="text-gray-400" />
                      <span className="text-[12px] font-semibold text-gray-600">
                        {firstMatch.section.pageTitle}
                      </span>
                      <span className="text-[11px] text-gray-400">
                        {firstMatch.section.sectionLabel}
                      </span>
                    </div>

                    {/* Matches in this page */}
                    {pageMatches.map((match, matchIdx) => {
                      const thisIdx = globalIdx++;
                      const isSelected = thisIdx === selectedIndex;

                      return (
                        <button
                          key={`${match.section.headingSlug}-${matchIdx}`}
                          data-index={thisIdx}
                          onClick={() => navigateToResult(pagePath, match.section.headingSlug)}
                          onMouseEnter={() => setSelectedIndex(thisIdx)}
                          className={`w-full text-left px-3 py-2 rounded-lg mx-1 mb-1 transition-colors ${
                            isSelected ? 'bg-brand-50 border border-brand-200' : 'hover:bg-gray-50 border border-transparent'
                          }`}
                          style={{ width: 'calc(100% - 8px)' }}
                        >
                          <div className="flex items-start gap-3">
                            <div className="shrink-0 mt-0.5">
                              {match.section.headingSlug ? (
                                <Icons.IconHash size={14} stroke={1.75} className="text-gray-400" />
                              ) : (
                                <Icons.IconFileText size={14} stroke={1.75} className="text-gray-400" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              {match.section.headingSlug && (
                                <div className="text-[12px] text-gray-500 mb-0.5">
                                  {match.section.heading}
                                </div>
                              )}
                              <div className="text-[13px] text-gray-700 leading-relaxed">
                                {renderSnippet(
                                  match.snippet,
                                  match.highlightStart,
                                  match.highlightEnd,
                                  query
                                )}
                              </div>
                            </div>
                            {isSelected && (
                              <div className="shrink-0 self-center">
                                <kbd className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                                  ↵
                                </kbd>
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-4 py-12 text-center text-gray-500">
              <Icons.IconSearchOff size={40} stroke={1.25} className="mx-auto mb-3 text-gray-300" />
              <p className="text-[15px] font-medium">No results for "{query}"</p>
              <p className="text-[13px] mt-1">Try different keywords</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-4 py-2.5 flex items-center justify-between text-[11px] text-gray-500 bg-gray-50">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white rounded border border-gray-200">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-white rounded border border-gray-200">↓</kbd>
              <span className="ml-1">navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white rounded border border-gray-200">↵</kbd>
              <span className="ml-1">open</span>
            </span>
          </div>
          <span>
            {matches.length} {matches.length === 1 ? 'match' : 'matches'}
          </span>
        </div>
      </div>
    </div>
  );
}
