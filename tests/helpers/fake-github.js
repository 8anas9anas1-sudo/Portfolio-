'use strict';
/* GitHub وهمي يعمل في الذاكرة — لاختبار الـ API بدون إنترنت وبدون لمس ريبو حقيقي */
const crypto = require('crypto');

const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
const blobSha = (buf) => sha1(Buffer.concat([Buffer.from('blob ' + buf.length + '\0'), buf]));

class FakeGitHub {
  constructor(files, opts) {
    opts = opts || {};
    this.repo = opts.repo || 'owner/portfolio';
    this.branch = opts.branch || 'main';
    this.blobs = new Map();
    this.trees = new Map();
    this.commits = new Map();
    this.counter = 0;
    this.calls = [];
    this.failStatus = null;          // لمحاكاة رفض التوكن (401/403/404)
    this.beforeRefUpdate = null;     // لمحاكاة commit متزامن من مكان آخر
    const tree = new Map();
    Object.keys(files).forEach((p) => {
      const buf = Buffer.isBuffer(files[p]) ? files[p] : Buffer.from(files[p], 'utf8');
      const s = blobSha(buf);
      this.blobs.set(s, buf);
      tree.set(p, s);
    });
    const treeSha = this._saveTree(tree);
    const c = this._saveCommit(treeSha, []);
    this.head = c;
  }
  _saveTree(map) { const s = sha1('tree' + (++this.counter)); this.trees.set(s, new Map(map)); return s; }
  _saveCommit(tree, parents) { const s = sha1('commit' + (++this.counter)); this.commits.set(s, { tree, parents }); return s; }
  filesAt(commit) { return this.trees.get(this.commits.get(commit || this.head).tree); }
  read(path) { const s = this.filesAt().get(path); return s ? this.blobs.get(s) : null; }
  has(path) { return this.filesAt().has(path); }
  commitCount() { let n = 0, c = this.head; while (c) { n++; c = this.commits.get(c).parents[0]; } return n; }

  /** يحقن fetch عام */
  install() {
    this._orig = global.fetch;
    global.fetch = (url, init) => this._fetch(String(url), init || {});
  }
  uninstall() { global.fetch = this._orig; }

  _resp(status, data) {
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(data === undefined ? '' : JSON.stringify(data))
    });
  }

  _fetch(url, init) {
    const method = (init.method || 'GET').toUpperCase();
    const base = 'https://api.github.com/repos/' + this.repo;
    if (!url.startsWith(base)) return this._resp(404, { message: 'Not Found' });
    const auth = (init.headers && init.headers.Authorization) || '';
    if (!/^Bearer .+/.test(auth)) return this._resp(401, { message: 'Bad credentials' });
    this.calls.push(method + ' ' + url.slice(base.length));
    if (this.failStatus) return this._resp(this.failStatus, { message: 'forced failure' });

    const u = new URL(url);
    const route = decodeURIComponent(u.pathname.slice(('/repos/' + this.repo).length));
    const body = init.body ? JSON.parse(init.body) : null;
    let m;

    if (method === 'GET' && (m = route.match(/^\/git\/ref\/heads\/(.+)$/))) {
      if (m[1] !== this.branch) return this._resp(404, { message: 'Not Found' });
      return this._resp(200, { object: { sha: this.head } });
    }
    if (method === 'GET' && (m = route.match(/^\/git\/commits\/([0-9a-f]+)$/))) {
      const c = this.commits.get(m[1]);
      return c ? this._resp(200, { sha: m[1], tree: { sha: c.tree } }) : this._resp(404, { message: 'Not Found' });
    }
    if (method === 'GET' && (m = route.match(/^\/contents\/(.+)$/))) {
      const ref = u.searchParams.get('ref') || this.branch;
      const commit = ref === this.branch ? this.head : (this.commits.has(ref) ? ref : null);
      if (!commit) return this._resp(404, { message: 'No commit found for the ref ' + ref });
      const files = this.filesAt(commit);
      const p = m[1];
      if (files.has(p)) {
        const buf = this.blobs.get(files.get(p));
        const b64 = buf.toString('base64').replace(/(.{60})/g, '$1\n');
        return this._resp(200, { type: 'file', path: p, sha: files.get(p), content: b64, encoding: 'base64' });
      }
      const prefix = p.replace(/\/$/, '') + '/';
      const kids = [...files.keys()].filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'));
      if (!kids.length) return this._resp(404, { message: 'Not Found' });
      return this._resp(200, kids.map((k) => ({ type: 'file', name: k.slice(prefix.length), path: k, sha: files.get(k) })));
    }
    if (method === 'POST' && route === '/git/blobs') {
      const buf = body.encoding === 'base64' ? Buffer.from(body.content, 'base64') : Buffer.from(body.content, 'utf8');
      const s = blobSha(buf);
      this.blobs.set(s, buf);
      return this._resp(201, { sha: s });
    }
    if (method === 'POST' && route === '/git/trees') {
      const baseMap = this.trees.get(body.base_tree);
      if (!baseMap) return this._resp(422, { message: 'base_tree not found' });
      const map = new Map(baseMap);
      for (const e of body.tree) {
        if (e.sha === null) {
          if (!map.has(e.path)) return this._resp(422, { message: 'GitRPC::BadObjectState: ' + e.path });
          map.delete(e.path);
        } else {
          if (!this.blobs.has(e.sha)) return this._resp(422, { message: 'blob missing' });
          map.set(e.path, e.sha);
        }
      }
      return this._resp(201, { sha: this._saveTree(map) });
    }
    if (method === 'POST' && route === '/git/commits') {
      return this._resp(201, { sha: this._saveCommit(body.tree, body.parents), message: body.message });
    }
    if (method === 'PATCH' && (m = route.match(/^\/git\/refs\/heads\/(.+)$/))) {
      if (this.beforeRefUpdate) { const f = this.beforeRefUpdate; this.beforeRefUpdate = null; f(this); }
      const c = this.commits.get(body.sha);
      if (!c || c.parents[0] !== this.head) return this._resp(422, { message: 'Update is not a fast forward' });
      this.head = body.sha;
      this.lastMessage = (this.messages = this.messages || {})[body.sha];
      return this._resp(200, { object: { sha: body.sha } });
    }
    return this._resp(404, { message: 'Not Found: ' + method + ' ' + route });
  }

  /** commit خارجي (يحاكي تعديلاً من مكان آخر) */
  externalEdit(path, text) {
    const map = new Map(this.filesAt());
    const buf = Buffer.from(text, 'utf8');
    const s = blobSha(buf);
    this.blobs.set(s, buf);
    map.set(path, s);
    this.head = this._saveCommit(this._saveTree(map), [this.head]);
  }
}

module.exports = { FakeGitHub };
