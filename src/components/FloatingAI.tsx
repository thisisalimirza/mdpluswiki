'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as Icons from '@tabler/icons-react';
import AIAssistant, { type AIApplyPayload } from './AIAssistant';
import { getStoredToken, setStoredToken } from './AuthGate';

function useStoredToken() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => { setToken(getStoredToken()); }, []);
  return token;
}

function InlineAuth({ onAuthenticated }: { onAuthenticated: (t: string) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'auth', password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Authentication failed');
      setStoredToken(json.token);
      onAuthenticated(json.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-full items-center justify-center px-6 py-8 gap-5">
      <div className="text-center">
        <div className="w-12 h-12 rounded-xl bg-brand grid place-items-center mx-auto mb-3">
          <Icons.IconSparkles size={24} stroke={1.75} className="text-white" />
        </div>
        <h3 className="font-serif text-[20px] mb-1">AI Assistant</h3>
        <p className="text-[13px] text-muted">
          Enter the wiki password to use the AI assistant.
        </p>
      </div>
      <form onSubmit={submit} className="w-full space-y-3">
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Shared password"
          className="w-full px-3 py-2.5 border border-hairline rounded-lg text-[14px] focus:outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
        />
        {error && (
          <div className="text-[12px] text-red-600 flex items-center gap-1.5">
            <Icons.IconAlertCircle size={13} stroke={1.75} />
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={busy || !password}
          className="w-full py-2.5 rounded-lg bg-brand text-white text-[14px] font-medium hover:bg-brand-600 disabled:opacity-50 transition-colors"
        >
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </div>
  );
}

export default function FloatingAI({ currentPath }: { currentPath: string | null }) {
  const [open, setOpen] = useState(false);
  const storedToken = useStoredToken();
  const [localToken, setLocalToken] = useState<string | null>(null);
  const [sections, setSections] = useState<Array<{ id: string; label: string }>>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  const activeToken = localToken ?? storedToken;

  useEffect(() => {
    fetch('/api/sections')
      .then((r) => r.json())
      .then((d) => {
        if (d.sections) setSections(d.sections.map((s: { id: string; label: string }) => ({ id: s.id, label: s.label })));
      })
      .catch(() => {});
  }, []);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handle(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open]);

  // Prevent background scroll while panel is open (handled by overscroll-contain in AIAssistant)
  // Nothing extra needed here — the panel itself uses overscroll-contain

  function handleApply(payload: AIApplyPayload) {
    window.dispatchEvent(
      new CustomEvent('open-editor', {
        detail: {
          kind: 'new',
          prefill: {
            title: payload.title,
            body: payload.body,
            icon: payload.icon,
            section: payload.section,
          },
        },
      })
    );
    setOpen(false);
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`fixed bottom-6 right-6 z-40 flex items-center gap-2 pl-3.5 pr-4 py-3 rounded-full shadow-lg transition-all duration-200 ${
          open
            ? 'bg-brand-700 text-white'
            : 'bg-brand text-white hover:bg-brand-600 hover:shadow-xl hover:scale-105'
        }`}
        title="AI Assistant"
        aria-label="Open AI Assistant"
      >
        <Icons.IconSparkles size={18} stroke={1.75} />
        <span className="text-[14px] font-medium">AI</span>
      </button>

      {/* Floating panel */}
      {open && (
        <div
          ref={panelRef}
          className="fixed bottom-[5.5rem] right-6 z-40 w-[420px] h-[580px] bg-white rounded-card shadow-2xl border border-hairline flex flex-col overflow-hidden"
          style={{ maxHeight: 'calc(100vh - 7rem)' }}
        >
          {activeToken ? (
            <AIAssistant
              token={activeToken}
              sections={sections ?? []}
              currentPageContext={
                currentPath
                  ? { title: document.title.replace(' — MDplus Leadership Wiki', ''), section: currentPath.split('/')[0], body: '' }
                  : undefined
              }
              onApply={handleApply}
              onClose={() => setOpen(false)}
            />
          ) : (
            <InlineAuth
              onAuthenticated={(t) => {
                setLocalToken(t);
              }}
            />
          )}
        </div>
      )}
    </>
  );
}
