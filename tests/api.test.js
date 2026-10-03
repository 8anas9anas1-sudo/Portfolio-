'use strict';
/* تشغيل:  node --test tests/api.test.js   (أو  npm test) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { FakeGitHub } = require('./helpers/fake-github');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const login = require('../api/login');
const data = require('../api/data');
const save = require('../api/save');

/* ---------- أدوات ---------- */
function call(h, opts) {
  opts = opts || {};
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(s) { resolve({ status: this.statusCode, json: s ? JSON.parse(s) : null }); }
    };
    h({ method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body }, res).catch(reject);
  });
}
const auth = (t) => ({ authorization: 'Bearer ' + t });

function repoFiles() {
  const files = {};
  ['projects', 'journey', 'faq'].forEach((k) => { files['public/data/' + k + '.json'] = fs.readFileSync(path.join(PUB, 'data', k + '.json')); });
  fs.readdirSync(path.join(PUB, 'assets/projects')).forEach((f) => { files['public/assets/projects/' + f] = fs.readFileSync(path.join(PUB, 'assets/projects', f)); });
  files['public/index.html'] = '<html></html>';
  return files;
}

// صورة PNG صغيرة حقيقية (1×1)
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const JPG_B64 = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 1)]).toString('base64');

let fake, token, projects, shas;

test.beforeEach(async () => {
  process.env.ADMIN_PASSWORD = 'correct horse battery staple';
  process.env.GITHUB_TOKEN = 'ghp_fake_token';
  process.env.GITHUB_REPO = 'owner/portfolio';
  process.env.GITHUB_BRANCH = 'main';
  fake = new FakeGitHub(repoFiles());
  fake.install();
  const r = await call(login, { method: 'POST', body: { password: process.env.ADMIN_PASSWORD } });
  token = r.json.token;
  const d = await call(data, { headers: auth(token) });
  projects = d.json.files.projects.data;
  shas = { projects: d.json.files.projects.sha, journey: d.json.files.journey.sha, faq: d.json.files.faq.sha };
});
test.afterEach(() => fake.uninstall());

/* ---------- تسجيل الدخول ---------- */
test('login: wrong password → 401, right password → token', async () => {
  const bad = await call(login, { method: 'POST', body: { password: 'nope' } });
  assert.equal(bad.status, 401);
  assert.ok(token && token.includes('.'));
});

test('login: method other than POST → 405', async () => {
  const r = await call(login, { method: 'GET' });
  assert.equal(r.status, 405);
});

test('auth: missing / forged / expired token → 401', async () => {
  assert.equal((await call(data)).status, 401);
  assert.equal((await call(data, { headers: auth('abc.def') })).status, 401);
  const [p] = token.split('.');
  assert.equal((await call(data, { headers: auth(p + '.AAAA') })).status, 401);
  // token منتهي: نصنع واحداً بنفس المفتاح لكن exp قديم
  const key = crypto.createHash('sha256').update('portfolio-admin|' + process.env.ADMIN_PASSWORD + '|' + process.env.GITHUB_TOKEN).digest();
  const pay = Buffer.from(JSON.stringify({ exp: Date.now() - 1000, v: 1 })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const sig = crypto.createHmac('sha256', key).update(pay).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.equal((await call(data, { headers: auth(pay + '.' + sig) })).status, 401);
});

test('auth: changing the admin password invalidates old tokens', async () => {
  process.env.ADMIN_PASSWORD = 'a different password';
  assert.equal((await call(data, { headers: auth(token) })).status, 401);
});

test('config: too-short admin password is refused with a clear message', async () => {
  process.env.ADMIN_PASSWORD = 'short';
  const r = await call(login, { method: 'POST', body: { password: 'short' } });
  assert.equal(r.status, 500);
  assert.match(r.json.error, /ADMIN_PASSWORD/);
});

test('config: missing env vars → clear 500', async () => {
  delete process.env.GITHUB_TOKEN;
  const r = await call(login, { method: 'POST', body: { password: 'x' } });
  assert.equal(r.status, 500);
  assert.match(r.json.error, /GITHUB_TOKEN/);
});

/* ---------- القراءة ---------- */
test('data: returns all three files with blob shas', async () => {
  const d = await call(data, { headers: auth(token) });
  assert.equal(d.status, 200);
  assert.equal(d.json.files.projects.data.length, 6);
  assert.equal(d.json.files.journey.data.length, 4);
  assert.equal(d.json.files.faq.data.length, 4);
  assert.match(d.json.files.projects.sha, /^[0-9a-f]{40}$/);
});

/* ---------- الحفظ ---------- */
test('save: add project + upload image + edit → ONE commit with everything', async () => {
  const before = fake.commitCount();
  const np = Object.assign({}, projects[0], { id: 'new-one', title: 'مشروع جديد', heroImg: 'assets/projects/new-one-hero-abc.png', logoImg: null, link: null, github: null });
  const edited = projects.map((p) => (p.id === 'hofra' ? Object.assign({}, p, { title: 'الحفرة 2' }) : p));
  const r = await call(save, {
    method: 'POST', headers: auth(token),
    body: {
      files: { projects: { baseSha: shas.projects, data: edited.concat([np]) } },
      uploads: [{ path: 'assets/projects/new-one-hero-abc.png', base64: PNG_B64 }]
    }
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(fake.commitCount(), before + 1);
  assert.ok(fake.has('public/assets/projects/new-one-hero-abc.png'));
  const saved = JSON.parse(fake.read('public/data/projects.json').toString('utf8'));
  assert.equal(saved.length, 7);
  assert.equal(saved.find((p) => p.id === 'hofra').title, 'الحفرة 2');
  assert.equal(saved[6].id, 'new-one');
  assert.match(r.json.shas.projects, /^[0-9a-f]{40}$/);
  assert.equal(r.json.uploaded, 1);
  // الصورة المرفوعة بايتات مطابقة تماماً (لا إعادة ترميز → لا فقدان شفافية)
  assert.ok(fake.read('public/assets/projects/new-one-hero-abc.png').equals(Buffer.from(PNG_B64, 'base64')));
  // الملف الناتج مرتب ومقروء في GitHub
  assert.ok(fake.read('public/data/projects.json').toString('utf8').endsWith('}\n]\n'));
});

test('save: a second save with the returned sha works (no reload needed)', async () => {
  const r1 = await call(save, { method: 'POST', headers: auth(token), body: { files: { projects: { baseSha: shas.projects, data: projects.slice(0, 5) } } } });
  assert.equal(r1.status, 200);
  const r2 = await call(save, { method: 'POST', headers: auth(token), body: { files: { projects: { baseSha: r1.json.shas.projects, data: projects.slice(0, 4) } } } });
  assert.equal(r2.status, 200);
  assert.equal(JSON.parse(fake.read('public/data/projects.json').toString()).length, 4);
});

test('save: delete project + its orphan image together', async () => {
  const remaining = projects.filter((p) => p.id !== 'hofra');
  const r = await call(save, {
    method: 'POST', headers: auth(token),
    body: { files: { projects: { baseSha: shas.projects, data: remaining } }, deletes: ['assets/projects/hofra-hero.jpg'] }
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.removed, 1);
  assert.equal(fake.has('public/assets/projects/hofra-hero.jpg'), false);
  assert.equal(JSON.parse(fake.read('public/data/projects.json').toString()).length, 5);
});

test('save: refuses to delete an image still used by a project', async () => {
  const r = await call(save, {
    method: 'POST', headers: auth(token),
    body: { files: { projects: { baseSha: shas.projects, data: projects } }, deletes: ['assets/projects/hofra-hero.jpg'] }
  });
  assert.equal(r.status, 400);
  assert.equal(fake.has('public/assets/projects/hofra-hero.jpg'), true);
});

test('save: refuses a project pointing to an image that does not exist', async () => {
  const data2 = projects.map((p, i) => (i === 0 ? Object.assign({}, p, { heroImg: 'assets/projects/ghost.jpg' }) : p));
  const r = await call(save, { method: 'POST', headers: auth(token), body: { files: { projects: { baseSha: shas.projects, data: data2 } } } });
  assert.equal(r.status, 400);
});

test('save: conflict when someone else changed the file → 409, nothing overwritten', async () => {
  fake.externalEdit('public/data/projects.json', '[]\n');
  const before = fake.commitCount();
  const r = await call(save, { method: 'POST', headers: auth(token), body: { files: { projects: { baseSha: shas.projects, data: projects } } } });
  assert.equal(r.status, 409);
  assert.equal(r.json.conflict, true);
  assert.equal(fake.commitCount(), before);
  assert.equal(fake.read('public/data/projects.json').toString(), '[]\n');
});

test('save: concurrent push right before ref update → 409', async () => {
  fake.beforeRefUpdate = (f) => f.externalEdit('README.md', 'hi');
  const edited = projects.map((p, i) => (i === 0 ? Object.assign({}, p, { title: 'تغيير' }) : p));
  const r = await call(save, { method: 'POST', headers: auth(token), body: { files: { projects: { baseSha: shas.projects, data: edited } } } });
  assert.equal(r.status, 409);
});

test('save: no real change → unchanged, no commit', async () => {
  const before = fake.commitCount();
  const r = await call(save, { method: 'POST', headers: auth(token), body: { files: { projects: { baseSha: shas.projects, data: projects } } } });
  assert.equal(r.status, 200);
  assert.equal(r.json.unchanged, true);
  assert.equal(fake.commitCount(), before);
});

test('save: requires auth', async () => {
  const r = await call(save, { method: 'POST', body: { files: { projects } } });
  assert.equal(r.status, 401);
});

test('save: validation rejects bad input and writes nothing', async () => {
  const before = fake.commitCount();
  const bads = [
    { id: 'x', mutate: (p) => Object.assign({}, p, { color: 'red' }) },
    { id: 'x', mutate: (p) => Object.assign({}, p, { status: 'weird' }) },
    { id: 'Bad ID!', mutate: (p) => p },
    { id: 'x', mutate: (p) => Object.assign({}, p, { title: '' }) },
    { id: 'x', mutate: (p) => Object.assign({}, p, { link: 'javascript:alert(1)' }) },
    { id: 'x', mutate: (p) => Object.assign({}, p, { heroImg: '../../etc/passwd' }) },
    { id: 'x', mutate: (p) => Object.assign({}, p, { heroImg: 'assets/projects/a.svg' }) },
    { id: 'x', mutate: (p) => Object.assign({}, p, { tech: 'not-an-array' }) },
    { id: 'x', mutate: (p) => Object.assign({}, p, { title: 'x'.repeat(500) }) }
  ];
  for (const b of bads) {
    const np = b.mutate(Object.assign({}, projects[0], { id: b.id }));
    const r = await call(save, { method: 'POST', headers: auth(token), body: { files: { projects: { baseSha: shas.projects, data: [np] } } } });
    assert.equal(r.status, 400, JSON.stringify(np).slice(0, 80));
  }
  // معرّف مكرر
  const dup = await call(save, { method: 'POST', headers: auth(token), body: { files: { projects: { baseSha: shas.projects, data: [projects[0], projects[0]] } } } });
  assert.equal(dup.status, 400);
  assert.equal(fake.commitCount(), before);
});

test('save: upload validation (path, magic bytes, extension, size, unknown file keys)', async () => {
  const send = (body) => call(save, { method: 'POST', headers: auth(token), body });
  assert.equal((await send({ uploads: [{ path: 'index.html', base64: PNG_B64 }] })).status, 400);
  assert.equal((await send({ uploads: [{ path: 'assets/projects/../../x.png', base64: PNG_B64 }] })).status, 400);
  assert.equal((await send({ uploads: [{ path: 'assets/projects/a.png', base64: JPG_B64 }] })).status, 400); // محتوى jpg بامتداد png
  assert.equal((await send({ uploads: [{ path: 'assets/projects/a.jpg', base64: Buffer.from('<svg onload=alert(1)>').toString('base64') }] })).status, 400);
  assert.equal((await send({ uploads: [{ path: 'assets/projects/big.jpg', base64: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(3.2 * 1024 * 1024)]).toString('base64') }] })).status, 400);
  assert.equal((await send({ files: { secrets: { data: [] } } })).status, 400);
  assert.equal((await send({})).status, 400);
  assert.equal((await send({ deletes: ['data/projects.json'] })).status, 400);
});

test('save: journey + faq edits go through the same commit', async () => {
  const d = await call(data, { headers: auth(token) });
  const j = d.json.files.journey.data.slice(1);
  const f = d.json.files.faq.data.concat([{ q: 'سؤال جديد؟', a: 'جواب' }]);
  const before = fake.commitCount();
  const r = await call(save, {
    method: 'POST', headers: auth(token),
    body: { files: { journey: { baseSha: d.json.files.journey.sha, data: j }, faq: { baseSha: d.json.files.faq.sha, data: f } } }
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(fake.commitCount(), before + 1);
  assert.equal(JSON.parse(fake.read('public/data/journey.json').toString()).length, 3);
  assert.equal(JSON.parse(fake.read('public/data/faq.json').toString()).length, 5);
});

test('github errors are translated to friendly messages', async () => {
  fake.failStatus = 401;
  let r = await call(data, { headers: auth(token) });
  assert.equal(r.status, 502);
  assert.match(r.json.error, /GITHUB_TOKEN/);
  fake.failStatus = 403;
  r = await call(data, { headers: auth(token) });
  assert.match(r.json.error, /Contents/);
  fake.failStatus = 404;
  r = await call(data, { headers: auth(token) });
  assert.match(r.json.error, /GITHUB_REPO/);
});
