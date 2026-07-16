'use strict';

const { callTool } = require('./_anthropic');
const { requireAccount } = require('./_auth');

const SEGMENTS_TOOL = {
  name: 'return_segments',
  description: 'Trả về đúng 3 tệp khách hàng mục tiêu khác biệt rõ rệt cho thương hiệu này.',
  input_schema: {
    type: 'object',
    properties: {
      segments: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Tên tệp khách hàng, ngắn gọn' },
            demo: { type: 'string', description: 'Giới tính / độ tuổi / nghề nghiệp / đặc điểm' },
            whyFit: { type: 'string', description: 'Vì sao tệp này phù hợp với định vị + sản phẩm của thương hiệu' },
            competitionNote: { type: 'string', description: 'Mức độ cạnh tranh / độ khó tiếp cận, viết ngắn gọn' },
          },
          required: ['label', 'demo', 'whyFit', 'competitionNote'],
        },
      },
    },
    required: ['segments'],
  },
};

const SYSTEM_PROMPT = `Bạn là chuyên gia nghiên cứu khách hàng cho thương hiệu cá nhân tại Việt Nam.
Nhiệm vụ: dựa trên thông tin thương hiệu do khách cung cấp, đề xuất ĐÚNG 3 tệp khách hàng mục tiêu khác biệt nhau rõ rệt --
mỗi tệp phải khác nhau ở góc độ nhân khẩu học/tâm lý, động lực mua hàng, và mức độ nhạy cảm về giá.
Không bịa hay thay đổi thông tin về thương hiệu/sản phẩm/giá ngoài những gì khách đã cung cấp -- chỉ được sáng tạo phần phân khúc khách hàng.
Viết bằng tiếng Việt, cụ thể, tránh mô tả chung chung có thể áp dụng cho bất kỳ thương hiệu nào khác.`;

function buildUserMessage({ brandName, positioning, background, products, tone, industry, enrichment }) {
  return `Thông tin thương hiệu:
- Tên kênh/thương hiệu: ${brandName}
- Định vị: ${positioning}
- Background: ${background || '(không có)'}
- Sản phẩm Entry: ${products.entry.name} (${products.entry.price})
- Sản phẩm Mid: ${products.mid.name} (${products.mid.price})
- Sản phẩm Premium: ${products.premium.name} (${products.premium.price})
- Tone thương hiệu: ${tone || '(không có)'}
- Lĩnh vực/ngành cụ thể: ${industry || '(không có)'}${enrichment ? `

HỒ SƠ TƯ LIỆU THƯƠNG HIỆU (trích từ website/tài liệu thật của khách — dùng để hiểu đúng sản phẩm và khách hàng hiện tại):
${enrichment}` : ''}

Hãy đề xuất đúng 3 tệp khách hàng mục tiêu khác biệt cho thương hiệu này.`;
}

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

    const input = req.body || {};
    const { brandName, positioning, products } = input;
    if (!brandName || !positioning || !products || !products.entry || !products.mid || !products.premium) {
      res.status(400).json({ ok: false, message: 'Thiếu thông tin Stage 1 (brandName/positioning/products)' });
      return;
    }

    const result = await callTool({
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserMessage(input) }],
      tool: SEGMENTS_TOOL,
    });

    if (!Array.isArray(result.segments) || result.segments.length !== 3) {
      res.status(502).json({ ok: false, message: 'Claude không trả về đúng 3 tệp khách hàng, vui lòng thử lại.' });
      return;
    }

    res.status(200).json({ ok: true, segments: result.segments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: err.message || 'Lỗi máy chủ' });
  }
};
