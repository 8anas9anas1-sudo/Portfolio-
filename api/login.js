'use strict';
const { handler, readJSON, HttpError } = require('../server/lib/http');
const { getConfig } = require('../server/lib/config');
const { checkPassword, issueToken } = require('../server/lib/auth');
const { send } = require('../server/lib/http');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = handler('POST', async (req, res) => {
  const cfg = getConfig();
  const body = await readJSON(req);
  if (!checkPassword(cfg, body.password)) {
    await sleep(900); // تبطيء المحاولات الخاطئة
    throw new HttpError(401, 'كلمة السر غير صحيحة');
  }
  const { token, exp } = issueToken(cfg);
  send(res, 200, { token, expiresAt: exp });
});
