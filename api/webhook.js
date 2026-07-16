'use strict';

const { rGet, rSet } = require('./_redis');
const { acctKey } = require('./_auth');
const { sendAccountEmail } = require('./_email');

// SePay payment webhook. Anti-fraud follows the kit's payment-automation
// pattern -- an order is only marked paid when ALL THREE hold:
//   1. transferType === 'in'
//   2. transferAmount >= order amount
//   3. transfer content contains the personalised order code
// Account creation/credit happens here, server-side only.
async function notifyTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (e) {
    console.error('Telegram notify failed:', e.message);
  }
}

function extractOrderCode(content) {
  const match = String(content || '').toUpperCase().match(/BSA\d{4}/);
  return match ? match[0] : null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Method not allowed' });
    return;
  }
  // Webhook authentication: without this, anyone could create an order and
  // then POST a fake "paid" payload to self-activate without paying. Set the
  // same key in SePay dashboard (Chứng thực -> API Key).
  const webhookKey = process.env.SEPAY_WEBHOOK_KEY;
  if (webhookKey) {
    const authHeader = req.headers.authorization || '';
    if (authHeader !== `Apikey ${webhookKey}`) {
      res.status(401).json({ ok: false, message: 'Unauthorized' });
      return;
    }
  }
  try {
    const tx = req.body || {};
    // SePay payload fields: transferType ('in'/'out'), transferAmount,
    // content (transfer note), referenceCode...
    if (tx.transferType !== 'in') {
      res.status(200).json({ ok: true, skipped: 'not incoming' });
      return;
    }

    const code = extractOrderCode(tx.content);
    if (!code) {
      await notifyTelegram(`⚠️ BSA: nhận ${(tx.transferAmount || 0).toLocaleString('vi-VN')}đ nhưng nội dung CK không có mã đơn: "${tx.content || ''}" — cần xử lý tay qua /admin.html`);
      res.status(200).json({ ok: true, skipped: 'no order code' });
      return;
    }

    const orderKey = `bsa:order:${code}`;
    const order = await rGet(orderKey);
    if (!order) {
      await notifyTelegram(`⚠️ BSA: mã đơn ${code} không tồn tại/đã hết hạn (nhận ${(tx.transferAmount || 0).toLocaleString('vi-VN')}đ, nội dung: "${tx.content || ''}") — xử lý tay qua /admin.html`);
      res.status(200).json({ ok: true, skipped: 'order not found' });
      return;
    }
    if (order.status === 'paid') {
      res.status(200).json({ ok: true, skipped: 'already paid' });
      return;
    }

    const amount = Number(tx.transferAmount) || 0;
    if (amount < order.amount) {
      await notifyTelegram(`⚠️ BSA: đơn ${code} (${order.email}) chuyển THIẾU tiền: nhận ${amount.toLocaleString('vi-VN')}đ / cần ${order.amount.toLocaleString('vi-VN')}đ — chưa kích hoạt, xử lý tay.`);
      res.status(200).json({ ok: true, skipped: 'insufficient amount' });
      return;
    }

    // Create or credit the account.
    const key = acctKey(order.email);
    let account = await rGet(key);
    const purchase = { amount, code, at: new Date().toISOString() };
    if (!account) {
      account = {
        email: order.email,
        phone: order.phone,
        name: order.name,
        credits: 1,
        createdAt: new Date().toISOString(),
        purchases: [purchase],
      };
    } else {
      account.credits = (account.credits || 0) + 1;
      account.purchases = account.purchases || [];
      account.purchases.push(purchase);
    }
    await rSet(key, account);

    order.status = 'paid';
    await rSet(orderKey, order, 7200);

    await Promise.all([
      notifyTelegram([
        '✅ BSA: đơn thanh toán thành công',
        `Gói: ${order.kind === 'new' ? 'Khách mới (99k)' : 'Mua thêm lượt (99k)'}`,
        `Tên: ${order.name}`,
        `Email: ${order.email}`,
        `SĐT: ${order.phone}`,
        `Mã đơn: ${code} | Nhận: ${amount.toLocaleString('vi-VN')}đ`,
        `Lượt hiện có: ${account.credits}`,
      ].join('\n')),
      sendAccountEmail({ to: order.email, name: order.name, phone: order.phone, credits: account.credits }),
    ]);

    res.status(200).json({ ok: true, activated: order.email, credits: account.credits });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: err.message || 'Lỗi máy chủ' });
  }
};
