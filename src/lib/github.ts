interface GitHubEnv {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

function env(): GitHubEnv {
  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = process.env;
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN env var is not set');
  if (!GITHUB_OWNER) throw new Error('GITHUB_OWNER env var is not set');
  if (!GITHUB_REPO) throw new Error('GITHUB_REPO env var is not set');
  return {
    token: GITHUB_TOKEN,
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    branch: process.env.GITHUB_BRANCH || 'main',
  };
}

const API = 'https://api.github.com';

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'mdplus-wiki',
  };
}

async function getFileSha(filePath: string): Promise<string | null> {
  const { token, owner, repo, branch } = env();
  const url = `${API}/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${branch}`;
  const res = await fetch(url, { headers: headers(token), cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GitHub getFile failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { sha: string };
  return json.sha ?? null;
}

export interface CommitResult {
  commitSha: string;
  contentSha: string;
}

export async function commitFile(opts: {
  filePath: string;
  content: string;
  message: string;
}): Promise<CommitResult> {
  const { token, owner, repo, branch } = env();
  const existingSha = await getFileSha(opts.filePath);
  const url = `${API}/repos/${owner}/${repo}/contents/${encodeURIComponent(opts.filePath)}`;
  const body = {
    message: opts.message,
    content: Buffer.from(opts.content, 'utf8').toString('base64'),
    branch,
    committer: { name: 'MDplus Wiki', email: 'wiki@mdplus.community' },
    author: { name: 'MDplus Wiki', email: 'wiki@mdplus.community' },
    ...(existingSha ? { sha: existingSha } : {}),
  };
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`GitHub commit failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    commit: { sha: string };
    content: { sha: string };
  };
  return { commitSha: json.commit.sha, contentSha: json.content.sha };
}

export async function deleteFile(opts: {
  filePath: string;
  message: string;
}): Promise<{ commitSha: string }> {
  const { token, owner, repo, branch } = env();
  const sha = await getFileSha(opts.filePath);
  if (!sha) throw new Error('File not found');
  const url = `${API}/repos/${owner}/${repo}/contents/${encodeURIComponent(opts.filePath)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: opts.message,
      sha,
      branch,
      committer: { name: 'MDplus Wiki', email: 'wiki@mdplus.community' },
    }),
  });
  if (!res.ok) {
    throw new Error(`GitHub delete failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { commit: { sha: string } };
  return { commitSha: json.commit.sha };
}

export async function getFileContent(filePath: string): Promise<string | null> {
  const { token, owner, repo, branch } = env();
  const url = `${API}/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${branch}`;
  const res = await fetch(url, { headers: headers(token), cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GitHub getFile failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { content: string; encoding: string };
  if (json.encoding === 'base64') {
    return Buffer.from(json.content, 'base64').toString('utf8');
  }
  return json.content;
}

export async function listDirectoryFiles(dirPath: string): Promise<Array<{ name: string; path: string; type: 'file' | 'dir' }>> {
  const { token, owner, repo, branch } = env();
  const url = `${API}/repos/${owner}/${repo}/contents/${encodeURIComponent(dirPath)}?ref=${branch}`;
  const res = await fetch(url, { headers: headers(token), cache: 'no-store' });
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(`GitHub listDir failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as Array<{ name: string; path: string; type: string }>;
  return json.map(f => ({ name: f.name, path: f.path, type: f.type as 'file' | 'dir' }));
}

// Batch commit multiple file changes in a single commit using Git Data API
export async function batchCommitFiles(opts: {
  files: Array<{ path: string; content: string }>;
  message: string;
}): Promise<{ commitSha: string }> {
  const { token, owner, repo, branch } = env();
  const hdrs = { ...headers(token), 'Content-Type': 'application/json' };

  // 1. Get the current commit SHA for the branch
  const refRes = await fetch(
    `${API}/repos/${owner}/${repo}/git/refs/heads/${branch}`,
    { headers: headers(token), cache: 'no-store' }
  );
  if (!refRes.ok) {
    throw new Error(`Failed to get branch ref: ${refRes.status} ${await refRes.text()}`);
  }
  const refJson = (await refRes.json()) as { object: { sha: string } };
  const currentCommitSha = refJson.object.sha;

  // 2. Get the tree SHA for that commit
  const commitRes = await fetch(
    `${API}/repos/${owner}/${repo}/git/commits/${currentCommitSha}`,
    { headers: headers(token), cache: 'no-store' }
  );
  if (!commitRes.ok) {
    throw new Error(`Failed to get commit: ${commitRes.status} ${await commitRes.text()}`);
  }
  const commitJson = (await commitRes.json()) as { tree: { sha: string } };
  const baseTreeSha = commitJson.tree.sha;

  // 3. Create blobs for each file and build tree entries
  const treeEntries: Array<{ path: string; mode: string; type: string; sha: string }> = [];

  for (const file of opts.files) {
    const blobRes = await fetch(
      `${API}/repos/${owner}/${repo}/git/blobs`,
      {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({
          content: Buffer.from(file.content, 'utf8').toString('base64'),
          encoding: 'base64',
        }),
      }
    );
    if (!blobRes.ok) {
      throw new Error(`Failed to create blob: ${blobRes.status} ${await blobRes.text()}`);
    }
    const blobJson = (await blobRes.json()) as { sha: string };
    treeEntries.push({
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha: blobJson.sha,
    });
  }

  // 4. Create a new tree with the updated files
  const treeRes = await fetch(
    `${API}/repos/${owner}/${repo}/git/trees`,
    {
      method: 'POST',
      headers: hdrs,
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeEntries,
      }),
    }
  );
  if (!treeRes.ok) {
    throw new Error(`Failed to create tree: ${treeRes.status} ${await treeRes.text()}`);
  }
  const treeJson = (await treeRes.json()) as { sha: string };

  // 5. Create a new commit pointing to that tree
  const newCommitRes = await fetch(
    `${API}/repos/${owner}/${repo}/git/commits`,
    {
      method: 'POST',
      headers: hdrs,
      body: JSON.stringify({
        message: opts.message,
        tree: treeJson.sha,
        parents: [currentCommitSha],
        author: { name: 'MDplus Wiki', email: 'wiki@mdplus.community' },
        committer: { name: 'MDplus Wiki', email: 'wiki@mdplus.community' },
      }),
    }
  );
  if (!newCommitRes.ok) {
    throw new Error(`Failed to create commit: ${newCommitRes.status} ${await newCommitRes.text()}`);
  }
  const newCommitJson = (await newCommitRes.json()) as { sha: string };

  // 6. Update the branch ref to point to the new commit
  const updateRefRes = await fetch(
    `${API}/repos/${owner}/${repo}/git/refs/heads/${branch}`,
    {
      method: 'PATCH',
      headers: hdrs,
      body: JSON.stringify({
        sha: newCommitJson.sha,
      }),
    }
  );
  if (!updateRefRes.ok) {
    throw new Error(`Failed to update ref: ${updateRefRes.status} ${await updateRefRes.text()}`);
  }

  return { commitSha: newCommitJson.sha };
}
