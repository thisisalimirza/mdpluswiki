'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import * as Icons from '@tabler/icons-react';
import Fuse from 'fuse.js';
import type { NavPage, Section } from '@/lib/content';

type SearchablePage = NavPage & { section: Section; sectionLabel: string };

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

export default function SearchModal({ searchablePages }: { searchablePages: SearchablePage[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Initialize Fuse.js
  const fuse = useMemo(
    () =>
      new Fuse(searchablePages, {
        keys: [
          { name: 'title', weight: 2 },
          { name: 'contentPreview', weight: 1 },
        ],
        threshold: 0.3,
        includeMatches: true,
        minMatchCharLength: 2,
      }),
    [searchablePages]
  );

  // Search results
  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    return fuse.search(query).slice(0, 10);
  }, [fuse, query]);

  // Global keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === '/' && !isOpen && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
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
        setSelectedIndex((i) => Math.min(i + 1, searchResults.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && searchResults[selectedIndex]) {
        e.preventDefault();
        router.push(`/${searchResults[selectedIndex].item.path}`);
        setIsOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, searchResults, selectedIndex, router]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchResults]);

  // Highlight matching text
  function highlightMatch(text: string, q: string): React.ReactNode {
    if (!q.trim()) return text;
    try {
      const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
      return parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className="bg-yellow-200 text-ink px-0.5 rounded">
            {part}
          </mark>
        ) : (
          part
        )
      );
    } catch {
      return text;
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setIsOpen(false)}
      />

      {/* Modal */}
      <div className="relative w-full max-w-xl mx-4 bg-white rounded-xl shadow-2xl border border-hairline overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-hairline">
          <Icons.IconSearch size={20} stroke={1.75} className="text-muted shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages..."
            className="flex-1 text-[16px] outline-none bg-transparent placeholder:text-muted"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <kbd className="text-[11px] text-muted bg-gray-100 px-2 py-1 rounded border border-gray-200">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {query.trim() === '' ? (
            <div className="px-4 py-8 text-center text-muted text-[14px]">
              <Icons.IconSearch size={32} stroke={1.5} className="mx-auto mb-2 opacity-50" />
              <p>Start typing to search pages...</p>
              <p className="text-[12px] mt-1">Searches titles and page content</p>
            </div>
          ) : searchResults.length > 0 ? (
            <ul className="py-2">
              {searchResults.map((result, idx) => {
                const Icon = getIcon(result.item.icon);
                const isSelected = idx === selectedIndex;
                return (
                  <li key={result.item.path}>
                    <button
                      onClick={() => {
                        router.push(`/${result.item.path}`);
                        setIsOpen(false);
                      }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`w-full text-left px-4 py-3 flex items-start gap-3 ${
                        isSelected ? 'bg-brand-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${
                        isSelected ? 'bg-brand text-white' : 'bg-gray-100 text-muted'
                      }`}>
                        <Icon size={16} stroke={1.75} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-medium text-ink">
                          {highlightMatch(result.item.title, query)}
                        </div>
                        <div className="text-[12px] text-muted">
                          {result.item.sectionLabel}
                        </div>
                        {result.item.contentPreview && (
                          <div className="text-[12px] text-muted/70 mt-1 line-clamp-2">
                            {highlightMatch(result.item.contentPreview.slice(0, 150), query)}...
                          </div>
                        )}
                      </div>
                      {isSelected && (
                        <kbd className="text-[10px] text-muted bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200 self-center">
                          ↵
                        </kbd>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-4 py-8 text-center text-muted text-[14px]">
              <Icons.IconMoodSad size={32} stroke={1.5} className="mx-auto mb-2 opacity-50" />
              <p>No results for "{query}"</p>
              <p className="text-[12px] mt-1">Try a different search term</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-hairline px-4 py-2 flex items-center justify-between text-[11px] text-muted bg-gray-50">
          <div className="flex items-center gap-4">
            <span>
              <kbd className="px-1.5 py-0.5 bg-white rounded border border-gray-200 mr-1">↑↓</kbd>
              navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-white rounded border border-gray-200 mr-1">↵</kbd>
              open
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-white rounded border border-gray-200 mr-1">esc</kbd>
              close
            </span>
          </div>
          <span>{searchResults.length} results</span>
        </div>
      </div>
    </div>
  );
}
