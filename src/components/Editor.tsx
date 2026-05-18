'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as Icons from '@tabler/icons-react';
import type { IconProps } from '@tabler/icons-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  clearStoredToken,
  getStoredToken,
  setStoredToken,
  getEditorName,
  setEditorName,
} from './AuthGate';
import { PAGE_TEMPLATES, type PageTemplate } from '@/lib/templates';
import AIAssistant, { type AIApplyPayload } from './AIAssistant';
import DiffReview from './DiffReview';

// Section info from API
interface SectionInfo {
  id: string;
  label: string;
  icon?: string;
  order: number;
  depth: number;
  parent?: string;
}

export type EditorMode =
  | { kind: 'edit'; path: string }
  | { kind: 'new'; defaultSection?: string; prefill?: { title?: string; body?: string; icon?: string; section?: string } }
  | { kind: 'manage' }
  | { kind: 'import' };

// Interface for files being imported
interface ImportFile {
  id: string;
  filename: string;
  title: string;
  icon: string;
  order: number;
  content: string;
  slug: string;
  status: 'pending' | 'importing' | 'done' | 'error';
  error?: string;
}

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

interface EditHistoryEntry {
  name: string;
  date: string;
  summary?: string;
}

function buildFrontmatter(opts: {
  title: string;
  section: string;
  icon: string;
  published: boolean;
  updatedBy?: string;
  editHistory?: EditHistoryEntry[];
}): string {
  const lines = [
    '---',
    `title: "${opts.title.replace(/"/g, '\\"')}"`,
    `section: ${opts.section}`,
    `icon: ${opts.icon || 'file'}`,
    `updatedAt: "${todayHuman()}"`,
    `published: ${opts.published}`,
  ];

  if (opts.updatedBy) {
    lines.push(`updatedBy: "${opts.updatedBy}"`);
  }

  if (opts.editHistory && opts.editHistory.length > 0) {
    lines.push('editHistory:');
    // Keep only last 10 entries
    const recentHistory = opts.editHistory.slice(0, 10);
    for (const entry of recentHistory) {
      lines.push(`  - name: "${entry.name}"`);
      lines.push(`    date: "${entry.date}"`);
      if (entry.summary) {
        lines.push(`    summary: "${entry.summary.replace(/"/g, '\\"')}"`);
      }
    }
  }

  lines.push('---', '');
  return lines.join('\n');
}

function parseFrontmatter(raw: string): {
  fm: Record<string, string | boolean>;
  body: string;
  editHistory: EditHistoryEntry[];
} {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: raw, editHistory: [] };
  const fm: Record<string, string | boolean> = {};
  const editHistory: EditHistoryEntry[] = [];

  const lines = m[1].split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Check for editHistory array
    if (line.trim() === 'editHistory:') {
      i++;
      // Parse array entries
      while (i < lines.length && lines[i].startsWith('  ')) {
        const nameLine = lines[i];
        const nameMatch = nameLine.match(/^\s+-\s*name:\s*"?([^"]*)"?\s*$/);
        if (nameMatch) {
          const entry: EditHistoryEntry = { name: nameMatch[1], date: '' };
          i++;
          // Parse date and optional summary
          while (i < lines.length && lines[i].startsWith('    ') && !lines[i].includes('- name:')) {
            const fieldLine = lines[i];
            const dateMatch = fieldLine.match(/^\s+date:\s*"?([^"]*)"?\s*$/);
            const summaryMatch = fieldLine.match(/^\s+summary:\s*"?([^"]*)"?\s*$/);
            if (dateMatch) entry.date = dateMatch[1];
            if (summaryMatch) entry.summary = summaryMatch[1];
            i++;
          }
          if (entry.date) editHistory.push(entry);
          continue;
        }
        i++;
      }
      continue;
    }

    const idx = line.indexOf(':');
    if (idx === -1) {
      i++;
      continue;
    }
    const key = line.slice(0, idx).trim();
    let val: string | boolean = line.slice(idx + 1).trim();
    if (typeof val === 'string') {
      val = val.replace(/^"(.*)"$/, '$1');
      if (val === 'true') val = true;
      else if (val === 'false') val = false;
    }
    fm[key] = val;
    i++;
  }
  return { fm, body: m[2], editHistory };
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
        className="px-2 py-1.5 rounded hover:bg-brand-50 hover:text-brand transition-colors flex items-center gap-1.5 text-[12px] font-medium"
      >
        <Icons.IconInfoCircle size={15} stroke={1.75} />
        Callout
        <Icons.IconChevronDown size={11} stroke={2} />
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

// Parse MDX component props
function parseComponentProps(tag: string): Record<string, string> {
  const props: Record<string, string> = {};
  const regex = /(\w+)=(?:"([^"]*)"|{([^}]*)}|'([^']*)')/g;
  let match;
  while ((match = regex.exec(tag)) !== null) {
    props[match[1]] = match[2] || match[3] || match[4] || '';
  }
  return props;
}

// Preview components that approximate the real MDX components
function PreviewCallout({ type, title, children }: { type?: string; title?: string; children: string }) {
  const styles: Record<string, { bg: string; border: string; icon: string }> = {
    info: { bg: '#F4F3FB', border: '#534AB7', icon: 'info-circle' },
    warning: { bg: '#FEF7EC', border: '#D58A1A', icon: 'alert-triangle' },
    success: { bg: '#EDF8F2', border: '#1A8A4A', icon: 'circle-check' },
    tip: { bg: '#EEF6FB', border: '#1E6E9E', icon: 'bulb' },
  };
  const s = styles[type || 'info'] || styles.info;
  const IconComponent = getIconComponent(s.icon);

  return (
    <div
      className="my-4 rounded-lg border-l-4 px-4 py-3 flex gap-3"
      style={{ background: s.bg, borderColor: s.border }}
    >
      <IconComponent size={18} stroke={1.75} style={{ color: s.border }} className="shrink-0 mt-0.5" />
      <div className="text-[14px] leading-relaxed">
        {title && <div className="font-semibold mb-1">{title}</div>}
        <div>{children}</div>
      </div>
    </div>
  );
}

function PreviewLinkCard({ href, title, description, icon }: { href?: string; title?: string; description?: string; icon?: string }) {
  const IconComponent = getIconComponent(icon || 'link');
  return (
    <div className="block border border-gray-200 rounded-lg p-3.5 my-2 bg-white">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-md bg-brand-50 text-brand grid place-items-center shrink-0">
          <IconComponent size={16} stroke={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="font-semibold text-[14px] text-ink">{title || href || 'Link'}</div>
            {href?.startsWith('http') && <Icons.IconExternalLink size={12} stroke={1.75} className="text-muted" />}
          </div>
          {description && <div className="text-[13px] text-muted mt-0.5">{description}</div>}
        </div>
      </div>
    </div>
  );
}

function PreviewPersonRow({ name, role, email, slack }: { name?: string; role?: string; email?: string; slack?: string }) {
  const initials = (name || 'UN')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-200 last:border-b-0">
      <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 grid place-items-center font-semibold text-[12px]">
        {initials}
      </div>
      <div className="flex-1">
        <div className="font-semibold text-[14px]">{name || 'Name'}</div>
        <div className="text-[12px] text-muted">{role || 'Role'}</div>
      </div>
      <div className="flex items-center gap-3 text-[12px] text-muted">
        {email && <span>{email}</span>}
        {slack && <span className="text-brand">@{slack}</span>}
      </div>
    </div>
  );
}

function getIconComponent(name: string) {
  const key = 'Icon' + name.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  return (Icons as unknown as Record<string, React.ComponentType<IconProps>>)[key] || Icons.IconFile;
}

// Preview component for rendering markdown with proper styling
function MarkdownPreview({ content, title }: { content: string; title: string }) {
  // Process MDX components into renderable elements
  const processedContent = useMemo(() => {
    const elements: React.ReactNode[] = [];
    let remaining = content;
    let key = 0;

    // Process content line by line, extracting MDX components
    while (remaining.length > 0) {
      // Check for Callout
      const calloutMatch = remaining.match(/^([\s\S]*?)<Callout([^>]*)>([\s\S]*?)<\/Callout>/);
      if (calloutMatch) {
        if (calloutMatch[1]) {
          elements.push(
            <ReactMarkdown key={key++} remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {calloutMatch[1]}
            </ReactMarkdown>
          );
        }
        const props = parseComponentProps(calloutMatch[2]);
        elements.push(
          <PreviewCallout key={key++} type={props.type} title={props.title}>
            {calloutMatch[3].trim()}
          </PreviewCallout>
        );
        remaining = remaining.slice(calloutMatch[0].length);
        continue;
      }

      // Check for LinkCard
      const linkCardMatch = remaining.match(/^([\s\S]*?)<LinkCard([^/]*)\/?>/);
      if (linkCardMatch) {
        if (linkCardMatch[1]) {
          elements.push(
            <ReactMarkdown key={key++} remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {linkCardMatch[1]}
            </ReactMarkdown>
          );
        }
        const props = parseComponentProps(linkCardMatch[2]);
        elements.push(
          <PreviewLinkCard key={key++} href={props.href} title={props.title} description={props.description} icon={props.icon} />
        );
        remaining = remaining.slice(linkCardMatch[0].length);
        continue;
      }

      // Check for PersonRow
      const personMatch = remaining.match(/^([\s\S]*?)<PersonRow([^/]*)\/?>/);
      if (personMatch) {
        if (personMatch[1]) {
          elements.push(
            <ReactMarkdown key={key++} remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {personMatch[1]}
            </ReactMarkdown>
          );
        }
        const props = parseComponentProps(personMatch[2]);
        elements.push(
          <PreviewPersonRow key={key++} name={props.name} role={props.role} email={props.email} slack={props.slack} />
        );
        remaining = remaining.slice(personMatch[0].length);
        continue;
      }

      // No more MDX components, render rest as markdown
      elements.push(
        <ReactMarkdown key={key++} remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {remaining}
        </ReactMarkdown>
      );
      break;
    }

    return elements;
  }, [content]);

  return (
    <div className="prose max-w-none">
      <h1 className="font-serif text-[32px] leading-[1.15] mb-4">{title}</h1>
      {processedContent}
    </div>
  );
}

// Custom components for ReactMarkdown to match actual page styling
const markdownComponents = {
  h2: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="font-serif text-[24px] mt-8 mb-4 text-ink" {...props}>{children}</h2>
  ),
  h3: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="font-semibold text-[18px] mt-6 mb-3 text-ink" {...props}>{children}</h3>
  ),
  table: ({ children, ...props }: React.HTMLAttributes<HTMLTableElement>) => (
    <div className="overflow-x-auto my-4">
      <table className="min-w-full border-collapse border border-gray-200 text-[14px]" {...props}>{children}</table>
    </div>
  ),
  th: ({ children, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
    <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-left font-semibold" {...props}>{children}</th>
  ),
  td: ({ children, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
    <td className="border border-gray-200 px-3 py-2" {...props}>{children}</td>
  ),
  ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="list-disc pl-6 my-3 space-y-1" {...props}>{children}</ul>
  ),
  ol: ({ children, ...props }: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="list-decimal pl-6 my-3 space-y-1" {...props}>{children}</ol>
  ),
  li: ({ children, ...props }: React.HTMLAttributes<HTMLLIElement>) => (
    <li className="text-[15px]" {...props}>{children}</li>
  ),
  p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="my-3 text-[15px] leading-relaxed" {...props}>{children}</p>
  ),
  a: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a className="text-brand hover:underline" href={href} {...props}>{children}</a>
  ),
  strong: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-semibold" {...props}>{children}</strong>
  ),
  code: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
    <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[13px] font-mono" {...props}>{children}</code>
  ),
};

// Sortable section row for drag-and-drop reordering
function SortableSectionRow({
  section,
  isEditing,
  editingSectionData,
  setEditingSectionData,
  savingSectionId,
  onStartEdit,
  onCancelEdit,
  onSave,
  sections,
  getIconComponent,
}: {
  section: SectionInfo;
  isEditing: boolean;
  editingSectionData: { label: string; icon: string; order: number; parent: string } | null;
  setEditingSectionData: React.Dispatch<React.SetStateAction<{ label: string; icon: string; order: number; parent: string } | null>>;
  savingSectionId: string | null;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  sections: SectionInfo[];
  getIconComponent: (name: string) => React.ComponentType<IconProps>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const IconComponent = section.icon ? getIconComponent(section.icon) : Icons.IconFolder;

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-t border-hairline ${isDragging ? 'bg-brand-50' : ''}`}
    >
      <td className="py-2.5 pr-3 w-8">
        <button
          {...attributes}
          {...listeners}
          className="p-1 cursor-grab active:cursor-grabbing text-muted hover:text-ink"
          title="Drag to reorder"
        >
          <Icons.IconGripVertical size={16} stroke={1.5} />
        </button>
      </td>
      <td className="py-2.5 pr-3" style={{ paddingLeft: isEditing ? 0 : section.depth * 20 }}>
        <span className="flex items-center gap-2">
          <IconComponent size={14} stroke={1.75} className="text-muted shrink-0" />
          {isEditing ? (
            <>
              <input
                type="text"
                value={editingSectionData?.label ?? section.label}
                onChange={(e) => setEditingSectionData(prev => prev ? { ...prev, label: e.target.value } : null)}
                className="flex-1 px-2 py-1 text-[13px] border border-hairline rounded"
              />
              <select
                value={editingSectionData?.parent ?? ''}
                onChange={(e) => setEditingSectionData(prev => prev ? { ...prev, parent: e.target.value } : null)}
                className="px-2 py-1 text-[12px] border border-hairline rounded bg-white"
              >
                <option value="">Top level</option>
                {sections
                  .filter(sec => sec.depth === 0 && sec.id !== section.id && !sec.id.startsWith(section.id + '/'))
                  .map(sec => (
                    <option key={sec.id} value={sec.id}>
                      Under: {sec.label}
                    </option>
                  ))}
              </select>
            </>
          ) : (
            <span className="font-medium">{section.label}</span>
          )}
          {!isEditing && section.parent && (
            <span className="text-[10px] text-muted bg-sidebar px-1.5 py-0.5 rounded">
              nested
            </span>
          )}
        </span>
      </td>
      <td className="py-2.5 pr-3">
        {isEditing ? (
          <input
            type="text"
            value={editingSectionData?.icon ?? section.icon ?? 'folder'}
            onChange={(e) => setEditingSectionData(prev => prev ? { ...prev, icon: e.target.value } : null)}
            className="w-24 px-2 py-1 text-[13px] border border-hairline rounded"
            placeholder="folder"
          />
        ) : (
          <span className="text-muted font-mono text-[11px]">{section.icon || 'folder'}</span>
        )}
      </td>
      <td className="py-2.5 text-right">
        {isEditing ? (
          <span className="flex items-center justify-end gap-1">
            <button
              onClick={onCancelEdit}
              className="px-2 py-1 text-[12px] rounded hover:bg-black/[0.04] text-muted"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={savingSectionId === section.id}
              className="px-2 py-1 text-[12px] rounded bg-brand text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {savingSectionId === section.id ? 'Saving...' : 'Save'}
            </button>
          </span>
        ) : (
          <button
            onClick={onStartEdit}
            className="px-2 py-1 text-[12px] rounded hover:bg-black/[0.04] text-brand"
          >
            Edit
          </button>
        )}
      </td>
    </tr>
  );
}

// Page type for drag-and-drop
interface PageInfo {
  title: string;
  path: string;
  section: string;
  published?: boolean;
  order?: number;
}

// Sortable page row for drag-and-drop reordering within sections
function SortablePageRow({
  page,
  depth,
  onEdit,
  onDelete,
}: {
  page: PageInfo;
  depth: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: page.path });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-t border-hairline ${isDragging ? 'bg-brand-50' : ''}`}
    >
      <td className="py-2.5 pr-2 w-8" style={{ paddingLeft: 8 + depth * 16 }}>
        <button
          {...attributes}
          {...listeners}
          className="p-1 cursor-grab active:cursor-grabbing text-muted hover:text-ink"
          title="Drag to reorder"
        >
          <Icons.IconGripVertical size={14} stroke={1.5} />
        </button>
      </td>
      <td className="py-2.5 pr-3 font-medium">
        {page.title}
      </td>
      <td className="py-2.5 pr-3 text-muted font-mono text-[12px]">
        {page.path}.mdx
      </td>
      <td className="py-2.5 pr-3">
        {page.published === false ? (
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
          onClick={onEdit}
          className="px-2 py-1 text-[12px] rounded hover:bg-black/[0.04] text-brand"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          className="px-2 py-1 text-[12px] rounded hover:bg-red-50 text-red-600"
        >
          Delete
        </button>
      </td>
    </tr>
  );
}

export default function Editor({
  mode,
  onClose,
  initialPages,
}: {
  mode: EditorMode;
  onClose: () => void;
  initialPages?: Array<{ title: string; path: string; section: string; published?: boolean; order?: number }>;
}) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prefill = mode.kind === 'new' ? mode.prefill : undefined;
  const [title, setTitle] = useState(prefill?.title ?? '');
  const [section, setSection] = useState<string>(
    mode.kind === 'new' ? (prefill?.section ?? mode.defaultSection ?? 'overview') : 'overview'
  );
  const [icon, setIcon] = useState(prefill?.icon ?? 'file');
  const [published, setPublished] = useState(true);
  const [body, setBody] = useState(prefill?.body ?? '');
  const [loading, setLoading] = useState(mode.kind === 'edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pages, setPages] = useState(initialPages ?? []);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [initialValues, setInitialValues] = useState({ title: '', body: '', icon: 'file' });
  const [draftRestored, setDraftRestored] = useState(false);
  const [sections, setSections] = useState<SectionInfo[]>([]);
  const [showNewSection, setShowNewSection] = useState(false);
  const [newSectionId, setNewSectionId] = useState('');
  const [newSectionLabel, setNewSectionLabel] = useState('');
  const [newSectionIcon, setNewSectionIcon] = useState('folder');
  const [newSectionParent, setNewSectionParent] = useState('');
  const [creatingSectionLoading, setCreatingSectionLoading] = useState(false);

  // New page/section creation
  const [createType, setCreateType] = useState<'page' | 'section'>('page');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('blank');
  const [slugEditable, setSlugEditable] = useState(false);
  const [customSlug, setCustomSlug] = useState('');

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Import mode state
  const [importFiles, setImportFiles] = useState<ImportFile[]>([]);
  const [importSection, setImportSection] = useState<string>('overview');
  const [importPaths, setImportPaths] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });

  // Manage mode state
  const [manageTab, setManageTab] = useState<'pages' | 'sections'>('pages');
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionData, setEditingSectionData] = useState<{ label: string; icon: string; order: number; parent: string } | null>(null);
  const [savingSectionId, setSavingSectionId] = useState<string | null>(null);

  // Pending order changes (not yet committed)
  const [pendingPageOrders, setPendingPageOrders] = useState<Map<string, number>>(new Map());
  const [pendingSectionOrders, setPendingSectionOrders] = useState<Map<string, number>>(new Map());
  const [savingOrders, setSavingOrders] = useState(false);

  const hasPendingChanges = pendingPageOrders.size > 0 || pendingSectionOrders.size > 0;

  // Editor name for tracking who made changes
  const [editorName, setEditorNameState] = useState<string>('');
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [existingHistory, setExistingHistory] = useState<Array<{ name: string; date: string; summary?: string }>>([]);
  const [editSummary, setEditSummary] = useState<string>('');
  const [summaryMissing, setSummaryMissing] = useState(false);

  // AI assistant
  const [showAI, setShowAI] = useState(false);
  const [isAIGenerated, setIsAIGenerated] = useState(!!prefill?.body);
  const [aiApplyFlash, setAiApplyFlash] = useState(false);
  const [showDiffReview, setShowDiffReview] = useState(false);
  const [originalBodyForDiff, setOriginalBodyForDiff] = useState('');
  const [originalTitleForDiff, setOriginalTitleForDiff] = useState('');

  // Load editor name from localStorage on mount
  // Lock background scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const storedName = getEditorName();
    if (storedName) {
      setEditorNameState(storedName);
    } else {
      setShowNamePrompt(true);
    }
  }, []);

  // Fetch sections on mount
  useEffect(() => {
    async function fetchSections() {
      try {
        const res = await fetch('/api/sections');
        const data = await res.json();
        if (data.sections) {
          setSections(data.sections);
        }
      } catch (err) {
        console.error('Failed to fetch sections:', err);
      }
    }
    fetchSections();
  }, []);

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
        const { fm, body, editHistory } = parseFrontmatter(json.raw);
        const loadedTitle = String(fm.title ?? '');
        const loadedBody = body.replace(/^\n+/, '');
        const loadedIcon = String(fm.icon ?? 'file');

        setTitle(loadedTitle);
        setSection(String(fm.section ?? 'overview'));
        setIcon(loadedIcon);
        setPublished(fm.published !== false);
        setBody(loadedBody);
        setInitialValues({ title: loadedTitle, body: loadedBody, icon: loadedIcon });
        setExistingHistory(editHistory);
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
    const slug = customSlug || slugify(title || 'untitled');
    return `${section}/${slug}`;
  }, [mode, title, section, customSlug]);

  // Group and sort pages by section for Manage view
  const groupedPages = useMemo(() => {
    // Create a map of section ID -> section info for quick lookup
    const sectionMap = new Map(sections.map(s => [s.id, s]));

    // Group pages by section
    const grouped: Record<string, typeof pages> = {};
    for (const page of pages) {
      if (!grouped[page.section]) {
        grouped[page.section] = [];
      }
      grouped[page.section].push(page);
    }

    // Sort pages within each group by order (then by title as tiebreaker)
    for (const sectionId of Object.keys(grouped)) {
      grouped[sectionId].sort((a, b) => {
        const orderA = a.order ?? 999;
        const orderB = b.order ?? 999;
        if (orderA !== orderB) return orderA - orderB;
        return a.title.localeCompare(b.title);
      });
    }

    // Get ordered section IDs based on sections array (which is already hierarchically sorted)
    const orderedSectionIds = sections.map(s => s.id).filter(id => grouped[id]);

    // Add any sections that have pages but aren't in the sections list (edge case)
    for (const sectionId of Object.keys(grouped)) {
      if (!orderedSectionIds.includes(sectionId)) {
        orderedSectionIds.push(sectionId);
      }
    }

    return orderedSectionIds.map(sectionId => ({
      sectionId,
      sectionInfo: sectionMap.get(sectionId),
      pages: grouped[sectionId],
    }));
  }, [pages, sections]);

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
    if (!editorName.trim()) {
      setShowNamePrompt(true);
      setError('Please enter your name before saving');
      return;
    }
    if (!editSummary.trim()) {
      setSummaryMissing(true);
      setError('Please add a brief summary of your changes');
      return;
    }

    setSummaryMissing(false);
    setError(null);
    setSaving(true);
    try {
      const token = await ensureToken();
      if (!token) {
        setSaving(false);
        return;
      }

      // Build new edit history with current edit at the top
      const newHistoryEntry: EditHistoryEntry = {
        name: editorName.trim(),
        date: todayHuman(),
        summary: editSummary.trim() || undefined,
      };
      const newHistory = [newHistoryEntry, ...existingHistory].slice(0, 10);

      const fm = buildFrontmatter({
        title,
        section,
        icon,
        published,
        updatedBy: editorName.trim(),
        editHistory: newHistory,
      });
      const content = fm + '\n' + body.trim() + '\n';
      const path = targetPath;
      const commitMessage = `wiki: update ${path} by ${editorName.trim()}`;
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', token, path, content, message: commitMessage }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 401) clearStoredToken();
        throw new Error(json.error || 'Save failed');
      }

      // Update existing history for subsequent saves
      setExistingHistory(newHistory);
      setEditSummary('');

      // Clear draft on successful save
      localStorage.removeItem(getDraftKey(mode));
      setHasUnsavedChanges(false);
      setInitialValues({ title, body, icon });
      setIsAIGenerated(false);
      setOriginalBodyForDiff('');

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

  // Handle delete for current page (edit mode)
  async function handleDeleteCurrentPage() {
    if (mode.kind !== 'edit') return;
    setDeleting(true);
    setError(null);
    try {
      const token = await ensureToken();
      if (!token) {
        setDeleting(false);
        return;
      }
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', token, path: mode.path }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 401) clearStoredToken();
        throw new Error(json.error || 'Delete failed');
      }
      // Clear draft
      localStorage.removeItem(getDraftKey(mode));
      setToast('Page deleted. Redirecting...');
      setShowDeleteConfirm(false);
      setTimeout(() => {
        router.push('/');
        onClose();
      }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  // Save section changes
  async function saveSection(sectionId: string, data: { label: string; icon: string; order: number; parent: string }) {
    setSavingSectionId(sectionId);
    setError(null);
    try {
      const token = await ensureToken();
      if (!token) {
        setSavingSectionId(null);
        return;
      }

      // Find current section to check if parent changed
      const currentSection = sections.find(s => s.id === sectionId);
      const currentParent = currentSection?.parent || '';
      const newParent = data.parent;
      const parentChanged = currentParent !== newParent;

      if (parentChanged) {
        // Moving section - this is a more complex operation
        const res = await fetch('/api/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'move-section',
            token,
            sectionId,
            newParent: newParent || null, // null means top-level
            label: data.label,
            icon: data.icon,
            order: data.order,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          if (res.status === 401) clearStoredToken();
          throw new Error(json.error || 'Move failed');
        }
        // Refresh sections from server after move
        const sectionsRes = await fetch('/api/sections');
        const sectionsJson = await sectionsRes.json();
        if (sectionsJson.sections) {
          setSections(sectionsJson.sections);
        }
        setToast(`Moved section "${data.label}" successfully`);
      } else {
        // Just updating metadata
        const res = await fetch('/api/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update-section',
            token,
            sectionId,
            label: data.label,
            icon: data.icon,
            order: data.order,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          if (res.status === 401) clearStoredToken();
          throw new Error(json.error || 'Update failed');
        }
        // Update local sections state
        setSections(prev => prev.map(s =>
          s.id === sectionId ? { ...s, label: data.label, icon: data.icon, order: data.order } : s
        ));
        setToast(`Updated section "${data.label}"`);
      }

      setEditingSectionId(null);
      setEditingSectionData(null);
      setTimeout(() => router.refresh(), 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSavingSectionId(null);
    }
  }

  // Sensors for drag-and-drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle section reorder via drag-and-drop
  function handleSectionDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = sections.findIndex(s => s.id === active.id);
    const newIndex = sections.findIndex(s => s.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // Update local state
    const newSections = arrayMove(sections, oldIndex, newIndex);
    setSections(newSections.map((s, idx) => ({ ...s, order: (idx + 1) * 10 })));

    // Track pending changes
    setPendingSectionOrders(prev => {
      const next = new Map(prev);
      newSections.forEach((s, idx) => {
        next.set(s.id, (idx + 1) * 10);
      });
      return next;
    });
  }

  // Handle page reorder via drag-and-drop within a section
  function handlePageDragEnd(sectionId: string, event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    // Get pages in this section
    const sectionPages = pages.filter(p => p.section === sectionId);
    const oldIndex = sectionPages.findIndex(p => p.path === active.id);
    const newIndex = sectionPages.findIndex(p => p.path === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // Reorder pages in this section
    const reorderedSectionPages = arrayMove(sectionPages, oldIndex, newIndex);

    // Update local state
    setPages(prev => {
      const otherPages = prev.filter(p => p.section !== sectionId);
      const updatedSectionPages = reorderedSectionPages.map((p, idx) => ({
        ...p,
        order: (idx + 1) * 10
      }));
      return [...otherPages, ...updatedSectionPages];
    });

    // Track pending changes
    setPendingPageOrders(prev => {
      const next = new Map(prev);
      reorderedSectionPages.forEach((p, idx) => {
        next.set(p.path, (idx + 1) * 10);
      });
      return next;
    });
  }

  // Save all pending order changes
  async function savePendingOrders() {
    if (!hasPendingChanges) return;

    setSavingOrders(true);
    setError(null);

    try {
      const token = await ensureToken();
      if (!token) {
        setSavingOrders(false);
        return;
      }

      // Save page orders if any
      if (pendingPageOrders.size > 0) {
        const pageUpdates = Array.from(pendingPageOrders.entries()).map(([path, order]) => ({
          path,
          order,
        }));

        const res = await fetch('/api/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'batch-reorder-pages',
            token,
            updates: pageUpdates,
          }),
        });

        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error || 'Failed to save page order');
        }
      }

      // Save section orders if any
      if (pendingSectionOrders.size > 0) {
        const sectionUpdates = Array.from(pendingSectionOrders.entries()).map(([sectionId, order]) => ({
          sectionId,
          order,
        }));

        const res = await fetch('/api/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'batch-reorder-sections',
            token,
            updates: sectionUpdates,
          }),
        });

        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error || 'Failed to save section order');
        }
      }

      // Clear pending changes
      setPendingPageOrders(new Map());
      setPendingSectionOrders(new Map());
      setToast('Order changes saved');
      setTimeout(() => router.refresh(), 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save order changes');
    } finally {
      setSavingOrders(false);
    }
  }

  // Discard pending order changes
  async function discardPendingOrders() {
    setPendingPageOrders(new Map());
    setPendingSectionOrders(new Map());

    // Refetch to restore original order
    try {
      const [pagesRes, sectionsRes] = await Promise.all([
        fetch('/api/pages'),
        fetch('/api/sections'),
      ]);
      const pagesJson = await pagesRes.json();
      const sectionsJson = await sectionsRes.json();
      if (pagesJson.pages) setPages(pagesJson.pages);
      if (sectionsJson.sections) setSections(sectionsJson.sections);
    } catch {
      // Ignore errors
    }
  }

  // Get icon component helper
  function getIconComponentForTemplate(name: string) {
    const key = 'Icon' + name.split('-').map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
    return (Icons as unknown as Record<string, React.ComponentType<IconProps>>)[key] || Icons.IconFile;
  }

  // Import helpers
  function parseImportedFile(filename: string, content: string): Omit<ImportFile, 'status' | 'error'> {
    // Check if file already has frontmatter
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    let title = '';
    let bodyContent = content;

    if (fmMatch) {
      // Has frontmatter - extract title from it
      const fmLines = fmMatch[1].split('\n');
      for (const line of fmLines) {
        const titleMatch = line.match(/^title:\s*["']?(.+?)["']?\s*$/);
        if (titleMatch) {
          title = titleMatch[1];
          break;
        }
      }
      bodyContent = fmMatch[2];
    }

    // If no title from frontmatter, try to get from first heading
    if (!title) {
      const headingMatch = content.match(/^#\s+(.+)$/m);
      if (headingMatch) {
        title = headingMatch[1].replace(/[*_`]/g, ''); // Remove markdown formatting
        // Remove the heading from body since we'll use frontmatter title
        bodyContent = bodyContent.replace(/^#\s+.+\n*/m, '');
      }
    }

    // If still no title, use filename
    if (!title) {
      title = filename.replace(/\.mdx?$/, '').replace(/[-_]/g, ' ');
      title = title.charAt(0).toUpperCase() + title.slice(1);
    }

    // Generate slug from filename
    const slug = filename.replace(/\.mdx?$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');

    return {
      id: Math.random().toString(36).slice(2),
      filename,
      title,
      icon: 'file',
      order: 1,
      content: bodyContent.trim(),
      slug,
    };
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;

    const newFiles: ImportFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.name.endsWith('.mdx') && !file.name.endsWith('.md')) continue;

      const content = await file.text();
      const parsed = parseImportedFile(file.name, content);
      newFiles.push({
        ...parsed,
        order: importFiles.length + i + 1,
        status: 'pending',
      });
    }

    setImportFiles(prev => [...prev, ...newFiles]);
    e.target.value = ''; // Reset input
  }

  function updateImportFile(id: string, updates: Partial<ImportFile>) {
    setImportFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  }

  function removeImportFile(id: string) {
    setImportFiles(prev => prev.filter(f => f.id !== id));
  }

  async function handleBulkImport() {
    if (importFiles.length === 0) return;

    // Check for editor name
    if (!editorName.trim()) {
      setShowNamePrompt(true);
      setError('Please enter your name before importing');
      return;
    }

    setImportLoading(true);
    setImportProgress({ current: 0, total: importFiles.length });
    setError(null);

    const token = await ensureToken();
    if (!token) {
      setImportLoading(false);
      return;
    }

    const importerName = editorName.trim();
    let successCount = 0;
    for (let i = 0; i < importFiles.length; i++) {
      const file = importFiles[i];
      if (file.status === 'done') continue;

      updateImportFile(file.id, { status: 'importing' });
      setImportProgress({ current: i + 1, total: importFiles.length });

      try {
        const fm = buildFrontmatter({
          title: file.title,
          section: importSection,
          icon: file.icon,
          published: true,
          updatedBy: importerName,
          editHistory: [{ name: importerName, date: todayHuman() }],
        });
        // Add order to frontmatter
        const fmWithOrder = fm.replace('published: true', `published: true\norder: ${file.order}`);
        const fullContent = fmWithOrder + '\n' + file.content + '\n';
        const path = `${importSection}/${file.slug}`;
        const commitMessage = `wiki: import ${path} by ${importerName}`;

        const res = await fetch('/api/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'save', token, path, content: fullContent, message: commitMessage }),
        });

        const json = await res.json();
        if (!res.ok) {
          if (res.status === 401) {
            clearStoredToken();
            throw new Error('Session expired. Please try again.');
          }
          throw new Error(json.error || 'Save failed');
        }

        updateImportFile(file.id, { status: 'done' });
        successCount++;
      } catch (err) {
        updateImportFile(file.id, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Import failed',
        });
      }
    }

    setImportLoading(false);
    if (successCount === importFiles.length) {
      setToast(`Successfully imported ${successCount} pages. Vercel will redeploy shortly.`);
      setTimeout(() => {
        router.refresh();
      }, 1500);
    } else if (successCount > 0) {
      setToast(`Imported ${successCount} of ${importFiles.length} pages. Check errors below.`);
    }
  }

  function handleAIApply(payload: AIApplyPayload) {
    // Capture current content as the baseline for the pre-commit diff
    setOriginalBodyForDiff(body);
    setOriginalTitleForDiff(title);
    setBody(payload.body);
    if (payload.title) setTitle(payload.title);
    if (payload.icon) setIcon(payload.icon);
    if (payload.section && mode.kind === 'new') setSection(payload.section);
    setIsAIGenerated(true);
    setActiveTab('edit');
    // Brief green flash on the textarea to indicate the apply landed
    setAiApplyFlash(true);
    setTimeout(() => setAiApplyFlash(false), 1400);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-3 py-6">
      <div
        className={`w-full max-h-[92vh] bg-white rounded-card shadow-xl border border-hairline flex overflow-hidden transition-all ${
          showAI ? 'max-w-[1380px] flex-row' : 'max-w-[1000px] flex-col'
        }`}
      >
        {/* Main editor column */}
        <div className={`flex flex-col overflow-hidden ${showAI ? 'flex-1 min-w-0 max-h-[92vh]' : 'w-full max-h-[92vh]'}`}>
        <header className="flex items-center justify-between px-5 py-3 border-b border-hairline">
          <div className="flex items-center gap-2">
            {mode.kind === 'edit' && <Icons.IconPencil size={16} stroke={1.75} className="text-brand" />}
            {mode.kind === 'new' && <Icons.IconPlus size={16} stroke={1.75} className="text-brand" />}
            {mode.kind === 'import' && <Icons.IconUpload size={16} stroke={1.75} className="text-brand" />}
            {mode.kind === 'manage' && <Icons.IconSettings size={16} stroke={1.75} className="text-brand" />}
            <h2 className="font-serif text-[20px]">
              {mode.kind === 'edit'
                ? 'Edit page'
                : mode.kind === 'new'
                ? (createType === 'page' ? 'New page' : 'New section')
                : mode.kind === 'import'
                ? 'Import pages'
                : 'Manage pages'}
            </h2>
            {hasUnsavedChanges && mode.kind !== 'manage' && mode.kind !== 'import' && (
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

        {/* Editor name prompt - shows once if name not set */}
        {showNamePrompt && mode.kind !== 'manage' && (
          <div className="px-5 py-3 bg-brand-50 border-b border-brand-100 flex items-center gap-3">
            <Icons.IconUser size={16} stroke={1.75} className="text-brand shrink-0" />
            <span className="text-[13px] text-brand-800">Your name for edit history:</span>
            <input
              type="text"
              value={editorName}
              onChange={(e) => setEditorNameState(e.target.value)}
              placeholder="e.g., Ali Mirza"
              className="flex-1 max-w-[200px] px-2 py-1 text-[13px] border border-brand-200 rounded bg-white focus:outline-none focus:border-brand-400"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && editorName.trim()) {
                  setEditorName(editorName.trim());
                  setShowNamePrompt(false);
                }
              }}
            />
            <button
              onClick={() => {
                if (editorName.trim()) {
                  setEditorName(editorName.trim());
                  setShowNamePrompt(false);
                }
              }}
              disabled={!editorName.trim()}
              className="px-3 py-1 text-[12px] font-medium bg-brand text-white rounded hover:bg-brand-600 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        )}

        {/* Show current editor name (subtle, when set) */}
        {!showNamePrompt && editorName && mode.kind !== 'manage' && (
          <div className="px-5 py-1.5 bg-sidebar border-b border-hairline flex items-center gap-2 text-[11px] text-muted">
            <Icons.IconUser size={12} stroke={1.75} />
            <span>Editing as <strong className="font-medium text-ink">{editorName}</strong></span>
            <button
              onClick={() => setShowNamePrompt(true)}
              className="text-brand hover:underline ml-1"
            >
              change
            </button>
          </div>
        )}

        {/* Import mode UI */}
        {mode.kind === 'import' ? (
          <div className="flex-1 overflow-y-auto overscroll-contain p-5">
            <div className="space-y-5">
              {/* Section selector */}
              <div className="flex items-center gap-4 flex-wrap">
                <label className="flex items-center gap-2">
                  <span className="text-[12px] font-semibold text-muted uppercase tracking-wide">Import to section:</span>
                  <select
                    value={importSection}
                    onChange={(e) => setImportSection(e.target.value)}
                    className="px-3 py-1.5 border border-hairline rounded-md text-[14px] focus:outline-none focus:border-brand-300"
                  >
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.depth > 0 ? '└ '.repeat(s.depth) : ''}{s.label}
                      </option>
                    ))}
                  </select>
                </label>

                {/* File picker */}
                <label className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-md cursor-pointer hover:bg-brand-600 transition-colors">
                  <Icons.IconUpload size={16} stroke={1.75} />
                  <span className="text-[13px] font-medium">Select MDX files</span>
                  <input
                    type="file"
                    accept=".mdx,.md"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
              </div>

              {/* File list */}
              {importFiles.length === 0 ? (
                <div className="border-2 border-dashed border-hairline rounded-lg p-10 text-center">
                  <Icons.IconFileUpload size={48} stroke={1} className="mx-auto mb-3 text-muted" />
                  <p className="text-[14px] text-muted mb-2">
                    Select MDX files to import
                  </p>
                  <p className="text-[12px] text-muted">
                    Files will be parsed automatically. Titles are extracted from headings or filenames.
                  </p>
                </div>
              ) : (
                <div className="border border-hairline rounded-lg overflow-hidden">
                  <table className="w-full text-[13px]">
                    <thead className="bg-sidebar">
                      <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                        <th className="py-2 px-3 font-semibold">Title</th>
                        <th className="py-2 px-3 font-semibold w-24">Icon</th>
                        <th className="py-2 px-3 font-semibold w-20">Order</th>
                        <th className="py-2 px-3 font-semibold w-32">Slug</th>
                        <th className="py-2 px-3 font-semibold w-24">Status</th>
                        <th className="py-2 px-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {importFiles.map((file, idx) => {
                        const FileIcon = getIconComponentForTemplate(file.icon);
                        return (
                          <tr key={file.id} className="border-t border-hairline">
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={file.title}
                                onChange={(e) => updateImportFile(file.id, { title: e.target.value })}
                                className="w-full px-2 py-1 border border-hairline rounded text-[13px] focus:outline-none focus:border-brand-300"
                                disabled={file.status !== 'pending'}
                              />
                            </td>
                            <td className="py-2 px-3">
                              <select
                                value={file.icon}
                                onChange={(e) => updateImportFile(file.id, { icon: e.target.value })}
                                className="w-full px-2 py-1 border border-hairline rounded text-[13px] focus:outline-none focus:border-brand-300"
                                disabled={file.status !== 'pending'}
                              >
                                {POPULAR_ICONS.slice(0, 20).map((icon) => (
                                  <option key={icon} value={icon}>{icon}</option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="number"
                                value={file.order}
                                onChange={(e) => updateImportFile(file.id, { order: parseInt(e.target.value) || 1 })}
                                className="w-full px-2 py-1 border border-hairline rounded text-[13px] focus:outline-none focus:border-brand-300"
                                min={1}
                                disabled={file.status !== 'pending'}
                              />
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={file.slug}
                                onChange={(e) => updateImportFile(file.id, { slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                                className="w-full px-2 py-1 border border-hairline rounded text-[13px] font-mono focus:outline-none focus:border-brand-300"
                                disabled={file.status !== 'pending'}
                              />
                            </td>
                            <td className="py-2 px-3">
                              {file.status === 'pending' && (
                                <span className="text-[11px] px-1.5 py-0.5 rounded bg-sidebar text-muted">Pending</span>
                              )}
                              {file.status === 'importing' && (
                                <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">Importing...</span>
                              )}
                              {file.status === 'done' && (
                                <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">Done</span>
                              )}
                              {file.status === 'error' && (
                                <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-50 text-red-700" title={file.error}>Error</span>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              {file.status === 'pending' && (
                                <button
                                  onClick={() => removeImportFile(file.id)}
                                  className="p-1 rounded hover:bg-red-50 text-red-500"
                                >
                                  <Icons.IconX size={14} stroke={1.75} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Import progress */}
              {importLoading && (
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-sidebar rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand transition-all duration-300"
                      style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                    />
                  </div>
                  <span className="text-[12px] text-muted">
                    {importProgress.current} / {importProgress.total}
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : mode.kind !== 'manage' ? (
          <div className="flex-1 overflow-y-auto overscroll-contain p-5 grid gap-4">
            {loading ? (
              <div className="text-center text-muted py-10">Loading…</div>
            ) : (
              <>
                {/* Page/Section toggle for new mode */}
                {mode.kind === 'new' && (
                  <div className="flex items-center gap-1 bg-sidebar p-1 rounded-md w-fit">
                    <button
                      type="button"
                      onClick={() => setCreateType('page')}
                      className={`px-4 py-1.5 text-[13px] rounded transition-colors flex items-center gap-1.5 ${
                        createType === 'page' ? 'bg-white shadow-sm font-medium' : 'text-muted hover:text-ink'
                      }`}
                    >
                      <Icons.IconFile size={14} stroke={1.75} />
                      New Page
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateType('section')}
                      className={`px-4 py-1.5 text-[13px] rounded transition-colors flex items-center gap-1.5 ${
                        createType === 'section' ? 'bg-white shadow-sm font-medium' : 'text-muted hover:text-ink'
                      }`}
                    >
                      <Icons.IconFolder size={14} stroke={1.75} />
                      New Section
                    </button>
                  </div>
                )}

                {/* Section creation form (inline) */}
                {mode.kind === 'new' && createType === 'section' ? (
                  <div className="space-y-4 max-w-lg">
                    <label className="block">
                      <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">
                        Section name
                      </span>
                      <input
                        type="text"
                        value={newSectionLabel}
                        onChange={(e) => {
                          setNewSectionLabel(e.target.value);
                          setNewSectionId(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
                        }}
                        placeholder="e.g. Meeting Notes"
                        className="mt-1 w-full px-3 py-2 border border-hairline rounded-md text-[14px] focus:outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
                      />
                    </label>

                    <label className="block">
                      <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">
                        Section ID (URL path)
                      </span>
                      <input
                        type="text"
                        value={newSectionParent ? `${newSectionParent}/${newSectionId}` : newSectionId}
                        onChange={(e) => {
                          const val = e.target.value;
                          const parts = val.split('/');
                          if (parts.length > 1) {
                            setNewSectionParent(parts.slice(0, -1).join('/'));
                            setNewSectionId(parts[parts.length - 1]);
                          } else {
                            setNewSectionParent('');
                            setNewSectionId(val);
                          }
                        }}
                        placeholder="e.g. meeting-notes or operations/meetings"
                        className="mt-1 w-full px-3 py-2 border border-hairline rounded-md text-[14px] font-mono focus:outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
                      />
                      <p className="mt-1 text-[11px] text-muted">
                        Use a slash to create a subsection (e.g., operations/meetings)
                      </p>
                    </label>

                    <label className="block">
                      <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">
                        Parent section (optional)
                      </span>
                      <select
                        value={newSectionParent}
                        onChange={(e) => setNewSectionParent(e.target.value)}
                        className="mt-1 w-full px-3 py-2 border border-hairline rounded-md text-[14px] focus:outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
                      >
                        <option value="">None (top-level section)</option>
                        {sections.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.depth > 0 ? '└ '.repeat(s.depth) : ''}{s.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">
                        Icon
                      </span>
                      <div className="mt-1">
                        <IconPicker value={newSectionIcon} onChange={setNewSectionIcon} />
                      </div>
                    </label>

                    <div className="pt-2 text-[12px] text-muted">
                      Creates <code className="bg-sidebar px-1 py-0.5 rounded font-mono">content/{newSectionParent ? `${newSectionParent}/${newSectionId}` : newSectionId}/_section.json</code>
                    </div>
                  </div>
                ) : (
                  <>
                {/* Template picker for new pages */}
                {mode.kind === 'new' && createType === 'page' && (
                  <div className="space-y-2">
                    <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">
                      Choose a template
                    </span>
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                      {PAGE_TEMPLATES.map((t) => {
                        const TemplateIcon = getIconComponentForTemplate(t.icon);
                        const isSelected = selectedTemplate === t.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              setSelectedTemplate(t.id);
                              setBody(t.body);
                              setIcon(t.defaultIcon);
                            }}
                            className={`flex flex-col items-center gap-1.5 p-3 rounded-md border transition-colors ${
                              isSelected
                                ? 'border-brand bg-brand-50 text-brand'
                                : 'border-hairline hover:border-brand-200 hover:bg-brand-50/30'
                            }`}
                          >
                            <TemplateIcon size={20} stroke={1.5} />
                            <span className="text-[11px] font-medium text-center leading-tight">{t.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

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
                    <div className="flex gap-2">
                      <select
                        value={section}
                        onChange={(e) => {
                          if (e.target.value === '__new__') {
                            setShowNewSection(true);
                          } else {
                            setSection(e.target.value);
                          }
                        }}
                        disabled={mode.kind === 'edit'}
                        className="flex-1 px-3 py-2 border border-hairline rounded-md text-[14px] focus:outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100 disabled:bg-sidebar disabled:text-muted"
                      >
                        {sections.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.depth > 0 ? '└ '.repeat(s.depth) : ''}{s.label}
                          </option>
                        ))}
                        {mode.kind !== 'edit' && (
                          <option value="__new__">+ New section...</option>
                        )}
                      </select>
                    </div>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">
                      Icon
                    </span>
                    <IconPicker value={icon} onChange={setIcon} />
                  </label>
                </div>

                <div className="flex items-center gap-4 flex-wrap">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={published}
                      onChange={(e) => setPublished(e.target.checked)}
                      className="accent-brand"
                    />
                    <span className="text-[13px]">Published (shown in nav)</span>
                  </label>

                  {/* Slug preview with edit capability */}
                  <div className="flex items-center gap-2 text-[12px] text-muted">
                    <span>Slug:</span>
                    {mode.kind === 'new' && slugEditable ? (
                      <input
                        value={customSlug}
                        onChange={(e) => setCustomSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, ''))}
                        className="px-2 py-1 border border-hairline rounded text-[12px] font-mono w-32 focus:outline-none focus:border-brand-300"
                        placeholder={slugify(title || 'untitled')}
                      />
                    ) : (
                      <code className="bg-sidebar px-1.5 py-0.5 rounded font-mono">{customSlug || slugify(title || 'untitled')}</code>
                    )}
                    {mode.kind === 'new' && (
                      <button
                        type="button"
                        onClick={() => {
                          if (slugEditable) {
                            setSlugEditable(false);
                          } else {
                            setSlugEditable(true);
                            setCustomSlug(customSlug || slugify(title || 'untitled'));
                          }
                        }}
                        className="text-brand hover:underline text-[11px]"
                      >
                        {slugEditable ? 'Auto' : 'Edit'}
                      </button>
                    )}
                  </div>

                  <div className="text-[12px] text-muted">
                    → <code className="bg-sidebar px-1 py-0.5 rounded">content/{targetPath}.mdx</code>
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
                    <div className="flex items-center gap-3">
                      {activeTab === 'edit' && !showAI && (
                        <div className="text-[10px] text-muted">
                          Auto-saving draft locally
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowAI((v) => !v)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors border ${
                          showAI
                            ? 'bg-brand text-white border-brand'
                            : 'bg-white border-hairline hover:border-brand-200 hover:bg-brand-50 hover:text-brand text-muted'
                        }`}
                        title="Open AI Assistant"
                      >
                        <Icons.IconSparkles size={14} stroke={1.75} />
                        AI
                      </button>
                    </div>
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
                          <button
                            type="button"
                            onClick={formatActions.linkCard}
                            title="Insert link card"
                            className="px-2 py-1.5 rounded hover:bg-brand-50 hover:text-brand transition-colors flex items-center gap-1.5 text-[12px] font-medium"
                          >
                            <Icons.IconExternalLink size={15} stroke={1.75} />
                            Link card
                          </button>
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
                        className={`font-mono text-[13px] leading-relaxed min-h-[35vh] px-3 py-3 border rounded-b-md rounded-t-none focus:outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100 resize-y transition-colors duration-700 ${
                          aiApplyFlash
                            ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-100'
                            : 'border-hairline bg-[#FBFAF7]'
                        }`}
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
                        <MarkdownPreview content={body} title={title || 'Untitled'} />
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
              </>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Tab buttons for Pages/Sections */}
            <div className="flex gap-1 px-5 pt-4 pb-2 border-b border-hairline">
              <button
                onClick={() => setManageTab('pages')}
                className={`px-3 py-1.5 text-[13px] font-medium rounded-md transition-colors ${
                  manageTab === 'pages'
                    ? 'bg-brand text-white'
                    : 'text-muted hover:bg-black/[0.04]'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Icons.IconFile size={14} stroke={1.75} />
                  Pages
                </span>
              </button>
              <button
                onClick={() => setManageTab('sections')}
                className={`px-3 py-1.5 text-[13px] font-medium rounded-md transition-colors ${
                  manageTab === 'sections'
                    ? 'bg-brand text-white'
                    : 'text-muted hover:bg-black/[0.04]'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Icons.IconFolder size={14} stroke={1.75} />
                  Sections
                </span>
              </button>
            </div>

            {/* Pages tab content */}
            {manageTab === 'pages' && (
              <div className="flex-1 overflow-y-auto overscroll-contain p-5">
                <p className="text-[12px] text-muted mb-4">
                  Drag pages to reorder them within their section.
                </p>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-muted text-[11px] uppercase tracking-wide">
                      <th className="py-2 font-semibold w-8"></th>
                      <th className="py-2 font-semibold">Title</th>
                      <th className="py-2 font-semibold">Path</th>
                      <th className="py-2 font-semibold">Status</th>
                      <th className="py-2 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedPages.map((group) => {
                      const sectionLabel = group.sectionInfo?.label || group.sectionId.split('/').pop() || group.sectionId;
                      const depth = group.sectionInfo?.depth ?? 0;
                      const IconComponent = group.sectionInfo?.icon
                        ? getIconComponent(group.sectionInfo.icon)
                        : Icons.IconFolder;

                      return (
                        <React.Fragment key={group.sectionId}>
                          {/* Section header row */}
                          <tr className="bg-sidebar/50">
                            <td
                              colSpan={5}
                              className="py-2.5 px-2 font-semibold text-[12px]"
                              style={{ paddingLeft: 8 + depth * 16 }}
                            >
                              <span className="flex items-center gap-2">
                                {IconComponent && <IconComponent size={14} stroke={1.75} className="text-muted" />}
                                {sectionLabel}
                                <span className="text-muted font-normal">
                                  ({group.pages.length} {group.pages.length === 1 ? 'page' : 'pages'})
                                </span>
                              </span>
                            </td>
                          </tr>
                          {/* Pages in this section - with drag and drop */}
                          <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={(event) => handlePageDragEnd(group.sectionId, event)}
                          >
                            <SortableContext
                              items={group.pages.map(p => p.path)}
                              strategy={verticalListSortingStrategy}
                            >
                              {group.pages.map((p) => (
                                <SortablePageRow
                                  key={p.path}
                                  page={p}
                                  depth={depth}
                                  onEdit={() => {
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
                                  onDelete={() => remove(p.path)}
                                />
                              ))}
                            </SortableContext>
                          </DndContext>
                        </React.Fragment>
                      );
                    })}
                    {pages.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-muted">
                          No pages yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Sections tab content */}
            {manageTab === 'sections' && (
              <div className="flex-1 overflow-y-auto overscroll-contain p-5">
                <p className="text-[12px] text-muted mb-4">
                  Drag sections to reorder them in the sidebar. Click Edit to change label, icon, or move to a different parent.
                </p>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleSectionDragEnd}
                >
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="text-left text-muted text-[11px] uppercase tracking-wide">
                        <th className="py-2 font-semibold w-8"></th>
                        <th className="py-2 font-semibold">Section</th>
                        <th className="py-2 font-semibold w-28">Icon</th>
                        <th className="py-2 font-semibold text-right w-32">Actions</th>
                      </tr>
                    </thead>
                    <SortableContext
                      items={sections.map(s => s.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <tbody>
                        {sections.map((s) => (
                          <SortableSectionRow
                            key={s.id}
                            section={s}
                            isEditing={editingSectionId === s.id}
                            editingSectionData={editingSectionData}
                            setEditingSectionData={setEditingSectionData}
                            savingSectionId={savingSectionId}
                            onStartEdit={() => {
                              setEditingSectionId(s.id);
                              setEditingSectionData({ label: s.label, icon: s.icon || 'folder', order: s.order, parent: s.parent || '' });
                            }}
                            onCancelEdit={() => {
                              setEditingSectionId(null);
                              setEditingSectionData(null);
                            }}
                            onSave={() => editingSectionData && saveSection(s.id, editingSectionData)}
                            sections={sections}
                            getIconComponent={getIconComponent}
                          />
                        ))}
                        {sections.length === 0 && (
                          <tr>
                            <td colSpan={4} className="py-6 text-center text-muted">
                              No sections yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </SortableContext>
                  </table>
                </DndContext>
              </div>
            )}
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
          <div className="flex items-center gap-3">
            {/* Delete button for edit mode */}
            {mode.kind === 'edit' && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] text-red-600 hover:bg-red-50 transition-colors"
              >
                <Icons.IconTrash size={14} stroke={1.75} />
                Delete page
              </button>
            )}
            <div className="text-[11px] text-muted">
              {mode.kind === 'import'
                ? `${importFiles.length} files ready to import`
                : mode.kind === 'manage' && hasPendingChanges
                ? `${pendingPageOrders.size + pendingSectionOrders.size} unsaved order changes`
                : mode.kind !== 'manage'
                ? 'Saving commits to GitHub. Vercel redeploys automatically.'
                : 'Drag items to reorder, then click Save.'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Discard button for manage mode with pending changes */}
            {mode.kind === 'manage' && hasPendingChanges && (
              <button
                onClick={discardPendingOrders}
                className="px-3 py-1.5 rounded-md text-[13px] text-muted hover:bg-black/[0.04]"
              >
                Discard
              </button>
            )}
            {/* Save order changes button for manage mode */}
            {mode.kind === 'manage' && hasPendingChanges && (
              <button
                onClick={savePendingOrders}
                disabled={savingOrders}
                className="px-4 py-1.5 rounded-md bg-brand text-white text-[13px] font-medium hover:bg-brand-600 disabled:opacity-50 flex items-center gap-2"
              >
                <Icons.IconDeviceFloppy size={14} stroke={1.75} />
                {savingOrders ? 'Saving...' : 'Save changes'}
              </button>
            )}
            {/* Close button - hide when there are pending changes in manage mode */}
            {!(mode.kind === 'manage' && hasPendingChanges) && (
              <button
                onClick={handleClose}
                className="px-3 py-1.5 rounded-md text-[13px] text-muted hover:bg-black/[0.04]"
              >
                Close
              </button>
            )}
            {/* Import button */}
            {mode.kind === 'import' && (
              <button
                onClick={handleBulkImport}
                disabled={importLoading || importFiles.length === 0 || importFiles.every(f => f.status === 'done')}
                className="px-4 py-1.5 rounded-md bg-brand text-white text-[13px] font-medium hover:bg-brand-600 disabled:opacity-50 flex items-center gap-2"
              >
                <Icons.IconUpload size={14} stroke={1.75} />
                {importLoading ? 'Importing...' : `Import ${importFiles.filter(f => f.status === 'pending').length} pages`}
              </button>
            )}
            {/* Edit summary input for page editing */}
            {mode.kind !== 'manage' && mode.kind !== 'import' && !(mode.kind === 'new' && createType === 'section') && (
              <input
                type="text"
                value={editSummary}
                onChange={(e) => { setEditSummary(e.target.value); setSummaryMissing(false); }}
                placeholder="What changed? (required)"
                className={`w-52 px-2 py-1.5 text-[12px] border rounded-md focus:outline-none transition-colors ${
                  summaryMissing
                    ? 'border-red-400 bg-red-50 focus:border-red-400 ring-1 ring-red-200'
                    : 'border-hairline focus:border-brand-300'
                }`}
              />
            )}
            {/* Save button for page editing */}
            {mode.kind !== 'manage' && mode.kind !== 'import' && !(mode.kind === 'new' && createType === 'section') && (
              <button
                onClick={async () => {
                  if (isAIGenerated) {
                    // For edit mode, fetch the live original to diff against
                    if (mode.kind === 'edit' && !originalBodyForDiff) {
                      try {
                        const res = await fetch(`/api/raw?path=${mode.path}`);
                        const data = await res.json();
                        if (data.content) {
                          const m = (data.content as string).match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
                          setOriginalBodyForDiff(m ? m[1].trim() : (data.content as string));
                          setOriginalTitleForDiff(title);
                        }
                      } catch { /* fall through to review with empty original */ }
                    }
                    setShowDiffReview(true);
                  } else {
                    save();
                  }
                }}
                disabled={saving || !title || !body || !editSummary.trim() || !editorName.trim()}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-white text-[13px] font-medium disabled:opacity-50 transition-colors ${
                  isAIGenerated ? 'bg-amber-500 hover:bg-amber-600' : 'bg-brand hover:bg-brand-600'
                }`}
              >
                {isAIGenerated && !saving && <Icons.IconSparkles size={13} stroke={1.75} />}
                {saving ? 'Saving…' : isAIGenerated ? 'Review & commit' : 'Save & commit'}
              </button>
            )}
            {/* Create section button */}
            {mode.kind === 'new' && createType === 'section' && (
              <button
                onClick={async () => {
                  if (!newSectionLabel || !newSectionId) {
                    setError('Section name and ID are required');
                    return;
                  }

                  const fullSectionId = newSectionParent ? `${newSectionParent}/${newSectionId}` : newSectionId;

                  setCreatingSectionLoading(true);
                  setError(null);

                  try {
                    const token = await ensureToken();
                    if (!token) {
                      setCreatingSectionLoading(false);
                      return;
                    }

                    const res = await fetch('/api/save', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        action: 'create-section',
                        token,
                        sectionId: fullSectionId,
                        label: newSectionLabel,
                        icon: newSectionIcon,
                      }),
                    });

                    const data = await res.json();
                    if (!res.ok) {
                      if (res.status === 401) clearStoredToken();
                      setError(data.error || 'Failed to create section');
                      return;
                    }

                    // Add the new section to the list
                    setSections(prev => [...prev, {
                      id: fullSectionId,
                      label: newSectionLabel,
                      icon: newSectionIcon,
                      order: 999,
                      depth: fullSectionId.split('/').length - 1,
                      parent: newSectionParent || undefined,
                    }]);
                    setToast('Section created! It will appear after deployment.');
                    // Reset form and switch to page creation
                    setNewSectionId('');
                    setNewSectionLabel('');
                    setNewSectionIcon('folder');
                    setNewSectionParent('');
                    setSection(fullSectionId);
                    setCreateType('page');
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to create section');
                  } finally {
                    setCreatingSectionLoading(false);
                  }
                }}
                disabled={creatingSectionLoading || !newSectionLabel || !newSectionId}
                className="px-4 py-1.5 rounded-md bg-brand text-white text-[13px] font-medium hover:bg-brand-600 disabled:opacity-50"
              >
                {creatingSectionLoading ? 'Creating...' : 'Create section'}
              </button>
            )}
          </div>
        </footer>
        </div>{/* end main editor column */}

        {/* AI Assistant panel */}
        {showAI && (
          <div className="w-[380px] shrink-0 flex flex-col overflow-hidden border-l border-hairline max-h-[92vh]">
            <AIAssistant
              token={getStoredToken() ?? ''}
              sections={sections.map((s) => ({ id: s.id, label: s.label }))}
              currentPageContext={
                (mode.kind === 'edit' || mode.kind === 'new') && title
                  ? { title, section, body }
                  : undefined
              }
              onApply={handleAIApply}
              onClose={() => setShowAI(false)}
            />
          </div>
        )}
      </div>

      {/* AI Diff Review Modal */}
      {showDiffReview && (
        <DiffReview
          title={title}
          oldTitle={mode.kind === 'edit' ? originalTitleForDiff || title : undefined}
          oldBody={originalBodyForDiff}
          newBody={body}
          isNew={mode.kind === 'new'}
          onApprove={() => {
            setShowDiffReview(false);
            save();
          }}
          onCancel={() => setShowDiffReview(false)}
        />
      )}

      {/* New Section Modal */}
      {showNewSection && (
        <div className="fixed inset-0 z-[60] bg-black/40 grid place-items-center px-4">
          <div className="w-full max-w-md bg-white rounded-lg shadow-xl border border-hairline p-5">
            <div className="flex items-center gap-2 mb-4">
              <Icons.IconFolderPlus size={20} stroke={1.75} className="text-brand" />
              <h3 className="font-serif text-[20px]">Create new section</h3>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">
                  Section name
                </span>
                <input
                  type="text"
                  value={newSectionLabel}
                  onChange={(e) => {
                    setNewSectionLabel(e.target.value);
                    // Auto-generate ID from label
                    setNewSectionId(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
                  }}
                  placeholder="e.g. Meeting Notes"
                  className="mt-1 w-full px-3 py-2 border border-hairline rounded-md text-[14px] focus:outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
                />
              </label>

              <label className="block">
                <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">
                  Section ID (URL path)
                </span>
                <input
                  type="text"
                  value={newSectionParent ? `${newSectionParent}/${newSectionId}` : newSectionId}
                  onChange={(e) => {
                    const val = e.target.value;
                    const parts = val.split('/');
                    if (parts.length > 1) {
                      setNewSectionParent(parts.slice(0, -1).join('/'));
                      setNewSectionId(parts[parts.length - 1]);
                    } else {
                      setNewSectionParent('');
                      setNewSectionId(val);
                    }
                  }}
                  placeholder="e.g. meeting-notes or operations/meetings"
                  className="mt-1 w-full px-3 py-2 border border-hairline rounded-md text-[14px] font-mono focus:outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
                />
                <p className="mt-1 text-[11px] text-muted">
                  Use a slash to create a subsection (e.g., operations/meetings)
                </p>
              </label>

              <label className="block">
                <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">
                  Parent section (optional)
                </span>
                <select
                  value={newSectionParent}
                  onChange={(e) => setNewSectionParent(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-hairline rounded-md text-[14px] focus:outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
                >
                  <option value="">None (top-level section)</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.depth > 0 ? '└ '.repeat(s.depth) : ''}{s.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">
                  Icon
                </span>
                <div className="mt-1">
                  <IconPicker value={newSectionIcon} onChange={setNewSectionIcon} />
                </div>
              </label>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-[13px] text-red-700">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowNewSection(false);
                  setNewSectionId('');
                  setNewSectionLabel('');
                  setNewSectionIcon('folder');
                  setNewSectionParent('');
                  setError(null);
                }}
                className="px-3 py-1.5 rounded-md text-[13px] text-muted hover:bg-black/[0.04]"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!newSectionLabel || !newSectionId) {
                    setError('Section name and ID are required');
                    return;
                  }

                  const fullSectionId = newSectionParent ? `${newSectionParent}/${newSectionId}` : newSectionId;

                  setCreatingSectionLoading(true);
                  setError(null);

                  try {
                    const token = await ensureToken();
                    if (!token) {
                      setCreatingSectionLoading(false);
                      return;
                    }

                    const res = await fetch('/api/save', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        action: 'create-section',
                        token,
                        sectionId: fullSectionId,
                        label: newSectionLabel,
                        icon: newSectionIcon,
                      }),
                    });

                    const data = await res.json();
                    if (!res.ok) {
                      if (res.status === 401) clearStoredToken();
                      setError(data.error || 'Failed to create section');
                      return;
                    }

                    // Add the new section to the list and select it
                    setSections(prev => [...prev, {
                      id: fullSectionId,
                      label: newSectionLabel,
                      icon: newSectionIcon,
                      order: 999,
                      depth: fullSectionId.split('/').length - 1,
                      parent: newSectionParent || undefined,
                    }]);
                    setSection(fullSectionId);
                    setShowNewSection(false);
                    setNewSectionId('');
                    setNewSectionLabel('');
                    setNewSectionIcon('folder');
                    setNewSectionParent('');
                    setToast('Section created! It will appear after deployment.');
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to create section');
                  } finally {
                    setCreatingSectionLoading(false);
                  }
                }}
                disabled={creatingSectionLoading || !newSectionLabel || !newSectionId}
                className="px-4 py-1.5 rounded-md bg-brand text-white text-[13px] font-medium hover:bg-brand-600 disabled:opacity-50"
              >
                {creatingSectionLoading ? 'Creating...' : 'Create section'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && mode.kind === 'edit' && (
        <div className="fixed inset-0 z-[60] bg-black/40 grid place-items-center px-4">
          <div className="w-full max-w-sm bg-white rounded-lg shadow-xl border border-hairline p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 grid place-items-center">
                <Icons.IconTrash size={20} stroke={1.75} />
              </div>
              <div>
                <h3 className="font-serif text-[18px]">Delete page?</h3>
                <p className="text-[13px] text-muted">This action cannot be undone.</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
              <p className="text-[13px] text-red-800">
                This will permanently delete <code className="bg-red-100 px-1 rounded font-mono">{mode.path}.mdx</code> and commit the deletion to GitHub.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-[13px] text-red-700">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setError(null);
                }}
                disabled={deleting}
                className="px-3 py-1.5 rounded-md text-[13px] text-muted hover:bg-black/[0.04]"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteCurrentPage}
                disabled={deleting}
                className="px-4 py-1.5 rounded-md bg-red-600 text-white text-[13px] font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete page'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
