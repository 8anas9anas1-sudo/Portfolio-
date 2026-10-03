'use strict';
const crypto = require('crypto');
const { HttpError } = require('./http');

const TTL_MS = 12 * 60 * 60 * 1000; // الجلسة 12 ساعة

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest();

/* مفتاح التوقيع مشتق من كلمة السر + توكن GitHub: تغيير أيٍّ منهما يُسقط كل الجلسات القديمة */
function signingKey(cfg) {
  return sha256('portfolio-admin|' + cfg.password + '|' + cfg.token);
}

function checkPassword(cfg, input) {
  if (typeof input !== 'string' || !input) return false;
  return crypto.timingSafeEqual(sha256(input), sha256(cfg.password));
}

function issueToken(cfg) {
  const exp = Date.now() + TTL_MS;
  const payload = b64u(JSON.stringify({ exp, v: 1 }));
  const sig = b64u(crypto.createHmac('sha256', signingKey(cfg)).update(payload).digest());
  return { token: payload + '.' + sig, exp };
}

function verifyToken(cfg, token) {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const expected = crypto.createHmac('sha256', signingKey(cfg)).update(parts[0]).digest();
  let given;
  try { given = fromB64u(parts[1]); } catch (e) { return false; }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return false;
  try {
    const p = JSON.parse(fromB64u(parts[0]).toString('utf8'));
    return typeof p.exp === 'number' && p.exp > Date.now();
  } catch (e) { return false; }
}

function requireAuth(req, cfg) {
  const h = req.headers['authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m || !verifyToken(cfg, m[1].trim())) {
    throw new HttpError(401, 'انتهت الجلسة — سجّل الدخول من جديد');
  }
}

module.exports = { checkPassword, issueToken, verifyToken, requireAuth };
