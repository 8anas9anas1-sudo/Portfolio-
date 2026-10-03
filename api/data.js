'use strict';
const { handler, send, HttpError } = require('../server/lib/http');
const { getConfig } = require('../server/lib/config');
const { requireAuth } = require('../server/lib/auth');
const { readFile } = require('../server/lib/github');
const { DATA } = require('../server/lib/validate');

/* يقرأ أحدث نسخة من ملفات البيانات مباشرة من GitHub (وليس من الموقع المنشور) حتى لا تظهر نسخة قديمة */
module.exports = handler('GET', async (req, res) => {
  const cfg = getConfig();
  requireAuth(req, cfg);
  const keys = Object.keys(DATA);
  const results = await Promise.all(keys.map((k) => readFile(cfg, DATA[k].path)));
  // لو كل الملفات غير موجودة فالمشكلة غالباً في اسم الريبو/الفرع — لا نعرض قوائم فارغة توحي أن بياناتك اختفت
  if (results.every((r) => !r)) {
    throw new HttpError(404, 'لم أجد ملفات data/*.json — تأكد من GITHUB_REPO و GITHUB_BRANCH وأن الملفات مرفوعة على GitHub');
  }
  const files = {};
  keys.forEach((k, i) => {
    const r = results[i];
    if (!r) { files[k] = { sha: null, data: [] }; return; }
    try {
      const data = JSON.parse(r.text);
      files[k] = { sha: r.sha, data: Array.isArray(data) ? data : [] };
    } catch (e) {
      throw new HttpError(500, 'ملف ' + DATA[k].path + ' تالف (JSON غير صالح) — أصلحه من GitHub');
    }
  });
  send(res, 200, { files, repo: cfg.repo, branch: cfg.branch });
});
