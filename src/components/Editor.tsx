'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import * as Icons from '@tabler/icons-react';
import type { IconProps } from '@tabler/icons-react';
import {
  clearStoredToken,
  getStoredToken,
  setStoredToken,
} from './AuthGate';

const SECTIONS = ['overview', 'operations', 'communities', 'admin'] as const;
type Section = (typeof SECTIONS)[number];

export type EditorMode =
  | { kind: 'edit'; path: string }
  | { kind: 'new'; defaultSection?: Section }
  | { kind: 'manage' };

// Popular icons for the icon picker
const POPULAR_ICONS = [
  'home', 'file', 'folder', 'users', 'user', 'settings', 'link', 'star',
  'heart', 'bookmark', 'bell', 'calendar', 'clock', 'mail', 'message',
  'phone', 'map-pin', 'building', 'briefcase', 'clipboard', 'clipboard-list',
  'check', 'x', 'plus', 'minus', 'search', 'filter', 'edit', 'trash',
  'download', 'upload', 'share', 'external-link', 'lock', 'unlock', 'key',
  'shield', 'alert-circle', 'info-circle', 'help-circle', 'bulb', 'bolt',
  'chart-bar', 'chart-pie', 'chart-line', 'trending-up', 'coin', 'wallet',
  'credit-card', 'receipt', 'report', 'news', 'article', 'book', 'notebook',
  'school', 'award', 'trophy', 'target', 'flag', 'rocket', 'plane',
  'car', 'world', 'globe', 'sun', 'moon', 'cloud', 'database', 'server',
  'code', 'terminal', 'git-branch', 'brand-github', 'brand-slack', 'brand-google',
  'video', 'camera', 'photo', 'microphone', 'headphones', 'music',
  'flask', 'microscope', 'stethoscope', 'pill', 'first-aid-kit', 'heart-rate-monitor',
  'building-hospital', 'dna', 'virus', 'vaccine', 'activity', 'heartbeat',
  'door-exit', 'door-enter', 'login', 'logout', 'refresh', 'rotate',
  'arrows-exchange', 'switch', 'toggle-left', 'toggle-right',
  'list', 'list-numbers', 'checkbox', 'circle-check', 'square-check',
  'table', 'layout-grid', 'layout-list', 'columns', 'rows',
  'currency-dollar', 'currency-bitcoin', 'scale', 'balance',
  'device-laptop', 'device-mobile', 'device-desktop', 'device-tablet',
  'wifi', 'bluetooth', 'cast', 'screen-share', 'presentation',
  'notes', 'writing', 'pencil', 'highlighter', 'eraser', 'ruler',
];

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function todayHuman(): string {
  return new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function buildFrontmatter(opts: {
  title: string;
  section: Section;
  icon: string;
  published: boolean;
}): string {
  return [
    '---',
    `title: "${opts.title.replace(/"/g, '\\"')}"`,
    `section: ${opts.section}`,
    `icon: ${opts.icon || 'file'}`,
    `updatedAt: "${todayHuman()}"`,
    `published: ${opts.published}`,
    '---',
    '',
  ].join('\n');
}

function parseFrontmatter(raw: string): {
  fm: Record<string, string | boolean>;
  body: string;
} {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: raw };
  const fm: Record<string, string | boolean> = {};
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val: string | boolean = line.slice(idx + 1).trim();
    if (typeof val === 'string') {
      val = val.replace(/^"(.*)"$/, '$1');
      if (val === 'true') val = true;
      else if (val === 'false') val = false;
    }
    fm[key] = val;
  }
  return { fm, body: m[2] };
}

// Get draft key for localStorage
function getDraftKey(mode: EditorMode): string {
  if (mode.kind === 'edit') return `wiki-draft-${mode.path}`;
  if (mode.kind === 'new') return `wiki-draft-new-${mode.defaultSection || 'overview'}`;
  return 'wiki-draft-manage';
}

// Toolbar button component
function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  active = false,
}: {
  icon: React.ComponentType<IconProps>;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`p-1.5 rounded hover:bg-brand-50 hover:text-brand transition-colors ${
        active ? 'bg-brand-50 text-brand' : ''
      }`}
    >
      <Icon size={16} stroke={1.75} />
    </button>
  );
}

// Callout dropdown
function CalloutDropdown({
  onSelect,
}: {
  onSelect: (type: 'info' | 'warning' | 'success' | 'tip') => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const options = [
    { type: 'info' as const, label: 'Info', icon: Icons.IconInfoCircle, color: 'text-brand' },
    { type: 'tip' as const, label: 'Tip', icon: Icons.IconBulb, color: 'text-blue-600' },
    { type: 'warning' as const, label: 'Warning', icon: Icons.IconAlertTriangle, color: 'text-amber-600' },
    { type: 'success' as const, label: 'Success', icon: Icons.IconCircleCheck, color: 'text-emerald-600' },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title="Insert callout box"
        className="p-1.5 rounded hover:bg-brand-50 hover:text-brand transition-colors flex items-center gap-0.5"
      >
        <Icons.IconInfoCircle size={16} stroke={1.75} />
        <Icons.IconChevronDown size={12} stroke={2} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-hairline rounded-md shadow-lg py-1 z-10 min-w-[140px]">
          {options.map((opt) => (
            <button
              key={opt.type}
              onClick={() => {
                onSelect(opt.type);
                setOpen(false);
              }}
              className="w-full px-3 py-1.5 text-left text-[13px] hover:bg-brand-50 flex items-center gap-2"
            >
              <opt.icon size={14} stroke={1.75} className={opt.color} />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Icon Picker component
function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (icon: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filteredIcons = useMemo(() => {
    if (!search) return POPULAR_ICONS;
    const q = search.toLowerCase();
    return POPULAR_ICONS.filter((name) => name.includes(q));
  }, [search]);

  const getIconComponent = (name: string) => {
    const key =
      'Icon' +
      name
        .split('-')
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join('');
    return (Icons as unknown as Record<string, React.ComponentType<IconProps>>)[key] ?? Icons.IconFile;
  };

  const CurrentIcon = getIconComponent(value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 border border-hairline rounded-md text-[14px] focus:outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100 flex items-center gap-2 bg-white hover:bg-sidebar transition-colors"
      >
        <CurrentIcon size={18} stroke={1.75} className="text-brand" />
        <span className="flex-1 text-left truncate">{value || 'file'}</span>
        <Icons.IconChevronDown size={14} stroke={2} className="text-muted" />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-hairline rounded-md shadow-lg z-20 max-h-[300px] overflow-hidden flex flex-col">
          <div className="p-2 border-b border-hairline">
            <div className="relative">
              <Icons.IconSearch size={14} stroke={1.75} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search icons..."
                className="w-full pl-8 pr-2 py-1.5 text-[13px] bg-sidebar border border-hairline rounded focus:outline-none focus:border-brand-300"
                autoFocus
              />
            </div>
          </div>
          <div className="p-2 overflow-y-auto flex-1 grid grid-cols-6 gap-1">
            {filteredIcons.map((name) => {
              const Icon = getIconComponent(name);
              const isSelected = name === value;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    onChange(name);
                    setOpen(false);
                    setSearch('');
                  }}
                  title={name}
                  className={`p-2 rounded hover:bg-brand-50 transition-colors ${
                    isSelected ? 'bg-brand text-white hover:bg-brand' : ''
                  }`}
                >
                  <Icon size={18} stroke={1.75} />
                </button>
              );
            })}
            {filteredIcons.length === 0 && (
              <div className="col-span-6 py-4 text-center text-[12px] text-muted">
                No icons found
              </div>
            )}
          </div>
          <div className="p-2 border-t border-hairline">
            <input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Or type icon name..."
              className="w-full px-2 py-1 text-[12px] bg-sidebar border border-hairline rounded focus:outline-none focus:border-brand-300"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Preview component for rendering markdown
function MarkdownPreview({ content }: { content: string }) {
  // Strip MDX components for basic preview
  const cleanContent = content
    .replace(/<Callout[^>]*>([\s\S]*?)<\/Callout>/g, (_, inner) => `> ${inner.trim()}`)
    .replace(/<LinkCard[^>]*\/>/g, '[Link Card]')
    .replace(/<PersonRow[^>]*\/>/g, '[Person]');

  return (
    <div className="prose prose-sm max-w-none">
      <ReactMarkdown>{cleanContent}</ReactMarkdown>
    </div>
  );
}

export default function Editor({
  mode,
  onClose,
  initialPages,
}: {
  mode: EditorMode;
  onClose: () => void;
  initialPages?: Array<{ title: string; path: string; section: string; published?: boolean }>;
}) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [title, setTitle] = useState('');
  const [section, setSection] = useState<Section>(
    mode.kind === 'new' ? mode.defaultSection || 'overview' : 'overview'
  );
  const [icon, setIcon] = useState('file');
  const [published, setPublished] = useState(true);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(mode.kind === 'edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pages, setPages] = useState(initialPages ?? []);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [initialValues, setInitialValues] = useState({ title: '', body: '', icon: 'file' });
  const [draftRestored, setDraftRestored] = useState(false);

  // Track if there are unsaved changes
  useEffect(() => {
    const changed =
      title !== initialValues.title ||
      body !== initialValues.body ||
      icon !== initialValues.icon;
    setHasUnsavedChanges(changed);
  }, [title, body, icon, initialValues]);

  // Auto-save draft to localStorage
  useEffect(() => {
    if (mode.kind === 'manage' || loading) return;

    const draftKey = getDraftKey(mode);
    const draft = { title, body, icon, section, published, savedAt: Date.now() };

    const timeoutId = setTimeout(() => {
      localStorage.setItem(draftKey, JSON.stringify(draft));
    }, 1000); // Debounce 1 second

    return () => clearTimeout(timeoutId);
  }, [title, body, icon, section, published, mode, loading]);

  // Restore draft from localStorage
  useEffect(() => {
    if (mode.kind === 'manage' || draftRestored) return;

    const draftKey = getDraftKey(mode);
    const savedDraft = localStorage.getItem(draftKey);

    if (savedDraft && mode.kind === 'new') {
      try {
        const draft = JSON.parse(savedDraft);
        // Only restore if saved within last 24 hours
        if (draft.savedAt && Date.now() - draft.savedAt < 24 * 60 * 60 * 1000) {
          const restore = confirm('You have an unsaved draft. Would you like to restore it?');
          if (restore) {
            setTitle(draft.title || '');
            setBody(draft.body || '');
            setIcon(draft.icon || 'file');
            setSection(draft.section || 'overview');
            setPublished(draft.published !== false);
          } else {
            localStorage.removeItem(draftKey);
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
    setDraftRestored(true);
  }, [mode, draftRestored]);

  // Warn before closing with unsaved changes
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Handle close with unsaved changes warning
  const handleClose = useCallback(() => {
    if (hasUnsavedChanges) {
      const leave = confirm('You have unsaved changes. Are you sure you want to close?');
      if (!leave) return;
    }
    // Clear draft on intentional close
    if (mode.kind !== 'manage') {
      localStorage.removeItem(getDraftKey(mode));
    }
    onClose();
  }, [hasUnsavedChanges, mode, onClose]);

  // Helper to insert text at cursor or wrap selected text
  function insertText(before: string, after: string = '', placeholder: string = '') {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = body.slice(start, end);
    const textToInsert = selectedText || placeholder;

    const newText = body.slice(0, start) + before + textToInsert + after + body.slice(end);
    setBody(newText);

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + before.length + textToInsert.length;
      textarea.setSelectionRange(
        selectedText ? start + before.length : newCursorPos,
        selectedText ? start + before.length + selectedText.length : newCursorPos
      );
    }, 0);
  }

  function insertAtLineStart(prefix: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const lineStart = body.lastIndexOf('\n', start - 1) + 1;

    const newText = body.slice(0, lineStart) + prefix + body.slice(lineStart);
    setBody(newText);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length);
    }, 0);
  }

  function insertBlock(block: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const beforeCursor = body.slice(0, start);
    const needsNewlineBefore = beforeCursor.length > 0 && !beforeCursor.endsWith('\n\n');
    const prefix = needsNewlineBefore ? (beforeCursor.endsWith('\n') ? '\n' : '\n\n') : '';

    const newText = body.slice(0, start) + prefix + block + body.slice(start);
    setBody(newText);

    setTimeout(() => {
      textarea.focus();
      const newPos = start + prefix.length + block.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  }

  const formatActions = {
    bold: () => insertText('**', '**', 'bold text'),
    italic: () => insertText('*', '*', 'italic text'),
    heading: () => insertAtLineStart('## '),
    bulletList: () => insertAtLineStart('- '),
    numberedList: () => insertAtLineStart('1. '),
    checkbox: () => insertAtLineStart('- [ ] '),
    link: () => {
      const url = prompt('Enter URL:', 'https://');
      if (url) {
        const textarea = textareaRef.current;
        const selectedText = textarea ? body.slice(textarea.selectionStart, textarea.selectionEnd) : '';
        insertText('[', `](${url})`, selectedText || 'link text');
      }
    },
    callout: (type: 'info' | 'warning' | 'success' | 'tip') => {
      const titles: Record<string, string> = {
        info: 'Note',
        warning: 'Warning',
        success: 'Success',
        tip: 'Tip',
      };
      insertBlock(`<Callout type="${type}" title="${titles[type]}">\nYour content here...\n</Callout>\n`);
    },
    linkCard: () => {
      const url = prompt('Enter URL:', 'https://');
      if (url) {
        const linkTitle = prompt('Card title:', 'Link title');
        const description = prompt('Description (optional):', '');
        insertBlock(`<LinkCard\n  href="${url}"\n  title="${linkTitle || 'Link'}"\n  description="${description}"\n  icon="link"\n/>\n`);
      }
    },
    table: () => {
      insertBlock(`| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |
`);
    },
    divider: () => insertBlock('\n---\n'),
  };

  useEffect(() => {
    if (mode.kind !== 'edit') return;
    (async () => {
      try {
        const res = await fetch(`/api/raw?path=${encodeURIComponent(mode.path)}`);
        if (!res.ok) throw new Error('Could not load page');
        const json = await res.json();
        const { fm, body } = parseFrontmatter(json.raw);
        const loadedTitle = String(fm.title ?? '');
        const loadedBody = body.replace(/^\n+/, '');
        const loadedIcon = String(fm.icon ?? 'file');

        setTitle(loadedTitle);
        setSection((fm.section as Section) ?? 'overview');
        setIcon(loadedIcon);
        setPublished(fm.published !== false);
        setBody(loadedBody);
        setInitialValues({ title: loadedTitle, body: loadedBody, icon: loadedIcon });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [mode]);

  useEffect(() => {
    if (mode.kind !== 'manage' || initialPages) return;
    (async () => {
      const res = await fetch('/api/pages');
      const json = await res.json();
      setPages(json.pages || []);
    })();
  }, [mode, initialPages]);

  const targetPath = useMemo(() => {
    if (mode.kind === 'edit') return mode.path;
    const slug = slugify(title || 'untitled');
    return `${section}/${slug}`;
  }, [mode, title, section]);

  async function ensureToken(): Promise<string | null> {
    let t = getStoredToken();
    if (t) return t;
    const password = prompt('Editor password (8hr session)');
    if (!password) return null;
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'auth', password }),
    });
    if (!res.ok) {
      setError('Invalid password');
      return null;
    }
    const json = await res.json();
    setStoredToken(json.token);
    return json.token;
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const token = await ensureToken();
      if (!token) {
        setSaving(false);
        return;
      }
      const fm = buildFrontmatter({ title, section, icon, published });
      const content = fm + '\n' + body.trim() + '\n';
      const path = targetPath;
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', token, path, content }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 401) clearStoredToken();
        throw new Error(json.error || 'Save failed');
      }

      // Clear draft on successful save
      localStorage.removeItem(getDraftKey(mode));
      setHasUnsavedChanges(false);
      setInitialValues({ title, body, icon });

      setToast(
        `Committed ${path}.mdx (${(json.commitSha as string).slice(0, 7)}). Vercel will redeploy in ~30s.`
      );
      setTimeout(() => {
        if (mode.kind === 'new') router.push(`/${path}`);
        else router.refresh();
        onClose();
      }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function remove(path: string) {
    if (!confirm(`Delete ${path}.mdx? This commits a deletion to GitHub.`)) return;
    const token = await ensureToken();
    if (!token) return;
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', token, path }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || 'Delete failed');
      return;
    }
    setPages((curr) => curr.filter((p) => p.path !== path));
    setToast(`Deleted ${path}.mdx`);
    setTimeout(() => router.refresh(), 800);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center px-3 py-6">
      <div className="w-full max-w-[1000px] max-h-[92vh] bg-white rounded-card shadow-xl border border-hairline flex flex-col">
        <header className="flex items-center justify-between px-5 py-3 border-b border-hairline">
          <div className="flex items-center gap-2">
            {mode.kind === 'edit' && <Icons.IconPencil size={16} stroke={1.75} className="text-brand" />}
            {mode.kind === 'new' && <Icons.IconPlus size={16} stroke={1.75} className="text-brand" />}
            {mode.kind === 'manage' && <Icons.IconSettings size={16} stroke={1.75} className="text-brand" />}
            <h2 className="font-serif text-[20px]">
              {mode.kind === 'edit'
                ? 'Edit page'
                : mode.kind === 'new'
                ? 'New page'
                : 'Manage pages'}
            </h2>
            {hasUnsavedChanges && mode.kind !== 'manage' && (
              <span className="text-[11px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                Unsaved changes
              </span>
            )}
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-md hover:bg-black/[0.04]"
            aria-label="Close editor"
          >
            <Icons.IconX size={16} stroke={1.75} />
          </button>
        </header>

        {mode.kind !== 'manage' ? (
          <div className="flex-1 overflow-y-auto p-5 grid gap-4">
            {loading ? (
              <div className="text-center text-muted py-10">Loading…</div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <label className="flex flex-col gap-1 col-span-2">
                    <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">
                      Page title
                    </span>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="px-3 py-2 border border-hairline rounded-md text-[14px] focus:outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
                      placeholder="e.g. Leader onboarding"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">
                      Section
                    </span>
                    <select
                      value={section}
                      onChange={(e) => setSection(e.target.value as Section)}
                      disabled={mode.kind === 'edit'}
                      className="px-3 py-2 border border-hairline rounded-md text-[14px] focus:outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100 disabled:bg-sidebar disabled:text-muted"
                    >
                      {SECTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">
                      Icon
                    </span>
                    <IconPicker value={icon} onChange={setIcon} />
                  </label>
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={published}
                      onChange={(e) => setPublished(e.target.checked)}
                      className="accent-brand"
                    />
                    <span className="text-[13px]">Published (shown in nav)</span>
                  </label>
                  <div className="text-[12px] text-muted">
                    Will commit to <code className="bg-sidebar px-1 py-0.5 rounded">content/{targetPath}.mdx</code>
                  </div>
                </div>

                <div className="flex flex-col gap-1 flex-1">
                  {/* Tab bar for Edit/Preview */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 bg-sidebar p-1 rounded-md">
                      <button
                        type="button"
                        onClick={() => setActiveTab('edit')}
                        className={`px-3 py-1.5 text-[13px] rounded transition-colors ${
                          activeTab === 'edit'
                            ? 'bg-white shadow-sm font-medium'
                            : 'text-muted hover:text-ink'
                        }`}
                      >
                        <Icons.IconPencil size={14} stroke={1.75} className="inline mr-1.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('preview')}
                        className={`px-3 py-1.5 text-[13px] rounded transition-colors ${
                          activeTab === 'preview'
                            ? 'bg-white shadow-sm font-medium'
                            : 'text-muted hover:text-ink'
                        }`}
                      >
                        <Icons.IconEye size={14} stroke={1.75} className="inline mr-1.5" />
                        Preview
                      </button>
                    </div>
                    {activeTab === 'edit' && (
                      <div className="text-[10px] text-muted">
                        Auto-saving draft locally
                      </div>
                    )}
                  </div>

                  {activeTab === 'edit' ? (
                    <>
                      {/* Formatting Toolbar */}
                      <div className="flex items-center gap-0.5 p-1.5 bg-sidebar border border-hairline border-b-0 rounded-t-md flex-wrap">
                        <div className="flex items-center gap-0.5 pr-2 border-r border-hairline mr-1">
                          <ToolbarButton icon={Icons.IconBold} label="Bold (Ctrl+B)" onClick={formatActions.bold} />
                          <ToolbarButton icon={Icons.IconItalic} label="Italic (Ctrl+I)" onClick={formatActions.italic} />
                        </div>

                        <div className="flex items-center gap-0.5 pr-2 border-r border-hairline mr-1">
                          <ToolbarButton icon={Icons.IconH2} label="Heading" onClick={formatActions.heading} />
                          <ToolbarButton icon={Icons.IconList} label="Bullet list" onClick={formatActions.bulletList} />
                          <ToolbarButton icon={Icons.IconListNumbers} label="Numbered list" onClick={formatActions.numberedList} />
                          <ToolbarButton icon={Icons.IconCheckbox} label="Checkbox" onClick={formatActions.checkbox} />
                        </div>

                        <div className="flex items-center gap-0.5 pr-2 border-r border-hairline mr-1">
                          <ToolbarButton icon={Icons.IconLink} label="Insert link" onClick={formatActions.link} />
                          <ToolbarButton icon={Icons.IconTable} label="Insert table" onClick={formatActions.table} />
                          <ToolbarButton icon={Icons.IconMinus} label="Divider" onClick={formatActions.divider} />
                        </div>

                        <div className="flex items-center gap-0.5">
                          <CalloutDropdown onSelect={formatActions.callout} />
                          <ToolbarButton
                            icon={Icons.IconExternalLink}
                            label="Insert link card"
                            onClick={formatActions.linkCard}
                          />
                        </div>
                      </div>

                      <textarea
                        ref={textareaRef}
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        spellCheck={false}
                        onKeyDown={(e) => {
                          if (e.metaKey || e.ctrlKey) {
                            if (e.key === 'b') {
                              e.preventDefault();
                              formatActions.bold();
                            } else if (e.key === 'i') {
                              e.preventDefault();
                              formatActions.italic();
                            } else if (e.key === 'k') {
                              e.preventDefault();
                              formatActions.link();
                            }
                          }
                        }}
                        className="font-mono text-[13px] leading-relaxed min-h-[35vh] px-3 py-3 border border-hairline rounded-b-md rounded-t-none focus:outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100 resize-y bg-[#FBFAF7]"
                        placeholder="Start writing your page content here...

Tips:
• Use ## Heading for section titles (shows in table of contents)
• Use the toolbar above to format text
• Select text first, then click Bold or Italic to format it"
                      />
                      <div className="text-[11px] text-muted flex items-center gap-3 flex-wrap">
                        <span>
                          <kbd className="px-1 py-0.5 bg-sidebar rounded text-[10px]">Ctrl+B</kbd> Bold
                        </span>
                        <span>
                          <kbd className="px-1 py-0.5 bg-sidebar rounded text-[10px]">Ctrl+I</kbd> Italic
                        </span>
                        <span>
                          <kbd className="px-1 py-0.5 bg-sidebar rounded text-[10px]">Ctrl+K</kbd> Link
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="min-h-[35vh] px-4 py-4 border border-hairline rounded-md bg-white overflow-y-auto">
                      {body ? (
                        <>
                          <h1 className="font-serif text-[28px] mb-4">{title || 'Untitled'}</h1>
                          <MarkdownPreview content={body} />
                        </>
                      ) : (
                        <div className="text-center text-muted py-10">
                          Nothing to preview yet. Start writing in the Edit tab.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-muted text-[11px] uppercase tracking-wide">
                  <th className="py-2 font-semibold">Title</th>
                  <th className="py-2 font-semibold">Path</th>
                  <th className="py-2 font-semibold">Status</th>
                  <th className="py-2 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((p) => (
                  <tr key={p.path} className="border-t border-hairline">
                    <td className="py-2.5 pr-3 font-medium">{p.title}</td>
                    <td className="py-2.5 pr-3 text-muted font-mono text-[12px]">
                      {p.path}.mdx
                    </td>
                    <td className="py-2.5 pr-3">
                      {p.published === false ? (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-sidebar border border-hairline text-muted">
                          Draft
                        </span>
                      ) : (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-brand-50 text-brand-700">
                          Published
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        onClick={() => {
                          onClose();
                          router.push(`/${p.path}`);
                          setTimeout(() => {
                            window.dispatchEvent(
                              new CustomEvent('open-editor', {
                                detail: { kind: 'edit', path: p.path },
                              })
                            );
                          }, 100);
                        }}
                        className="px-2 py-1 text-[12px] rounded hover:bg-black/[0.04] text-brand"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => remove(p.path)}
                        className="px-2 py-1 text-[12px] rounded hover:bg-red-50 text-red-600"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {pages.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-muted">
                      No pages yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {error && (
          <div className="mx-5 mb-2 text-[12px] text-red-600 flex items-center gap-1">
            <Icons.IconAlertCircle size={13} stroke={1.75} />
            {error}
          </div>
        )}
        {toast && (
          <div className="mx-5 mb-2 text-[12px] text-emerald-700 flex items-center gap-1">
            <Icons.IconCheck size={13} stroke={1.75} />
            {toast}
          </div>
        )}

        <footer className="flex items-center justify-between gap-2 px-5 py-3 border-t border-hairline">
          <div className="text-[11px] text-muted">
            {mode.kind !== 'manage'
              ? 'Saving commits to GitHub. Vercel redeploys automatically.'
              : 'Page history available in the GitHub repo.'}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="px-3 py-1.5 rounded-md text-[13px] text-muted hover:bg-black/[0.04]"
            >
              Close
            </button>
            {mode.kind !== 'manage' && (
              <button
                onClick={save}
                disabled={saving || !title || !body}
                className="px-4 py-1.5 rounded-md bg-brand text-white text-[13px] font-medium hover:bg-brand-600 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save & commit'}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
