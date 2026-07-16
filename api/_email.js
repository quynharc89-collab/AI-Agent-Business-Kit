'use strict';

// Reuses the same Google Apps Script mail-relay pattern already running for
// bella-gallery (output/bella-gallery/api/send-email.js) instead of adding a
// new email provider/dependency. The Apps Script's doPost must accept
// `to`, `subject`, `body` form fields and call MailApp.sendEmail(to, subject, body).
const APP_URL = 'https://brand-strategy-assistant.vercel.app';

async function sendMail({ to, subject, body }) {
  const gasUrl = process.env.MAIL_GAS_URL;
  if (!gasUrl) {
    console.warn('MAIL_GAS_URL chưa cấu hình — bỏ qua gửi mail.');
    return;
  }
  try {
    const params = new URLSearchParams({ to, subject, body });
    // Form-encoded + follow redirect: GAS webapps respond with a 302 before
    // reaching the actual script, same workaround as send-email.js.
    await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      redirect: 'follow',
    });
  } catch (e) {
    console.error('Gửi mail thất bại:', e.message);
  }
}

function sendAccountEmail({ to, name, phone, credits }) {
  const subject = 'Tài khoản Trợ lý xây Chiến Lược Thương Hiệu của bạn';
  const body = [
    `Chào ${name || 'anh/chị'},`,
    '',
    'Tài khoản của bạn đã sẵn sàng để tạo file chiến lược thương hiệu:',
    '',
    `- Đăng nhập tại: ${APP_URL}`,
    `- Email (tên đăng nhập): ${to}`,
    `- Mật khẩu: số điện thoại ${phone} bạn đã dùng khi mua`,
    `- Số lượt tạo file hiện có: ${credits}`,
    '',
    'Cảm ơn anh/chị đã tin tưởng!',
  ].join('\n');
  return sendMail({ to, subject, body });
}

module.exports = { sendMail, sendAccountEmail };
