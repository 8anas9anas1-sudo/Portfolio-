'use strict';
/* أدوات HTTP صغيرة مشتركة بين كل نقاط الـ API */

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra || null;
  }
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

const MAX_BODY = 4.4 * 1024 * 1024; // حد Vercel للطلب ~4.5MB

async function readJSON(req) {
  let raw = req.body;
  if (raw === undefined) {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > MAX_BODY) throw new HttpError(413, 'حجم الطلب كبير جداً — احفظ على دفعات أصغر أو صغّر الصور');
      chunks.push(c);
    }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(raw)) raw = raw.toString('utf8');
  if (typeof raw === 'string') {
    if (!raw.trim()) return {};
    try { return JSON.parse(raw); } catch (e) { throw new HttpError(400, 'JSON غير صالح'); }
  }
  if (raw && typeof raw === 'object') return raw;
  return {};
}

/** يغلّف المعالج: حماية الأخطاء + ترجمة أخطاء GitHub لرسائل مفهومة */
function handler(method, fn) {
  return async function (req, res) {
    try {
      if (req.method !== method) {
        res.setHeader('Allow', method);
        throw new HttpError(405, 'طريقة الطلب غير مسموحة');
      }
      await fn(req, res);
    } catch (err) {
      if (err instanceof HttpError) {
        return send(res, err.status, Object.assign({ error: err.message }, err.extra || {}));
      }
      if (err && err.isGitHub) {
        const s = err.status;
        let msg = 'خطأ من GitHub: ' + err.message;
        if (s === 401) msg = 'توكن GitHub مرفوض أو منتهي — جدّد GITHUB_TOKEN في إعدادات Vercel';
        else if (s === 403) msg = 'توكن GitHub لا يملك صلاحية Contents: Read and write على هذا الريبو (أو تجاوزت الحد المؤقت)';
        else if (s === 404) msg = 'لم أجد الريبو أو الفرع — تأكد من GITHUB_REPO و GITHUB_BRANCH وأن التوكن يملك وصولاً لهذا الريبو';
        else if (s === 409 || s === 422) msg = 'تعذّر الحفظ بسبب تعارض في GitHub — أعد التحميل وحاول مرة ثانية';
        return send(res, s === 409 || s === 422 ? 409 : 502, { error: msg, github: err.message });
      }
      console.error('[api] unexpected error:', err);
      return send(res, 500, { error: 'خطأ غير متوقع في الخادم' });
    }
  };
}

module.exports = { HttpError, send, readJSON, handler };
