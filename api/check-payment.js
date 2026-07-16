'use strict';

const { rGet } = require('./_redis');

// GET /api/check-payment?code=BSA1234 -- polled by buy.html every 3s.
module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const code = (req.query && req.query.code) || url.searchParams.get('code');
    if (!code) {
      res.status(400).json({ ok: false, message: 'Thiếu mã đơn' });
      return;
    }
    const order = await rGet(`bsa:order:${code}`);
    if (!order) {
      res.status(200).json({ ok: true, status: 'unknown' });
      return;
    }
    res.status(200).json({ ok: true, status: order.status, email: order.email, kind: order.kind });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: err.message || 'Lỗi máy chủ' });
  }
};
