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
    try {
      meta = JSON.parse(metaMatch[1].trim());
    } catch {}
  }

  return { body: bodyMatch[1].trim(), meta };
}

function stripMarkers(text: string): string {
  return text
    .replace(/\[WIKI_CONTENT_START\][\s\S]*?\[WIKI_CONTENT_END\]/g, '')
    .replace(/\[WIKI_META_START\][\s\S]*?\[WIKI_META_END\]/g, '')
    .trim();
}

function AssistantMessage({
  message,
  onApply,
}: {
  message: Message;
  onApply: (content: WikiContent) => void;
}) {
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

      {wikiContent && (
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
              onClick={() => onApply(wikiContent)}
              className="flex items-center gap-1.5 px-3 py-1 bg-brand text-white text-[12px] font-medium rounded-md hover:bg-brand-600 transition-colors"
            >
              <Icons.IconArrowLeft size={12} stroke={2} />
              Apply to editor
            </button>
          </div>
          <pre className="px-3 py-2.5 text-[11px] leading-relaxed text-brand-800 overflow-x-auto max-h-[200px] overflow-y-auto font-mono whitespace-pre-wrap">
            {wikiContent.body}
          </pre>
        </div>
      )}

      {/* During streaming show partial content preview if markers present */}
      {message.streaming && hasMarkers && !wikiContent && (
        <div className="border border-brand-200 bg-brand-50 rounded-lg px-3 py-2 text-[12px] text-brand flex items-center gap-2">
          <Icons.IconLoader size={14} stroke={1.75} className="animate-spin" />
          Generating wiki content...
        </div>
      )}
    </div>
  );
}

export interface AIApplyPayload {
  body: string;
  title?: string;
  icon?: string;
  section?: string;
}

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
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setError(null);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
    };

    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      streaming: true,
    };

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
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: accumulated } : m
          )
        );
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, streaming: false } : m
        )
      );

      // Clear Slack URL after first use
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const handleApply = (content: WikiContent) => {
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
    setMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, streaming: false } : m))
    );
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
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-black/[0.04] text-muted"
          >
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
          <div className="flex gap-2">
            <input
              type="url"
              value={slackUrl}
              onChange={(e) => setSlackUrl(e.target.value)}
              placeholder="https://mdplus.slack.com/archives/…"
              className="flex-1 px-2.5 py-1.5 text-[12px] border border-hairline rounded-md focus:outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100 bg-sidebar"
            />
          </div>
          <p className="text-[11px] text-muted mt-1">
            Paste a Slack thread link — Claude will read it and help you turn it into a wiki page.
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-[13px] text-muted text-center pt-4">
              Describe what you want to add or update — Claude will draft it for you in proper wiki format.
            </p>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setInput(s);
                    inputRef.current?.focus();
                  }}
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
            <div key={msg.id} className="flex flex-col gap-1">
              <AssistantMessage message={msg} onApply={handleApply} />
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
        <p className="text-[10px] text-muted mt-1.5">
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}
