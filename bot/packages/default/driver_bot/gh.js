// GitHub REST for the request issues.
//   createGitHub({ token, repo: 'owner/name', assignee? }) -> { create({ title, body, labels }) -> issue, get(n) -> issue,
//     comment(n, body), labels(n, add[], remove[]), state(n, 'open' | 'closed'),
//     log(base, sinceIso) -> { head, commits: [{ sha, message }] } – for the daily news (news.js) }
// assignee (default: the repo owner): every new issue is assigned to them, so GitHub emails them about it
function createGitHub({ token, repo, assignee = repo.split('/')[0] }) {
  async function api(method, path, body) {
    const r = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'driver-game-bot' },
      body: body && JSON.stringify(body),
    });
    if (r.status === 404 && method === 'DELETE') return null; // removing a label the issue no longer has
    if (!r.ok) throw new Error(`github ${method} ${path}: ${r.status} ${await r.text()}`);
    return r.status === 204 ? null : r.json();
  }
  return {
    create: ({ title, body, labels }) => api('POST', '/issues', { title, body, labels, ...(assignee && { assignees: [assignee] }) }),
    get: (n) => api('GET', `/issues/${n}`),
    comment: (n, body) => api('POST', `/issues/${n}/comments`, { body }),
    async labels(n, add = [], remove = []) {
      if (add.length) await api('POST', `/issues/${n}/labels`, { labels: add });
      for (const l of remove) await api('DELETE', `/issues/${n}/labels/${encodeURIComponent(l)}`);
    },
    state: (n, state) => api('PATCH', `/issues/${n}`, { state }),
    async log(base, since) { // main's non-merge commits after base (or since an ISO time when base is gone or rewritten)
      const head = (await api('GET', '/commits/main')).sha;
      if (base && head.startsWith(base)) return { head, commits: [] };
      let list = null;
      if (base) {
        const c = await api('GET', `/compare/${base}...${head}`).catch(() => null);
        if (c && (c.status === 'ahead' || c.status === 'identical')) list = c.commits;
      }
      list ||= (await api('GET', `/commits?sha=${head}&per_page=100&since=${since}`)).reverse();
      return { head, commits: list.filter((c) => c.parents.length < 2).map((c) => ({ sha: c.sha, message: c.commit.message.trim() })) };
    },
  };
}

module.exports = { createGitHub };
