'use strict';

const { rGet } = require('./_redis');
const { requireAccount, genKey, genListKey } = require('./_auth');
const { Packer } = require('docx');
const { buildDocument } = require('../skills/brand-strategy-docx/src/builder');

// POST /api/auth -- login + resume state. Returns credits and the full history
// of past generations (each "Tạo file mới" keeps its own record + lượt sửa)
// so the client can offer "tải lại file / sửa tiếp" for any of them, not just
// the most recent, after the customer closed the tab.
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Method not allowed' });
    return;
  }
  try {
    const { account, error } = await requireAccount(req);
    if (error) {
      res.status(error.status).json({ ok: false, message: error.message });
      return;
    }

    // action 'download': rebuild a specific past generation's docx (by genId)
    // so the customer can re-download after closing the tab, with no extra
    // Claude calls.
    if (req.body.action === 'download') {
      const genId = String(req.body.genId || '').trim();
      if (!genId) {
        res.status(400).json({ ok: false, message: 'Thiếu genId — chưa rõ tải file nào.' });
        return;
      }
      const gen = await rGet(genKey(account.email, genId));
      if (!gen || !gen.generated) {
        res.status(404).json({ ok: false, message: 'Không tìm thấy file này.' });
        return;
      }
      const doc = buildDocument(gen.intake, gen.generated);
      const buffer = await Packer.toBuffer(doc);
      res.status(200).json({
        ok: true,
        filename: gen.filename,
        base64: buffer.toString('base64'),
        revisionsRemaining: Math.max(0, 3 - (gen.revisionsUsed || 0)),
      });
      return;
    }

    const list = (await rGet(genListKey(account.email))) || [];
    res.status(200).json({
      ok: true,
      email: account.email,
      name: account.name || '',
      credits: account.credits || 0,
      generations: list.map((g) => ({
        genId: g.genId,
        brandName: g.brandName,
        filename: g.filename,
        createdAt: g.createdAt,
        revisionsUsed: g.revisionsUsed || 0,
        revisionsRemaining: Math.max(0, 3 - (g.revisionsUsed || 0)),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: err.message || 'Lỗi máy chủ' });
  }
};
