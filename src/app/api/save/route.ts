import { NextRequest, NextResponse } from 'next/server';
import { checkPassword, issueToken, verifyToken } from '@/lib/auth';
import { commitFile, deleteFile, getFileContent, listDirectoryFiles, batchCommitFiles } from '@/lib/github';
import { isValidPath, sectionExists, getSectionMeta } from '@/lib/content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body =
  | { action: 'auth'; password: string }
  | { action: 'save'; token: string; path: string; content: string; message?: string }
  | { action: 'delete'; token: string; path: string }
  | { action: 'create-section'; token: string; sectionId: string; label: string; icon?: string; order?: number }
  | { action: 'update-section'; token: string; sectionId: string; label?: string; icon?: string; order?: number }
  | { action: 'move-section'; token: string; sectionId: string; newParent: string | null; label: string; icon: string; order: number }
  | { action: 'update-page-order'; token: string; path: string; order: number }
  | { action: 'batch-reorder-pages'; token: string; updates: Array<{ path: string; order: number }> }
  | { action: 'batch-reorder-sections'; token: string; updates: Array<{ sectionId: string; order: number }> };

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

    if (body.action === 'create-section') {
      const ok = await verifyToken(body.token);
      if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

      // Validate section ID (lowercase letters, numbers, hyphens, and slashes for nesting)
      if (!/^[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)*$/.test(body.sectionId)) {
        return NextResponse.json({ error: 'Invalid section ID. Use lowercase letters, numbers, and hyphens.' }, { status: 400 });
      }

      // Check if section already exists
      if (sectionExists(body.sectionId)) {
        return NextResponse.json({ error: 'Section already exists' }, { status: 400 });
      }

      // Create _section.json file (this creates the folder in git)
      const sectionMeta = {
        label: body.label,
        icon: body.icon || 'folder',
        order: body.order ?? 999,
      };

      const filePath = `content/${body.sectionId}/_section.json`;
      const result = await commitFile({
        filePath,
        content: JSON.stringify(sectionMeta, null, 2),
        message: `wiki: create section "${body.label}" via MDplus wiki editor`,
      });
      return NextResponse.json({ success: true, commitSha: result.commitSha, sectionId: body.sectionId });
    }

    if (body.action === 'update-section') {
      const ok = await verifyToken(body.token);
      if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

      // Check if section exists
      if (!sectionExists(body.sectionId)) {
        return NextResponse.json({ error: 'Section does not exist' }, { status: 404 });
      }

      // Build updated metadata
      const sectionMeta: { label?: string; icon?: string; order?: number } = {};
      if (body.label !== undefined) sectionMeta.label = body.label;
      if (body.icon !== undefined) sectionMeta.icon = body.icon;
      if (body.order !== undefined) sectionMeta.order = body.order;

      const filePath = `content/${body.sectionId}/_section.json`;
      const result = await commitFile({
        filePath,
        content: JSON.stringify(sectionMeta, null, 2),
        message: `wiki: update section "${body.sectionId}" via MDplus wiki editor`,
      });
      return NextResponse.json({ success: true, commitSha: result.commitSha });
    }

    if (body.action === 'move-section') {
      const ok = await verifyToken(body.token);
      if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

      // Validate current section exists
      if (!sectionExists(body.sectionId)) {
        return NextResponse.json({ error: 'Section does not exist' }, { status: 404 });
      }

      // Calculate new section ID
      const sectionName = body.sectionId.split('/').pop()!;
      const newSectionId = body.newParent ? `${body.newParent}/${sectionName}` : sectionName;

      // Don't do anything if the path isn't changing
      if (newSectionId === body.sectionId) {
        return NextResponse.json({ error: 'Section is already at this location' }, { status: 400 });
      }

      // Check new location doesn't already exist
      if (sectionExists(newSectionId)) {
        return NextResponse.json({ error: 'A section already exists at the target location' }, { status: 400 });
      }

      // If moving under a parent, validate parent exists
      if (body.newParent && !sectionExists(body.newParent)) {
        return NextResponse.json({ error: 'Parent section does not exist' }, { status: 400 });
      }

      // Get all files in the current section
      const files = await listDirectoryFiles(`content/${body.sectionId}`);

      // Process each file
      for (const file of files) {
        const content = await getFileContent(file.path);
        if (!content) continue;

        const newPath = file.path.replace(`content/${body.sectionId}`, `content/${newSectionId}`);

        // Update frontmatter for MDX files
        let newContent = content;
        if (file.name.endsWith('.mdx')) {
          newContent = content.replace(
            /^(---\n[\s\S]*?section:\s*)([^\n]+)/m,
            `$1${newSectionId}`
          );
        }

        // Commit to new location
        await commitFile({
          filePath: newPath,
          content: newContent,
          message: `wiki: move ${file.name} to ${newSectionId}`,
        });

        // Delete from old location
        await deleteFile({
          filePath: file.path,
          message: `wiki: remove ${file.name} from ${body.sectionId}`,
        });
      }

      // Update the _section.json at the new location with the provided metadata
      const sectionMeta = {
        label: body.label,
        icon: body.icon,
        order: body.order,
      };
      await commitFile({
        filePath: `content/${newSectionId}/_section.json`,
        content: JSON.stringify(sectionMeta, null, 2),
        message: `wiki: finalize move of section "${body.label}" to ${newSectionId}`,
      });

      return NextResponse.json({ success: true, newSectionId });
    }

    if (body.action === 'update-page-order') {
      const ok = await verifyToken(body.token);
      if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      if (!isValidPath(body.path)) {
        return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
      }

      const filePath = `content/${body.path}.mdx`;
      const content = await getFileContent(filePath);
      if (!content) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }

      // Parse and update frontmatter with new order
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
      if (!fmMatch) {
        return NextResponse.json({ error: 'Invalid file format' }, { status: 400 });
      }

      const frontmatterLines = fmMatch[1].split('\n');
      const bodyContent = fmMatch[2];
      let orderFound = false;

      // Update or add order field
      const updatedLines = frontmatterLines.map(line => {
        if (line.startsWith('order:')) {
          orderFound = true;
          return `order: ${body.order}`;
        }
        return line;
      });

      if (!orderFound) {
        // Add order before the end
        updatedLines.push(`order: ${body.order}`);
      }

      const newContent = `---\n${updatedLines.join('\n')}\n---\n${bodyContent}`;

      const result = await commitFile({
        filePath,
        content: newContent,
        message: `wiki: reorder ${body.path} via MDplus wiki editor`,
      });

      return NextResponse.json({ success: true, commitSha: result.commitSha });
    }

    if (body.action === 'batch-reorder-pages') {
      const ok = await verifyToken(body.token);
      if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

      if (!body.updates || body.updates.length === 0) {
        return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
      }

      // Validate all paths
      for (const update of body.updates) {
        if (!isValidPath(update.path)) {
          return NextResponse.json({ error: `Invalid path: ${update.path}` }, { status: 400 });
        }
      }

      // Build updated files
      const filesToCommit: Array<{ path: string; content: string }> = [];

      for (const update of body.updates) {
        const filePath = `content/${update.path}.mdx`;
        const content = await getFileContent(filePath);
        if (!content) continue;

        // Parse and update frontmatter with new order
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
        if (!fmMatch) continue;

        const frontmatterLines = fmMatch[1].split('\n');
        const bodyContent = fmMatch[2];
        let orderFound = false;

        const updatedLines = frontmatterLines.map(line => {
          if (line.startsWith('order:')) {
            orderFound = true;
            return `order: ${update.order}`;
          }
          return line;
        });

        if (!orderFound) {
          updatedLines.push(`order: ${update.order}`);
        }

        const newContent = `---\n${updatedLines.join('\n')}\n---\n${bodyContent}`;
        filesToCommit.push({ path: filePath, content: newContent });
      }

      if (filesToCommit.length === 0) {
        return NextResponse.json({ error: 'No valid files to update' }, { status: 400 });
      }

      const result = await batchCommitFiles({
        files: filesToCommit,
        message: `wiki: reorder ${filesToCommit.length} pages via MDplus wiki editor`,
      });

      return NextResponse.json({ success: true, commitSha: result.commitSha });
    }

    if (body.action === 'batch-reorder-sections') {
      const ok = await verifyToken(body.token);
      if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

      if (!body.updates || body.updates.length === 0) {
        return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
      }

      // Build updated files
      const filesToCommit: Array<{ path: string; content: string }> = [];

      for (const update of body.updates) {
        if (!sectionExists(update.sectionId)) continue;

        // Get current section metadata
        const currentMeta = getSectionMeta(update.sectionId);
        const sectionMeta = {
          label: currentMeta?.label || update.sectionId,
          icon: currentMeta?.icon || 'folder',
          order: update.order,
        };

        const filePath = `content/${update.sectionId}/_section.json`;
        filesToCommit.push({
          path: filePath,
          content: JSON.stringify(sectionMeta, null, 2),
        });
      }

      if (filesToCommit.length === 0) {
        return NextResponse.json({ error: 'No valid sections to update' }, { status: 400 });
      }

      const result = await batchCommitFiles({
        files: filesToCommit,
        message: `wiki: reorder ${filesToCommit.length} sections via MDplus wiki editor`,
      });

      return NextResponse.json({ success: true, commitSha: result.commitSha });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
