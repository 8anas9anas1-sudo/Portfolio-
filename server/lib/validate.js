'use strict';
/* التحقق من البيانات في الخادم — حتى لو تعطّلت اللوحة أو تلاعب أحد بالطلب، لا يُكتب في GitHub إلا بيانات سليمة */
const { HttpError } = require('./http');

/* ⚠️ هذه القوائم مكرّرة في admin/admin.js — عدّلهما معاً */
const ICONS = ['store', 'gamepad', 'book', 'brain', 'traffic', 'layout', 'sparkle', 'rocket', 'message', 'search'];
const STATUSES = ['live', 'developing', 'pending'];

const IMG_RE = /^assets\/projects\/[a-z0-9][a-z0-9._-]{0,90}\.(jpg|png|webp)$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

const bad = (msg) => { throw new HttpError(400, msg); };

function str(v, name, max, required) {
  if (v === null || v === undefined) v = '';
  if (typeof v !== 'string') bad('الحقل «' + name + '» يجب أن يكون نصاً');
  v = v.replace(/\r\n/g, '\n').trim();
  if (required && !v) bad('الحقل «' + name + '» مطلوب');
  if (v.length > max) bad('الحقل «' + name + '» أطول من ' + max + ' حرف');
  return v;
}
function url(v, name) {
  v = str(v, name, 500);
  if (!v) return null;
  if (!/^https?:\/\/[^\s"'<>]+$/i.test(v)) bad('رابط «' + name + '» غير صالح — يجب أن يبدأ بـ https://');
  return v;
}
function img(v, name) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' || !IMG_RE.test(v)) bad('مسار صورة «' + name + '» غير صالح');
  return v;
}
function color(v, name) {
  if (typeof v !== 'string' || !COLOR_RE.test(v)) bad('اللون في «' + name + '» غير صالح (مثال: #00E5FF)');
  return v;
}
function arr(v, name, maxItems) {
  if (!Array.isArray(v)) bad('«' + name + '» يجب أن تكون قائمة');
  if (v.length > maxItems) bad('«' + name + '» فيها عناصر أكثر من المسموح (' + maxItems + ')');
  return v;
}
function strList(v, name, maxItems, maxLen) {
  return arr(v === undefined ? [] : v, name, maxItems).map((x) => str(x, name, maxLen)).filter(Boolean);
}

function validateProjects(input) {
  const seen = new Set();
  return arr(input, 'المشاريع', 60).map((p, i) => {
    if (!p || typeof p !== 'object') bad('مشروع رقم ' + (i + 1) + ' غير صالح');
    const id = str(p.id, 'المعرّف', 41, true);
    if (!SLUG_RE.test(id)) bad('المعرّف «' + id + '» يجب أن يكون حروف إنجليزية صغيرة وأرقام وشرطات فقط');
    if (seen.has(id)) bad('المعرّف «' + id + '» مكرر');
    seen.add(id);
    const title = str(p.title, 'العنوان', 80, true);
    const status = p.status;
    if (!STATUSES.includes(status)) bad('حالة المشروع «' + title + '» غير صالحة');
    const icon = ICONS.includes(p.icon) ? p.icon : 'sparkle';
    return {
      id,
      title,
      en: str(p.en, 'الاسم الإنجليزي', 100),
      tag: str(p.tag, 'الوصف القصير', 120),
      status,
      color: color(p.color, title),
      icon,
      tech: strList(p.tech, 'التقنيات', 15, 40),
      summary: str(p.summary, 'الملخص', 400),
      overview: str(p.overview, 'نظرة عامة', 3000),
      role: str(p.role, 'دوري', 3000),
      details: strList(p.details, 'المميزات', 30, 800),
      link: url(p.link, 'رابط المشروع'),
      linkLabel: str(p.linkLabel, 'نص الزر', 80),
      github: url(p.github, 'رابط GitHub'),
      heroImg: img(p.heroImg, 'الغلاف'),
      logoImg: img(p.logoImg, 'الشعار')
    };
  });
}

function validateJourney(input) {
  return arr(input, 'المحطات', 30).map((it, i) => {
    if (!it || typeof it !== 'object') bad('محطة رقم ' + (i + 1) + ' غير صالحة');
    return {
      color: color(it.color, 'المحطة ' + (i + 1)),
      year: str(it.year, 'التسمية', 40, true),
      title: str(it.title, 'عنوان المحطة', 100, true),
      desc: str(it.desc, 'وصف المحطة', 600)
    };
  });
}

function validateFaq(input) {
  return arr(input, 'الأسئلة', 40).map((it, i) => {
    if (!it || typeof it !== 'object') bad('سؤال رقم ' + (i + 1) + ' غير صالح');
    return { q: str(it.q, 'السؤال', 200, true), a: str(it.a, 'الجواب', 1500, true) };
  });
}

/* الموقع كله داخل مجلد public/ في الريبو — المسارات في JSON نسبية لجذر الموقع (assets/projects/x.jpg) */
const PUBLIC_DIR = 'public';
const repoPath = (sitePath) => PUBLIC_DIR + '/' + sitePath;
const sitePath = (repoP) => repoP.slice(PUBLIC_DIR.length + 1);

const DATA = {
  projects: { path: repoPath('data/projects.json'), validate: validateProjects },
  journey: { path: repoPath('data/journey.json'), validate: validateJourney },
  faq: { path: repoPath('data/faq.json'), validate: validateFaq }
};

function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

function validateUploads(input) {
  const list = arr(input, 'الصور المرفوعة', 12);
  const seen = new Set();
  return list.map((u) => {
    if (!u || typeof u.path !== 'string' || !IMG_RE.test(u.path)) bad('مسار صورة مرفوعة غير صالح');
    if (seen.has(u.path)) bad('صورة مرفوعة مكررة: ' + u.path);
    seen.add(u.path);
    if (typeof u.base64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(u.base64)) bad('بيانات الصورة ' + u.path + ' غير صالحة');
    const buf = Buffer.from(u.base64, 'base64');
    if (buf.length > MAX_IMAGE_BYTES) bad('الصورة ' + u.path + ' أكبر من 3MB');
    const kind = sniff(buf);
    const ext = u.path.split('.').pop();
    if (!kind || kind !== ext) bad('محتوى الصورة ' + u.path + ' لا يطابق امتدادها (مسموح jpg / png / webp)');
    return { path: u.path, base64: u.base64 };
  });
}

function validateDeletes(input) {
  const list = arr(input, 'الصور المحذوفة', 50);
  const seen = new Set();
  list.forEach((p) => {
    if (typeof p !== 'string' || !IMG_RE.test(p)) bad('مسار صورة محذوفة غير صالح');
    seen.add(p);
  });
  return [...seen];
}

function imageRefs(projects) {
  const s = new Set();
  projects.forEach((p) => { if (p.heroImg) s.add(p.heroImg); if (p.logoImg) s.add(p.logoImg); });
  return s;
}

module.exports = { DATA, ICONS, STATUSES, PUBLIC_DIR, repoPath, sitePath, validateUploads, validateDeletes, imageRefs };
