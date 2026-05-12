'use client';

import { useState } from 'react';
import * as Icons from '@tabler/icons-react';

const STORAGE_KEY = 'mdplus_wiki_token';
const NAME_STORAGE_KEY = 'mdplus_wiki_editor_name';

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(STORAGE_KEY);
}

export function setStoredToken(token: string) {
  sessionStorage.setItem(STORAGE_KEY, token);
}

export function clearStoredToken() {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function getEditorName(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(NAME_STORAGE_KEY);
}

export function setEditorName(name: string) {
  localStorage.setItem(NAME_STORAGE_KEY, name);
}

export function clearEditorName() {
  localStorage.removeItem(NAME_STORAGE_KEY);
}

export default function AuthGate({
  onAuthenticated,
  onCancel,
}: {
  onAuthenticated: (token: string) => void;
  onCancel: () => void;
}) {
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
      if (!res.ok) {
        setError(json.error || 'Authentication failed');
        return;
      }
      setStoredToken(json.token);
      onAuthenticated(json.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-[380px] bg-white rounded-card shadow-xl border border-hairline p-5"
      >
        <div className="flex items-center gap-2 mb-1">
          <Icons.IconLock size={16} stroke={1.75} className="text-brand" />
          <h2 className="font-serif text-[20px]">Editor sign-in</h2>
        </div>
        <p className="text-[13px] text-muted mb-4">
          Enter the shared password to edit the wiki. Session lasts 8 hours.
        </p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Shared password"
          className="w-full px-3 py-2 border border-hairline rounded-md text-[14px] focus:outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
        />
        {error && (
          <div className="mt-2 text-[12px] text-red-600 flex items-center gap-1">
            <Icons.IconAlertCircle size={13} stroke={1.75} />
            {error}
          </div>
        )}
        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md text-[13px] text-muted hover:bg-black/[0.04]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !password}
            className="px-4 py-1.5 rounded-md bg-brand text-white text-[13px] font-medium hover:bg-brand-600 disabled:opacity-50"
          >
            {busy ? 'Checking…' : 'Unlock'}
          </button>
        </div>
      </form>
    </div>
  );
}
