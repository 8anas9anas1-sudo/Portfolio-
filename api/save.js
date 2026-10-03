'use strict';
const { handler, send, readJSON, HttpError } = require('../server/lib/http');
const { getConfig } = require('../server/lib/config');
const { requireAuth } = require('../server/lib/auth');
const gh = require('../server/lib/github');
const { DATA, repoPath, sitePath, validateUploads, validateDeletes, imageRefs } = require('../server/lib/validate');

const bad = (m) => { throw new HttpError(400, m); };
const pretty = (data) => JSON.stringify(data, null, 2) + '\n';

/*
  POST /api/save
  { files: { projects: { baseSha, data:[…] }, journey:{…}, faq:{…} },
    uploads: [{ path, base64 }], deletes: [path] }
  كل شيء يُحفظ في commit واحد → نشر واحد على Vercel.
*/
module.exports = handler('POST', async (req, res) => {
  const cfg = getConfig();
  requireAuth(req, cfg);
  const body = await readJSON(req);

  const filesIn = body.files && typeof body.files === 'object' ? body.files : {};
  const keys = Object.keys(filesIn);
  const incoming = {};
  keys.forEach((k) => {
    if (!DATA[k]) bad('ملف بيانات غير معروف: ' + k);
    const f = filesIn[k];
    if (!f || typeof f !== 'object') bad('بيانات «' + k + '» غير صالحة');
    incoming[k] = {
      baseSha: typeof f.baseSha === 'string' && f.baseSha ? f.baseSha : null,
      data: DATA[k].validate(f.data)
    };
  });
  const uploads = validateUploads(body.uploads || []);
  const deletes = validateDeletes(body.deletes || []);
  if (!keys.length && !uploads.length && !deletes.length) bad('لا توجد تغييرات للحفظ');

  // 1) لقطة ثابتة من الفرع الآن، وكل فحوصاتنا تتم عليها
  const head = await gh.headCommit(cfg);
  const needProjectsRead = !incoming.projects && (uploads.length || deletes.length);
  const [dirList, projectsNow, ...current] = await Promise.all([
    gh.listDir(cfg, repoPath('assets/projects'), head.commitSha),
    needProjectsRead ? gh.readFile(cfg, DATA.projects.path, head.commitSha) : Promise.resolve(null),
    ...keys.map((k) => gh.readFile(cfg, DATA[k].path, head.commitSha))
  ]);

  // 2) تعارض: لو تغيّر الملف في GitHub بعد ما حمّلته اللوحة → نرفض بدل أن نكتب فوق عمل ضاع
  const conflicts = keys.filter((k, i) => ((current[i] && current[i].sha) || null) !== incoming[k].baseSha);
  if (conflicts.length) {
    throw new HttpError(409, 'تم تعديل البيانات من مكان آخر بعد ما فتحت اللوحة — أعد التحميل ثم كرّر التعديل', { conflict: true, files: conflicts });
  }

  // 3) سلامة الصور: ما نكسر موقعك بمسار صورة غير موجود
  const existing = new Set(dirList.map((f) => sitePath(f.path)));
  const finalImages = new Set([...existing, ...uploads.map((u) => u.path)]);
  deletes.forEach((p) => finalImages.delete(p));
  let projectsData = null;
  if (incoming.projects) projectsData = incoming.projects.data;
  else if (projectsNow) { try { projectsData = JSON.parse(projectsNow.text); } catch (e) { projectsData = []; } }
  if (projectsData) {
    for (const ref of imageRefs(projectsData)) {
      if (!finalImages.has(ref)) bad('الصورة «' + ref + '» غير موجودة في المستودع (أو محذوفة وما زالت مستخدمة)');
    }
  }

  // 4) جهّز الملفات للـ commit
  const changes = [];
  const shas = {};
  keys.forEach((k, i) => {
    const text = pretty(incoming[k].data);
    if (current[i] && current[i].text === text) { shas[k] = current[i].sha; return; } // لا تغيير فعلي
    changes.push({ path: DATA[k].path, text, key: k });
  });
  uploads.forEach((u) => changes.push({ path: repoPath(u.path), base64: u.base64 }));
  const removable = deletes.filter((p) => existing.has(p));
  removable.forEach((p) => changes.push({ path: repoPath(p), remove: true }));

  if (!changes.length) return send(res, 200, { ok: true, unchanged: true, shas });

  const parts = [];
  const changedKeys = changes.filter((c) => c.key).map((c) => c.key);
  if (changedKeys.length) parts.push('update ' + changedKeys.join(', '));
  if (uploads.length) parts.push('+' + uploads.length + ' image' + (uploads.length > 1 ? 's' : ''));
  if (removable.length) parts.push('-' + removable.length + ' image' + (removable.length > 1 ? 's' : ''));
  const message = 'admin: ' + parts.join(', ');

  const out = await gh.commitFiles(cfg, head, changes.map(({ path, text, base64, remove }) => ({ path, text, base64, remove })), message);
  keys.forEach((k) => { if (out.shas[DATA[k].path]) shas[k] = out.shas[DATA[k].path]; });

  send(res, 200, {
    ok: true,
    commit: out.commitSha,
    commitUrl: 'https://github.com/' + cfg.repo + '/commit/' + out.commitSha,
    shas,
    uploaded: uploads.length,
    removed: removable.length
  });
});
