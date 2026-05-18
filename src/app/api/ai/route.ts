import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { verifyToken } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an AI assistant embedded in the MDplus Leadership Wiki editor. Help team members create and update wiki pages by talking to them naturally and generating properly formatted wiki content.

## Wiki Format

Pages use MDX with YAML frontmatter:

\`\`\`
---
title: "Page Title"
section: section-id
icon: icon-name
updatedAt: "Month Day, Year"
published: true
order: 999
---

Content here...
\`\`\`

## MDX Components

### Callout — highlighted notices
\`\`\`
<Callout type="info" title="Title">Content</Callout>
\`\`\`
Types: info (purple), warning (amber), success (green), tip (blue)

### LinkCard — resource links
\`\`\`
<LinkCard href="/section/page" title="Name" description="Description" icon="icon-name" />
\`\`\`

### PersonRow — team member listings
\`\`\`
<PersonRow name="Full Name" role="Job Title" email="email@mdplus.community" slack="username" />
\`\`\`

## Conventions
- ## for main sections (appear in table of contents)
- ### for subsections
- **bold** for key terms
- Bullet lists for enumerations, numbered lists for ordered steps
- Tables for structured data (Column | Column | Column format)
- Checkboxes (- [ ]) for process checklists
- Callouts for important notices, tips, or warnings
- Keep prose professional and concise

## Icon Names
Tabler icons in kebab-case: file, folder, users, user, settings, link, star, heart, bookmark, bell, calendar, clock, mail, message, briefcase, clipboard, clipboard-list, chart-bar, rocket, code, notes, writing, building, award, shield, alert-circle, info-circle, bulb, bolt, database, terminal, etc.

## Generating Wiki Content
When the user asks you to create or update wiki content, output the body content (no frontmatter unless creating a full new page). Wrap it in special markers so it can be applied to the editor:

[WIKI_CONTENT_START]
Your MDX content here...
[WIKI_CONTENT_END]

Optionally suggest metadata:
[WIKI_META_START]
{"title": "Suggested Title", "icon": "suggested-icon", "section": "section-id"}
[WIKI_META_END]

For conversational replies, just respond normally without the markers. Only use markers when you're generating actual page content ready to apply.`;

async function fetchSlackThread(threadUrl: string): Promise<string | null> {
  const slackToken = process.env.SLACK_BOT_TOKEN;
  if (!slackToken) return null;

  try {
    const match = threadUrl.match(/archives\/([A-Z0-9]+)\/p(\d+)/i);
    if (!match) return null;

    const channelId = match[1];
    const rawTs = match[2];
    const ts = rawTs.length > 6
      ? rawTs.slice(0, rawTs.length - 6) + '.' + rawTs.slice(rawTs.length - 6)
      : rawTs;

    const res = await fetch(
      `https://slack.com/api/conversations.replies?channel=${channelId}&ts=${ts}&limit=50`,
      { headers: { Authorization: `Bearer ${slackToken}` } }
    );
    const data = await res.json();
    if (!data.ok || !data.messages?.length) return null;

    const lines: string[] = data.messages.map(
      (m: { user?: string; username?: string; text: string }) => {
        const who = m.username || m.user || 'Unknown';
        const text = (m.text ?? '')
          .replace(/<@[A-Z0-9]+>/g, '@user')
          .replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1')
          .replace(/<([^|>]+)\|([^>]+)>/g, '$2')
          .replace(/<([^>]+)>/g, '$1')
          .trim();
        return `[${who}]: ${text}`;
      }
    );

    return lines.join('\n');
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  let body: {
    token: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    currentPageContext?: { title: string; section: string; body: string };
    slackThreadUrl?: string;
    sections?: Array<{ id: string; label: string }>;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const ok = await verifyToken(body.token);
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not configured on the server.' },
      { status: 503 }
    );
  }

  let systemPrompt = SYSTEM_PROMPT;

  if (body.sections?.length) {
    const list = body.sections.map((s) => `- ${s.id}: ${s.label}`).join('\n');
    systemPrompt += `\n\n## Current Wiki Sections\n${list}`;
  }

  if (body.currentPageContext) {
    const ctx = body.currentPageContext;
    systemPrompt += `\n\n## Page Currently Being Edited\nTitle: ${ctx.title}\nSection: ${ctx.section}\nCurrent content (first 2000 chars):\n\`\`\`\n${ctx.body.slice(0, 2000)}\n\`\`\``;
  }

  let messages = [...body.messages];

  if (body.slackThreadUrl?.trim()) {
    const thread = await fetchSlackThread(body.slackThreadUrl.trim());
    if (thread) {
      const prefix = `[Slack thread context]\n${thread}\n\n---\n\n`;
      if (messages.length > 0 && messages[messages.length - 1].role === 'user') {
        const last = messages[messages.length - 1];
        messages = [
          ...messages.slice(0, -1),
          { ...last, content: prefix + last.content },
        ];
      } else {
        messages = [...messages, { role: 'user', content: prefix + 'Please summarize this thread into a wiki page.' }];
      }
    }
  }

  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages,
  });

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'text_delta'
          ) {
            controller.enqueue(new TextEncoder().encode(chunk.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
