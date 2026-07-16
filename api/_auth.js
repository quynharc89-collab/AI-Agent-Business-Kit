'use strict';

const { rGet } = require('./_redis');

// Login = email (username) + phone number (password) -- deliberately simple
// per founder's product decision. Normalize both so "0912 345 678" and
// "+84912345678" match what the webhook stored at purchase time.
function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizePhone(phone) {
  let p = String(phone || '').replace(/[\s.\-()]/g, '');
  if (p.startsWith('+84')) p = '0' + p.slice(3);
  else if (p.startsWith('84') && p.length >= 10) p = '0' + p.slice(2);
  return p;
}

function acctKey(email) {
  return `bsa:acct:${normalizeEmail(email)}`;
}

// Each "Tạo file mới" creates its own generation record, keyed by genId, so
// older files/revision-lượt are never overwritten. genListKey holds a
// lightweight index (newest first) so the login screen can list history
// without fetching every full generation blob (~100-200KB each).
function genKey(email, genId) {
  return `bsa:gen:${normalizeEmail(email)}:${genId}`;
}

function genListKey(email) {
  return `bsa:genlist:${normalizeEmail(email)}`;
}

// Returns { account } on success or { error: {status, message} }.
// Reads credentials from the request body so every endpoint can gate itself
// with one call; client keeps {email, phone} in localStorage after login.
async function requireAccount(req) {
  const body = req.body || {};
  const email = normalizeEmail(body.email);
  const phone = normalizePhone(body.phone);
  if (!email || !phone) {
    return { error: { status: 401, message: 'Vui lòng đăng nhập (email + số điện thoại).' } };
  }
  const account = await rGet(acctKey(email));
  if (!account || normalizePhone(account.phone) !== phone) {
    return { error: { status: 401, message: 'Email hoặc mật khẩu (số điện thoại) không đúng. Nếu bạn vừa mua, đợi 1-2 phút rồi thử lại.' } };
  }
  return { account };
}

module.exports = { requireAccount, normalizeEmail, normalizePhone, acctKey, genKey, genListKey };
