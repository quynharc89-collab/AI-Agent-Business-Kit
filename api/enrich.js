'use strict';

const { callTool, MODEL_HAIKU } = require('./_anthropic');
const { requireAccount } = require('./_auth');

const MAX_LINKS = 6;
const MAX_CHARS_PER_SOURCE = 4000;
const MAX_TOTAL_FILE_BYTES = 3 * 1024 * 1024; // base64-decoded

// SSRF guard: customer-supplied URLs are fetched server-side, so refuse
// anything that could point into private/internal networks.
function isBlockedUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return 'URL không hợp lệ';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'Chỉ hỗ trợ link http/https';
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return 'Link nội bộ không được phép';
  // Literal IPs: block loopback/private/link-local ranges.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const [a, b] = host.split('.').map(Number);
    if (a === 127 || a === 10 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)) {
      return 'Link nội bộ không được phép';
    }
  }
  if (host === '[::1]' || host.startsWith('fd') || host.startsWith('fe80')) return 'Link nội bộ không được phép';
  return null;
}

function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchLink(rawUrl) {
  const blocked = isBlockedUrl(rawUrl);
  if (blocked) return { url: rawUrl, error: blocked };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(rawUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; BrandStrategyBot/1.0)' },
    });
    clearTimeout(timer);
    if (!res.ok) return { url: rawUrl, error: `Trang trả về lỗi ${res.status}` };
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return { url: rawUrl, error: 'Link không phải trang web (hãy dán link trang, không phải link ảnh/file)' };
    }
    const html = await res.text();
    const text = htmlToText(html).slice(0, MAX_CHARS_PER_SOURCE);
    if (text.length < 100) return { url: rawUrl, error: 'Trang không có nội dung đọc được (có thể chặn bot hoặc cần đăng nhập)' };
    return { url: rawUrl, text };
  } catch (e) {
    return { url: rawUrl, error: e.name === 'AbortError' ? 'Trang tải quá lâu (quá 10 giây)' : 'Không truy cập được link' };
  }
}

async function parseFile(file) {
  const { name, base64 } = file;
  const buffer = Buffer.from(base64 || '', 'base64');
  const lower = String(name || '').toLowerCase();
  try {
    if (lower.endsWith('.txt')) {
      return { name, text: buffer.toString('utf8').slice(0, MAX_CHARS_PER_SOURCE) };
    }
    if (lower.endsWith('.pdf')) {
      const { PDFParse } = require('pdf-parse');
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      const text = (result && result.text ? result.text : '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS_PER_SOURCE);
      if (!text) return { name, error: 'PDF không có chữ đọc được (có thể là bản scan ảnh)' };
      return { name, text };
    }
    return { name, error: 'Chỉ hỗ trợ file .pdf và .txt' };
  } catch (e) {
    return { name, error: `Không đọc được file: ${e.message}` };
  }
}

const DIGEST_TOOL = {
  name: 'return_digest',
  description: 'Trả về hồ sơ tư liệu thương hiệu cô đọng.',
  input_schema: {
    type: 'object',
    properties: {
      digest: {
        type: 'string',
        description: 'Hồ sơ tư liệu thương hiệu: 400-700 từ, chỉ chứa thông tin THẬT trích từ tư liệu (sản phẩm, giá, chất liệu, câu chuyện, giọng văn, khách hàng, chính sách...), viết thành các gạch đầu dòng theo nhóm',
      },
    },
    required: ['digest'],
  },
};

const DIGEST_SYSTEM = `Bạn là trợ lý nghiên cứu thương hiệu. Nhiệm vụ: đọc tư liệu thô (nội dung website, tài liệu khách cung cấp) và cô đọng thành "HỒ SƠ TƯ LIỆU THƯƠNG HIỆU" 400-700 từ.
QUY TẮC:
- CHỈ ghi thông tin có thật trong tư liệu — tuyệt đối không suy diễn hay bịa thêm.
- Ưu tiên: danh sách sản phẩm + giá cụ thể, chất liệu/đặc điểm, câu chuyện thương hiệu, giọng văn/cách xưng hô đang dùng, chính sách (bảo hành, ship, đổi trả), feedback khách nếu có.
- Bỏ qua: menu điều hướng, footer, điều khoản chung chung, nội dung không liên quan thương hiệu.
- Viết gạch đầu dòng gọn theo nhóm, tiếng Việt.`;

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
    if ((account.credits || 0) <= 0) {
      res.status(403).json({ ok: false, message: 'Bạn đã hết lượt tạo file. Mua thêm lượt (99.000đ) để tiếp tục.' });
      return;
    }

    const links = Array.isArray(req.body.links) ? req.body.links.filter(Boolean).slice(0, MAX_LINKS) : [];
    const files = Array.isArray(req.body.files) ? req.body.files.slice(0, 3) : [];

    const totalBytes = files.reduce((sum, f) => sum + Math.floor(((f && f.base64) || '').length * 0.75), 0);
    if (totalBytes > MAX_TOTAL_FILE_BYTES) {
      res.status(400).json({ ok: false, message: 'Tổng dung lượng file quá 3MB — hãy chọn file nhỏ hơn.' });
      return;
    }
    if (links.length === 0 && files.length === 0) {
      res.status(400).json({ ok: false, message: 'Chưa có link hay file nào để đọc.' });
      return;
    }

    const [linkResults, fileResults] = await Promise.all([
      Promise.all(links.map(fetchLink)),
      Promise.all(files.map(parseFile)),
    ]);

    const sources = [];
    const warnings = [];
    for (const r of linkResults) {
      if (r.text) sources.push(`=== NGUỒN: ${r.url} ===\n${r.text}`);
      else warnings.push(`${r.url}: ${r.error}`);
    }
    for (const r of fileResults) {
      if (r.text) sources.push(`=== FILE: ${r.name} ===\n${r.text}`);
      else warnings.push(`${r.name}: ${r.error}`);
    }

    if (sources.length === 0) {
      res.status(422).json({ ok: false, message: `Không đọc được nguồn nào. Chi tiết: ${warnings.join(' | ')}` });
      return;
    }

    // Haiku here: plain summarization/condensing of scraped text, no creative
    // writing or multi-constraint reasoning needed -- see api/_anthropic.js
    // for why this is the one call site downgraded from Sonnet 5.
    const result = await callTool({
      system: DIGEST_SYSTEM,
      messages: [{ role: 'user', content: `Tư liệu thô:\n\n${sources.join('\n\n')}\n\nHãy cô đọng thành hồ sơ tư liệu thương hiệu.` }],
      tool: DIGEST_TOOL,
      maxTokens: 2000,
      model: MODEL_HAIKU,
    });

    res.status(200).json({ ok: true, digest: result.digest || '', sourcesRead: sources.length, warnings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: err.message || 'Lỗi máy chủ' });
  }
};
