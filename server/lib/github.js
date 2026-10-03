'use strict';
/* عميل GitHub مبسّط (REST API) — بدون أي مكتبات خارجية */

const API = 'https://api.github.com';

function ghError(status, message) {
  const e = new Error(message || ('GitHub ' + status));
  e.isGitHub = true;
  e.status = status;
  return e;
}

async function gh(cfg, method, path, body) {
  const r = await fetch(API + '/repos/' + cfg.repo + path, {
    method,
    headers: Object.assign({
      'Authorization': 'Bearer ' + cfg.token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'portfolio-admin'
    }, body ? { 'Content-Type': 'application/json' } : {}),
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { /* ignore */ }
  if (!r.ok) throw ghError(r.status, data && data.message);
  return data;
}

const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');

/** يقرأ ملفاً نصياً: يرجع { text, sha } أو null لو غير موجود */
async function readFile(cfg, path, ref) {
  try {
    const d = await gh(cfg, 'GET', '/contents/' + encPath(path) + '?ref=' + encodeURIComponent(ref || cfg.branch));
    if (Array.isArray(d) || d.type !== 'file') return null;
    return { text: Buffer.from(d.content || '', 'base64').toString('utf8'), sha: d.sha };
  } catch (e) {
    if (e.isGitHub && e.status === 404) return null;
    throw e;
  }
}

/** قائمة الملفات داخل مجلد: [{name, path, sha}] — فارغة لو المجلد غير موجود */
async function listDir(cfg, path, ref) {
  try {
    const d = await gh(cfg, 'GET', '/contents/' + encPath(path) + '?ref=' + encodeURIComponent(ref || cfg.branch));
    return Array.isArray(d) ? d.filter((x) => x.type === 'file').map((x) => ({ name: x.name, path: x.path, sha: x.sha })) : [];
  } catch (e) {
    if (e.isGitHub && e.status === 404) return [];
    throw e;
  }
}

async function headCommit(cfg) {
  const ref = await gh(cfg, 'GET', '/git/ref/heads/' + encPath(cfg.branch));
  const commitSha = ref.object.sha;
  const commit = await gh(cfg, 'GET', '/git/commits/' + commitSha);
  return { commitSha, treeSha: commit.tree.sha };
}

/**
 * commit واحد يحوي كل التغييرات (ملفات نصية + صور + حذف) — يعني نشر واحد فقط في Vercel.
 * files: [{ path, text } | { path, base64 } | { path, remove:true }]
 */
async function commitFiles(cfg, head, files, message) {
  const entries = await Promise.all(files.map(async (f) => {
    if (f.remove) return { path: f.path, mode: '100644', type: 'blob', sha: null };
    const blob = await gh(cfg, 'POST', '/git/blobs', f.base64 !== undefined
      ? { content: f.base64, encoding: 'base64' }
      : { content: f.text, encoding: 'utf-8' });
    return { path: f.path, mode: '100644', type: 'blob', sha: blob.sha };
  }));
  const tree = await gh(cfg, 'POST', '/git/trees', { base_tree: head.treeSha, tree: entries });
  const commit = await gh(cfg, 'POST', '/git/commits', { message, tree: tree.sha, parents: [head.commitSha] });
  await gh(cfg, 'PATCH', '/git/refs/heads/' + encPath(cfg.branch), { sha: commit.sha, force: false });
  const shas = {};
  entries.forEach((e) => { if (e.sha) shas[e.path] = e.sha; });
  return { commitSha: commit.sha, shas };
}

module.exports = { readFile, listDir, headCommit, commitFiles };
