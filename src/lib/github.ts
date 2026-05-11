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
