'use strict';
const { HttpError } = require('./http');

/* كل الأسرار تأتي من Environment Variables في Vercel — لا شيء داخل الكود */
function getConfig() {
  const password = process.env.ADMIN_PASSWORD || '';
  const token = process.env.GITHUB_TOKEN || '';
  const repo = process.env.GITHUB_REPO || '';
  const branch = process.env.GITHUB_BRANCH || 'main';

  const missing = [];
  if (!password) missing.push('ADMIN_PASSWORD');
  if (!token) missing.push('GITHUB_TOKEN');
  if (!repo) missing.push('GITHUB_REPO');
  if (missing.length) {
    throw new HttpError(500, 'الخادم غير مهيّأ — ناقص في Vercel Environment Variables: ' + missing.join(', '));
  }
  if (password.length < 10) {
    throw new HttpError(500, 'ADMIN_PASSWORD قصيرة — استخدم 10 أحرف على الأقل (الأفضل جملة طويلة)');
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new HttpError(500, 'قيمة GITHUB_REPO غير صحيحة — الشكل المطلوب: owner/repo');
  }
  if (!/^[A-Za-z0-9_./-]{1,100}$/.test(branch) || branch.includes('..')) {
    throw new HttpError(500, 'قيمة GITHUB_BRANCH غير صحيحة');
  }
  return { password, token, repo, branch };
}

module.exports = { getConfig };
