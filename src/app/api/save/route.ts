import { NextRequest, NextResponse } from 'next/server';
import { checkPassword, issueToken, verifyToken } from '@/lib/auth';
import { commitFile, deleteFile } from '@/lib/github';
import { isValidPath } from '@/lib/content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body =
  | { action: 'auth'; password: string }
  | { action: 'save'; token: string; path: string; content: string; message?: string }
  | { action: 'delete'; token: string; path: string };

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || !('action' in body)) {
    return NextResponse.json({ error: 'Missing action' }, { status: 400 });
  }

  try {
    if (body.action === 'auth') {
      if (!checkPassword(body.password)) {
        return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
      }
      const token = await issueToken();
      return NextResponse.json({ token });
    }

    if (body.action === 'save') {
      const ok = await verifyToken(body.token);
      if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      if (!isValidPath(body.path)) {
        return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
      }
      if (typeof body.content !== 'string' || body.content.length === 0) {
        return NextResponse.json({ error: 'Empty content' }, { status: 400 });
      }
      const filePath = `content/${body.path}.mdx`;
      const result = await commitFile({
        filePath,
        content: body.content,
        message: body.message || `wiki: update ${body.path} via MDplus wiki editor`,
      });
      return NextResponse.json({ success: true, commitSha: result.commitSha });
    }

    if (body.action === 'delete') {
      const ok = await verifyToken(body.token);
      if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      if (!isValidPath(body.path)) {
        return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
      }
      const filePath = `content/${body.path}.mdx`;
      const result = await deleteFile({
        filePath,
        message: `wiki: delete ${body.path} via MDplus wiki editor`,
      });
      return NextResponse.json({ success: true, commitSha: result.commitSha });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
