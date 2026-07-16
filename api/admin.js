'use strict';

const { rGet, rSet, rDel } = require('./_redis');
const { normalizeEmail, normalizePhone, acctKey, genKey, genListKey } = require('./_auth');
const { sendAccountEmail } = require('./_email');

// Founder-only backup console (webhook hiccups, wrong transfer syntax, refunds).
// Auth: x-admin-secret header compared to ADMIN_SECRET env var.
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Method not allowed' });
    return;
  }
  const secret = process.env.ADMIN_SECRET;
  if (!secret || req.headers['x-admin-secret'] !== secret) {
    res.status(401).json({ ok: false, message: 'Sai admin secret' });
    return;
  }

  try {
    const { action, email, phone, name, credits } = req.body || {};
    const normEmail = normalizeEmail(email);

    if (action === 'create') {
      if (!normEmail || !phone) {
        res.status(400).json({ ok: false, message: 'Cần email và phone' });
        return;
      }
      const existing = await rGet(acctKey(normEmail));
      if (existing) {
        res.status(409).json({ ok: false, message: 'Tài khoản đã tồn tại — dùng action "credit" để cộng lượt' });
        return;
      }
      const account = {
        email: normEmail,
        phone: normalizePhone(phone),
        name: name || '',
        credits: Number(credits) || 1,
        createdAt: new Date().toISOString(),
        purchases: [{ amount: 0, code: 'ADMIN', at: new Date().toISOString() }],
      };
      await rSet(acctKey(normEmail), account);
      await sendAccountEmail({ to: account.email, name: account.name, phone: account.phone, credits: account.credits });
      res.status(200).json({ ok: true, account });
      return;
    }

    if (action === 'credit') {
      const account = await rGet(acctKey(normEmail));
      if (!account) {
        res.status(404).json({ ok: false, message: 'Không tìm thấy tài khoản' });
        return;
      }
      account.credits = (account.credits || 0) + (Number(credits) || 1);
      account.purchases = account.purchases || [];
      account.purchases.push({ amount: 0, code: 'ADMIN', at: new Date().toISOString() });
      await rSet(acctKey(normEmail), account);
      await sendAccountEmail({ to: account.email, name: account.name, phone: account.phone, credits: account.credits });
      res.status(200).json({ ok: true, account });
      return;
    }

    if (action === 'view') {
      const account = await rGet(acctKey(normEmail));
      if (!account) {
        res.status(404).json({ ok: false, message: 'Không tìm thấy tài khoản' });
        return;
      }
      const list = (await rGet(genListKey(normEmail))) || [];
      res.status(200).json({
        ok: true,
        account,
        generations: list.map((g) => ({
          genId: g.genId,
          brandName: g.brandName,
          filename: g.filename,
          createdAt: g.createdAt,
          revisionsUsed: g.revisionsUsed || 0,
        })),
      });
      return;
    }

    if (action === 'delete') {
      const list = (await rGet(genListKey(normEmail))) || [];
      await Promise.all(list.map((g) => rDel(genKey(normEmail, g.genId))));
      await rDel(genListKey(normEmail));
      await rDel(acctKey(normEmail));
      res.status(200).json({ ok: true, message: `Đã xoá ${normEmail} (${list.length} file lịch sử)` });
      return;
    }

    res.status(400).json({ ok: false, message: 'action phải là create | credit | view | delete' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: err.message || 'Lỗi máy chủ' });
  }
};
