const DEFAULT_ALLOWED_ORIGIN = 'https://9v4kkqwws7-coder.github.io';

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = env.ALLOWED_ORIGIN || DEFAULT_ALLOWED_ORIGIN;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin, allowedOrigin) });
    }

    const headers = corsHeaders(origin, allowedOrigin);
    headers.set('Content-Type', 'application/json; charset=utf-8');

    if (origin && origin !== allowedOrigin) {
      return json({ error: 'Origin not allowed' }, 403, headers);
    }

    const suppliedKey = request.headers.get('X-Canasta-Key') || '';
    if (!env.SYNC_KEY || !timingSafeEqual(suppliedKey, env.SYNC_KEY)) {
      return json({ error: 'Unauthorized' }, 401, headers);
    }

    const url = new URL(request.url);
    if (url.pathname !== '/state') {
      return json({ error: 'Not found' }, 404, headers);
    }

    try {
      if (request.method === 'GET') {
        const remote = await readGithubState(env);
        return json({ state: remote.state, sha: remote.sha }, 200, headers);
      }

      if (request.method === 'PUT') {
        const raw = await request.text();
        if (raw.length > 256_000) return json({ error: 'Payload too large' }, 413, headers);

        let payload;
        try { payload = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400, headers); }
        if (!isValidState(payload)) return json({ error: 'Invalid state format' }, 400, headers);

        const result = await writeGithubState(env, payload);
        return json({ ok: true, commit: result.commit }, 200, headers);
      }

      return json({ error: 'Method not allowed' }, 405, headers);
    } catch (error) {
      console.error(error);
      return json({ error: 'Sync failed' }, 500, headers);
    }
  }
};

function corsHeaders(origin, allowedOrigin) {
  const h = new Headers({
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Canasta-Key',
    'Cache-Control': 'no-store'
  });
  if (!origin || origin === allowedOrigin) h.set('Access-Control-Allow-Origin', allowedOrigin);
  return h;
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers });
}

function isValidState(state) {
  return !!state && typeof state === 'object' && !!state.current && Array.isArray(state.current.rounds) && Array.isArray(state.games);
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function githubHeaders(env) {
  return {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'canasta-tracker-worker'
  };
}

function repoConfig(env) {
  return {
    owner: env.GITHUB_OWNER || '9v4kkqwws7-coder',
    repo: env.GITHUB_REPO || 'canasta-tracker',
    path: env.GITHUB_PATH || 'data/canasta-state.json',
    branch: env.GITHUB_BRANCH || 'data'
  };
}

async function readGithubState(env) {
  const { owner, repo, path, branch } = repoConfig(env);
  const api = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(api, { headers: githubHeaders(env) });

  if (res.status === 404) return { state: null, sha: null };
  if (!res.ok) throw new Error(`GitHub read failed: ${res.status}`);

  const body = await res.json();
  const bytes = Uint8Array.from(atob(body.content.replace(/\n/g, '')), c => c.charCodeAt(0));
  const text = new TextDecoder().decode(bytes);
  return { state: JSON.parse(text), sha: body.sha };
}

async function writeGithubState(env, state) {
  const { owner, repo, path, branch } = repoConfig(env);
  const current = await readGithubState(env);
  const jsonText = JSON.stringify(state, null, 2);
  const content = bytesToBase64(new TextEncoder().encode(jsonText));

  const body = {
    message: `Update Canasta state ${new Date().toISOString()}`,
    content,
    branch
  };
  if (current.sha) body.sha = current.sha;

  const api = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const res = await fetch(api, {
    method: 'PUT',
    headers: { ...githubHeaders(env), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`GitHub write failed: ${res.status} ${await res.text()}`);
  const result = await res.json();
  return { commit: result.commit?.sha || null };
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
