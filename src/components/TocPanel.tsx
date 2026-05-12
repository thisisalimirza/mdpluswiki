'use client';

import { useEffect, useState } from 'react';
import * as Icons from '@tabler/icons-react';

export interface TocItem {
  id: string;
  text: string;
  level: number;
}

export default function TocPanel({
  items,
  onEdit,
  onNew,
  onManage,
  onImport,
}: {
  items: TocItem[];
  onEdit: () => void;
  onNew: () => void;
  onManage: () => void;
  onImport: () => void;
}) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    if (items.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          setActive(visible[0].target.id);
        }
      },
      { rootMargin: '-80px 0px -65% 0px', threshold: [0, 1] }
    );
    items.forEach((i) => {
      const el = document.getElementById(i.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [items]);

  return (
    <aside className="hidden xl:flex xl:flex-col w-[170px] shrink-0 sticky top-0 h-screen border-l border-hairline pl-5 pr-3 py-5">
      <div className="flex flex-col gap-2 mb-5">
        <button
          onClick={onEdit}
          className="flex items-center justify-center gap-1.5 w-full h-8 rounded-md bg-brand text-white text-[12px] font-medium hover:bg-brand-600"
        >
          <Icons.IconPencil size={13} stroke={1.75} />
          Edit page
        </button>
        <button
          onClick={onNew}
          className="flex items-center justify-center gap-1.5 w-full h-8 rounded-md border border-hairline text-[12px] font-medium hover:bg-black/[0.03]"
        >
          <Icons.IconPlus size={13} stroke={1.75} />
          New page
        </button>
        <div className="flex gap-2">
          <button
            onClick={onImport}
            className="flex items-center justify-center gap-1.5 flex-1 h-8 rounded-md text-[12px] font-medium text-muted hover:bg-black/[0.03]"
            title="Import MDX files"
          >
            <Icons.IconUpload size={13} stroke={1.75} />
            Import
          </button>
          <button
            onClick={onManage}
            className="flex items-center justify-center gap-1.5 flex-1 h-8 rounded-md text-[12px] font-medium text-muted hover:bg-black/[0.03]"
          >
            <Icons.IconSettings size={13} stroke={1.75} />
            Manage
          </button>
        </div>
      </div>
      <div className="text-[10.5px] font-semibold tracking-[0.08em] uppercase text-muted mb-2">
        On this page
      </div>
      <nav className="flex-1 overflow-y-auto scrollbar-thin">
        {items.length === 0 && <div className="text-[12px] text-muted">No sections.</div>}
        <ul className="flex flex-col gap-1">
          {items.map((it) => (
            <li key={it.id} style={{ paddingLeft: (it.level - 2) * 10 }}>
              <a
                href={`#${it.id}`}
                className={[
                  'block text-[12.5px] leading-snug py-0.5 transition-colors',
                  active === it.id
                    ? 'text-brand font-medium'
                    : 'text-muted hover:text-ink',
                ].join(' ')}
              >
                {it.text}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
