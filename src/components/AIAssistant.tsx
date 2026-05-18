'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as Icons from '@tabler/icons-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

interface WikiContent {
  body: string;
  meta?: { title?: string; icon?: string; section?: string };
}

function extractWikiContent(text: string): WikiContent | null {
  const bodyMatch = text.match(/\[WIKI_CONTENT_START\]([\s\S]*?)\[WIKI_CONTENT_END\]/);
  if (!bodyMatch) return null;
  const metaMatch = text.match(/\[WIKI_META_START\]([\s\S]*?)\[WIKI_META_END\]/);
  let meta: WikiContent['meta'];
  if (metaMatch) {
    try { meta = JSON.parse(metaMatch[1].trim()); } catch {}
  }
  return { body: bodyMatch[1].trim(), meta };
}

function stripMarkers(text: string): string {
  return text
    .replace(/\[WIKI_CONTENT_START\][\s\S]*?\[WIKI_CONTENT_END\]/g, '')
    .replace(/\[WIKI_META_START\][\s\S]*?\[WIKI_META_END\]/g, '')
    .trim();
}

// ── Minimal line-level diff ───────────────────────────────────────────────────

interface DiffLine {
  type: 'add' | 'remove' | 'equal';
  content: string;
}

function lineDiff(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i+1][j+1] + 1 : Math.max(dp[i+1][j], dp[i][j+1]);

  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && a[i] === b[j]) {
      out.push({ type: 'equal', content: a[i++] }); j++;
    } else if (j < n && (i >= m || dp[i][j+1] >= dp[i+1][j])) {
      out.push({ type: 'add', content: b[j++] });
    } else {
      out.push({ type: 'remove', content: a[i++] });
    }
  }
  return out;
}

function collapseDiff(lines: DiffLine[], ctx = 2) {
  const changed = new Set<number>();
  lines.forEach((l, i) => { if (l.type !== 'equal') changed.add(i); });
  const visible = new Set<number>();
  changed.forEach((idx) => {
    for (let k = Math.max(0, idx - ctx); k <= Math.min(lines.length - 1, idx + ctx); k++)
      visible.add(k);
  });
  const result: Array<DiffLine | { type: 'hunk'; count: number }> = [];
  let skip = 0;
  lines.forEach((line, i) => {
    if (visible.has(i)) {
      if (skip > 0) { result.push({ type: 'hunk', count: skip }); skip = 0; }
      result.push(line);
    } else { skip++; }
  });
  if (skip > 0) result.push({ type: 'hunk', count: skip });
  return result;
}

// ── Inline diff panel ─────────────────────────────────────────────────────────

function InlineDiff({
  currentBody,
  newContent,
  onAccept,
  onCancel,
}: {
  currentBody: string;
  newContent: WikiContent;
  onAccept: () => void;
  onCancel: () => void;
}) {
  const isEmpty = !currentBody.trim();
  const diff = isEmpty ? [] : lineDiff(currentBody, newContent.body);
  const collapsed = isEmpty ? [] : collapseDiff(diff);
  const adds = diff.filter((l) => l.type === 'add').length;
  const removes = diff.filter((l) => l.type === 'remove').length;

  return (
    <div className="border border-hairline rounded-lg overflow-hidden bg-white">
      {/* header */}
      <div className="flex items-center justify-between px-3 py-2 bg-sidebar border-b border-hairline">
        <div className="flex items-center gap-2 text-[12px]">
          <Icons.IconGitCompare size={14} stroke={1.75} className="text-muted" />
          {isEmpty ? (
            <span className="text-emerald-700 font-medium">New content · {newContent.body.split('\n').length} lines</span>
          ) : (
            <>
              <span className="text-emerald-700 font-medium">+{adds}</span>
              <span className="text-muted">/</span>
              <span className="text-red-600 font-medium">−{removes}</span>
              <span className="text-muted ml-1">lines changed</span>
            </>
          )}
          {newContent.meta?.title && (
            <span className="text-muted ml-1">· {newContent.meta.title}</span>
          )}
        </div>
        <button onClick={onCancel} className="p-0.5 rounded hover:bg-black/[0.06] text-muted">
          <Icons.IconX size={12} stroke={2} />
        </button>
      </div>

      {/* diff lines */}
      <div className="max-h-[240px] overflow-y-auto overscroll-contain font-mono text-[11px] leading-[1.6]">
        {isEmpty ? (
          // Just show the new content with green background
          newContent.body.split('\n').map((line, i) => (
            <div key={i} className="flex bg-emerald-50">
              <div className="w-5 text-center text-emerald-600 font-bold select-none shrink-0">+</div>
              <pre className="flex-1 px-2 py-px text-emerald-900 whitespace-pre-wrap break-all">{line || ' '}</pre>
            </div>
          ))
        ) : (
          collapsed.map((entry, i) => {
            if ('count' in entry) {
              return (
                <div key={i} className="flex items-center gap-2 px-2 py-0.5 bg-sidebar text-muted text-[10px] border-y border-hairline">
                  <Icons.IconDotsVertical size={10} stroke={1.75} />
                  {entry.count} unchanged
                </div>
              );
            }
            const line = entry as DiffLine;
            return (
              <div
                key={i}
                className={`flex ${
                  line.type === 'add' ? 'bg-emerald-50' :
                  line.type === 'remove' ? 'bg-red-50' : ''
                }`}
              >
                <div className={`w-5 text-center font-bold select-none shrink-0 ${
                  line.type === 'add' ? 'text-emerald-600' :
                  line.type === 'remove' ? 'text-red-500' : 'text-transparent'
                }`}>
                  {line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ' '}
                </div>
                <pre className={`flex-1 px-2 py-px whitespace-pre-wrap break-all ${
                  line.type === 'add' ? 'text-emerald-900' :
                  line.type === 'remove' ? 'text-red-800 opacity-70' : 'text-ink'
                }`}>
                  {line.content || ' '}
                </pre>
              </div>
            );
          })
        )}
      </div>

      {/* actions */}
      <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-hairline bg-sidebar">
        <button
          onClick={onCancel}
          className="px-2.5 py-1 text-[12px] text-muted hover:bg-black/[0.05] rounded-md"
        >
          Cancel
        </button>
        <button
          onClick={onAccept}
          className="flex items-center gap-1.5 px-3 py-1 bg-brand text-white text-[12px] font-medium rounded-md hover:bg-brand-600 transition-colors"
        >
          <Icons.IconCheck size={12} stroke={2} />
          Apply to editor
        </button>
      </div>
    </div>
  );
}

// ── AssistantMessage ──────────────────────────────────────────────────────────

function AssistantMessage({
  message,
  currentBody,
  onApply,
}: {
  message: Message;
  currentBody: string;
  onApply: (content: WikiContent) => void;
}) {
  const [showDiff, setShowDiff] = useState(false);
  const wikiContent = !message.streaming ? extractWikiContent(message.content) : null;
  const displayText = wikiContent ? stripMarkers(message.content) : message.content;
  const hasMarkers = message.content.includes('[WIKI_CONTENT_START]');

  return (
    <div className="flex flex-col gap-2">
      {displayText && (
        <div className="bg-white border border-hairline rounded-lg px-3.5 py-2.5 text-[13px] leading-relaxed prose prose-sm max-w-none">
          {message.streaming ? (
            <span className="whitespace-pre-wrap">{displayText}</span>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayText}</ReactMarkdown>
          )}
          {message.streaming && (
            <span className="inline-block w-1.5 h-4 bg-brand ml-0.5 animate-pulse" />
          )}
        </div>
      )}

      {wikiContent && !showDiff && (
        <div className="border border-brand-200 bg-brand-50 rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-brand-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-brand">
              <Icons.IconFileText size={14} stroke={1.75} />
              <span>Wiki content ready</span>
              {wikiContent.meta?.title && (
                <span className="text-brand-600 font-normal">— {wikiContent.meta.title}</span>
              )}
            </div>
            <button
              onClick={() => setShowDiff(true)}
              className="flex items-center gap-1.5 px-3 py-1 bg-brand text-white text-[12px] font-medium rounded-md hover:bg-brand-600 transition-colors"
            >
              <Icons.IconGitCompare size={12} stroke={1.75} />
              Review &amp; apply
            </button>
          </div>
          <pre className="px-3 py-2.5 text-[11px] leading-relaxed text-brand-800 overflow-x-auto max-h-[160px] overflow-y-auto font-mono whitespace-pre-wrap">
            {wikiContent.body}
          </pre>
        </div>
      )}

      {wikiContent && showDiff && (
        <InlineDiff
          currentBody={currentBody}
          newContent={wikiContent}
          onAccept={() => {
            onApply(wikiContent);
            setShowDiff(false);
          }}
          onCancel={() => setShowDiff(false)}
        />
      )}

      {message.streaming && hasMarkers && !wikiContent && (
        <div className="border border-brand-200 bg-brand-50 rounded-lg px-3 py-2 text-[12px] text-brand flex items-center gap-2">
          <Icons.IconLoader size={14} stroke={1.75} className="animate-spin" />
          Generating wiki content...
        </div>
      )}
    </div>
  );
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface AIApplyPayload {
  body: string;
  title?: string;
  icon?: string;
  section?: string;
}

// ── Main AIAssistant component ────────────────────────────────────────────────

export default function AIAssistant({
  token,
  sections,
  currentPageContext,
  onApply,
  onClose,
}: {
  token: string;
  sections: Array<{ id: string; label: string }>;
  currentPageContext?: { title: string; section: string; body: string };
  onApply: (payload: AIApplyPayload) => void;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [slackUrl, setSlackUrl] = useState('');
  const [showSlack, setShowSlack] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track the most recently applied body so diffs stay accurate
  const [appliedBody, setAppliedBody] = useState(currentPageContext?.body ?? '');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Keep appliedBody in sync when currentPageContext changes externally
  useEffect(() => {
    setAppliedBody(currentPageContext?.body ?? '');
  }, [currentPageContext?.body]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setError(null);

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text };
    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '', streaming: true };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setLoading(true);

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    history.push({ role: 'user', content: text });

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          token,
          messages: history,
          sections,
          currentPageContext,
          slackThreadUrl: showSlack && slackUrl.trim() ? slackUrl.trim() : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let accumulated = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) => m.id === assistantId ? { ...m, content: accumulated } : m)
        );
      }

      setMessages((prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, streaming: false } : m)
      );

      if (showSlack && slackUrl.trim()) {
        setSlackUrl('');
        setShowSlack(false);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [input, loading, messages, token, sections, currentPageContext, showSlack, slackUrl]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const handleApply = (content: WikiContent) => {
    // Update the local baseline so next AI response diffs against what's now in the editor
    setAppliedBody(content.body);
    onApply({
      body: content.body,
      title: content.meta?.title,
      icon: content.meta?.icon,
      section: content.meta?.section,
    });
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setLoading(false);
    setMessages((prev) => prev.map((m) => m.streaming ? { ...m, streaming: false } : m));
  };

  const SUGGESTIONS = [
    'Create a page about our onboarding process',
    'Write a community overview page',
    'Draft meeting notes template',
    'Summarize the Slack thread above into a wiki page',
  ];

  return (
    <div className="flex flex-col h-full bg-sidebar border-l border-hairline">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-hairline bg-white shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-brand grid place-items-center">
            <Icons.IconSparkles size={14} stroke={1.75} className="text-white" />
          </div>
          <span className="text-[14px] font-semibold">AI Assistant</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSlack((v) => !v)}
            title="Import from Slack thread"
            className={`p-1.5 rounded-md transition-colors ${showSlack ? 'bg-brand-50 text-brand' : 'hover:bg-black/[0.04] text-muted'}`}
          >
            <Icons.IconBrandSlack size={16} stroke={1.75} />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-black/[0.04] text-muted">
            <Icons.IconX size={16} stroke={1.75} />
          </button>
        </div>
      </div>

      {/* Slack URL input */}
      {showSlack && (
        <div className="px-3 py-2.5 border-b border-hairline bg-white shrink-0">
          <label className="text-[11px] font-semibold text-muted uppercase tracking-wide block mb-1.5">
            Slack thread URL
          </label>
          <input
            type="url"
            value={slackUrl}
            onChange={(e) => setSlackUrl(e.target.value)}
            placeholder="https://mdplus.slack.com/archives/…"
            className="w-full px-2.5 py-1.5 text-[12px] border border-hairline rounded-md focus:outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100 bg-sidebar"
          />
          <p className="text-[11px] text-muted mt-1">
            Paste a Slack thread link — Claude will read it and help you turn it into a wiki page.
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-[13px] text-muted text-center pt-4">
              Describe what you want to add or update — Claude will draft it for you in proper wiki format.
            </p>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => { setInput(s); inputRef.current?.focus(); }}
                  className="w-full text-left px-3 py-2 text-[12px] rounded-md border border-hairline bg-white hover:border-brand-200 hover:bg-brand-50 transition-colors text-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) =>
          msg.role === 'user' ? (
            <div key={msg.id} className="flex justify-end">
              <div className="max-w-[85%] bg-brand text-white rounded-lg px-3.5 py-2.5 text-[13px] leading-relaxed">
                {msg.content}
              </div>
            </div>
          ) : (
            <div key={msg.id}>
              <AssistantMessage
                message={msg}
                currentBody={appliedBody}
                onApply={handleApply}
              />
            </div>
          )
        )}

        {error && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-[12px] text-red-700">
            <Icons.IconAlertCircle size={14} stroke={1.75} className="shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 pb-3 pt-2 border-t border-hairline bg-white shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            placeholder="Ask Claude to write or update wiki content…"
            className="flex-1 px-3 py-2 text-[13px] border border-hairline rounded-lg focus:outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100 resize-none bg-sidebar leading-relaxed"
            disabled={loading}
          />
          {loading ? (
            <button
              onClick={handleStop}
              className="p-2.5 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors shrink-0"
              title="Stop"
            >
              <Icons.IconSquare size={16} stroke={2} />
            </button>
          ) : (
            <button
              onClick={send}
              disabled={!input.trim()}
              className="p-2.5 rounded-lg bg-brand text-white hover:bg-brand-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              title="Send (Enter)"
            >
              <Icons.IconSend size={16} stroke={1.75} />
            </button>
          )}
        </div>
        <p className="text-[10px] text-muted mt-1.5">Enter to send · Shift+Enter for newline</p>
      </div>
    </div>
  );
}
