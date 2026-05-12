'use client';

import { useState } from 'react';
import * as Icons from '@tabler/icons-react';

interface EditHistoryEntry {
  name: string;
  date: string;
}

export default function EditHistory({ history }: { history?: EditHistoryEntry[] }) {
  const [expanded, setExpanded] = useState(false);

  if (!history || history.length === 0) return null;

  return (
    <div className="mt-8 pt-6 border-t border-hairline">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-[12px] text-muted hover:text-ink transition-colors"
      >
        <Icons.IconHistory size={14} stroke={1.75} />
        <span>Edit history ({history.length} {history.length === 1 ? 'edit' : 'edits'})</span>
        <Icons.IconChevronDown
          size={14}
          stroke={1.75}
          className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="mt-3 pl-5 border-l-2 border-hairline space-y-2">
          {history.map((entry, idx) => (
            <div key={idx} className="text-[12px]">
              <span className="font-medium text-ink">{entry.name}</span>
              <span className="text-muted"> — {entry.date}</span>
              {idx === 0 && (
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-brand-50 text-brand-700">
                  latest
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
