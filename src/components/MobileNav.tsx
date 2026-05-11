'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Icons from '@tabler/icons-react';
import type { NavGroup } from '@/lib/content';

export default function MobileNav({ tree }: { tree: NavGroup[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <div className="md:hidden border-b border-hairline bg-white sticky top-0 z-30">
      <div className="flex items-center justify-between px-4 h-12">
        <Link href="/overview/home" className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-brand text-white grid place-items-center font-serif text-xs">
            M
          </div>
          <span className="font-semibold text-[13px]">MDplus Wiki</span>
        </Link>
        <button
          onClick={() => setOpen((v) => !v)}
          className="p-1.5 rounded-md hover:bg-black/[0.04]"
          aria-label="Toggle navigation"
        >
          {open ? (
            <Icons.IconX size={18} stroke={1.75} />
          ) : (
            <Icons.IconMenu2 size={18} stroke={1.75} />
          )}
        </button>
      </div>
      {open && (
        <nav className="border-t border-hairline px-2 py-2 max-h-[70vh] overflow-y-auto bg-sidebar">
          {tree.map((g) => (
            <div key={g.section} className="mb-3">
              <div className="px-2 pt-2 pb-1 text-[10.5px] font-semibold tracking-[0.08em] uppercase text-muted">
                {g.label}
              </div>
              <ul>
                {g.pages.map((p) => {
                  const href = `/${p.path}`;
                  const active = pathname === href;
                  return (
                    <li key={p.path}>
                      <Link
                        href={href}
                        onClick={() => setOpen(false)}
                        className={[
                          'block px-2 py-1.5 rounded-md text-[13px]',
                          active ? 'bg-brand text-white' : 'text-ink hover:bg-black/[0.04]',
                        ].join(' ')}
                      >
                        {p.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      )}
    </div>
  );
}
