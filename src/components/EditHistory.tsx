'use client';

import { useState } from 'react';
import * as Icons from '@tabler/icons-react';

interface EditHistoryEntry {
  name: string;
  date: string;
  summary?: string;
}

export default function EditHistory({ history }: { history?: EditHistoryEntry[] }) {
  const [expanded, setExpanded] = useState(false);

  if (!history || history.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-[11px] text-muted hover:text-ink transition-colors"
      >
        <Icons.IconHistory size={12} stroke={1.75} />
        <span>View edit history ({history.length})</span>
        <Icons.IconChevronDown
          size={12}
          stroke={1.75}
          className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="mt-2 pl-4 border-l-2 border-hairline space-y-1.5">
          {history.map((entry, idx) => (
            <div key={idx} className="text-[11px]">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-medium text-ink">{entry.name}</span>
                <span className="text-muted">— {entry.date}</span>
                {idx === 0 && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-brand-50 text-brand-700">
                    latest
                  </span>
                )}
              </div>
              {entry.summary && (
                <div className="text-muted mt-0.5 italic">"{entry.summary}"</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
