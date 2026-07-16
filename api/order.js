'use strict';

const { rGet, rSet } = require('./_redis');
const { normalizeEmail, normalizePhone, acctKey } = require('./_auth');

// Single package: 99k = 1 lần tạo file + 3 lần sửa. First payment creates the
// account, later payments add +1 credit. (The 450k combo — Bella App + trợ lý
// ChatGPT kịch bản — is sold separately at bella-gallery.vercel.app.)
const PRICE = 99000;

function orderKey(code) {
  return `bsa:order:${code}`;
}

// POST /api/order -- create a pending order and return SePay QR info.
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Method not allowed' });
    return;
  }
  try {
    const { name, email, phone } = req.body || {};
    const normEmail = normalizeEmail(email);
    const normPhone = normalizePhone(phone);
    if (!name || !normEmail || !normPhone) {
      res.status(400).json({ ok: false, message: 'Vui lòng điền đủ họ tên, email và số điện thoại.' });
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normEmail)) {
      res.status(400).json({ ok: false, message: 'Email không hợp lệ.' });
      return;
    }
    if (!/^0\d{9,10}$/.test(normPhone)) {
      res.status(400).json({ ok: false, message: 'Số điện thoại không hợp lệ (VD: 0912345678).' });
      return;
    }

    const existing = await rGet(acctKey(normEmail));
    const orderKind = existing ? 'topup' : 'new'; // display only — same price
    const amount = PRICE;

    const code = `BSA${Math.floor(1000 + Math.random() * 9000)}`;
    const order = {
      name: String(name).trim(),
      email: normEmail,
      phone: normPhone,
      amount,
      kind: orderKind,
      status: 'pending',
      createdAt: Date.now(),
    };
    await rSet(orderKey(code), order, 7200); // TTL 2h, same as kit pattern

    const bank = process.env.SEPAY_BANK;
    const account = process.env.SEPAY_ACCOUNT;
    if (!bank || !account) {
      res.status(500).json({ ok: false, message: 'Server chưa cấu hình SEPAY_BANK / SEPAY_ACCOUNT.' });
      return;
    }
    const qrUrl = `https://qr.sepay.vn/img?acc=${encodeURIComponent(account)}&bank=${encodeURIComponent(bank)}&amount=${amount}&des=${code}`;

    res.status(200).json({ ok: true, code, amount, kind: orderKind, qrUrl, bank, account });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: err.message || 'Lỗi máy chủ' });
  }
};

module.exports.orderKey = orderKey;
module.exports.PRICE = PRICE;
