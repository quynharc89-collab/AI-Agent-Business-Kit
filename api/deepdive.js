'use strict';

const { callTool } = require('./_anthropic');
const { requireAccount } = require('./_auth');

const DEEPDIVE_TOOL = {
  name: 'return_deepdive',
  description: 'Trả về hồ sơ khách hàng chi tiết (audience, rào cản, nỗi đau, câu nói thật) sau khi đã suy luận qua 8 lăng kính nghiên cứu sâu.',
  input_schema: {
    type: 'object',
    properties: {
      audience: {
        type: 'object',
        properties: {
          demo: { type: 'string', description: 'Giới tính / độ tuổi / nghề nghiệp' },
          income: { type: 'string', description: 'Thu nhập / nghề nghiệp' },
          interest: { type: 'string', description: 'Mối quan tâm chính' },
          buysFor: { type: 'string', description: 'Mua cho ai / vì mục đích gì' },
        },
        required: ['demo', 'income', 'interest', 'buysFor'],
      },
      barriers: {
        type: 'array',
        minItems: 4,
        maxItems: 4,
        items: {
          type: 'string',
          description: 'Câu ngắn ở ngôi thứ nhất dạng "Tôi sợ ... vì ..." -- không phải câu ghép dài',
        },
      },
      pains: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: { type: 'string', description: 'Nỗi đau cảm xúc sâu, không chỉ lý tính' },
      },
      quotes: {
        type: 'array',
        minItems: 5,
        maxItems: 10,
        items: { type: 'string', description: 'Câu nói thật đúng văn phong/từ vựng của tệp khách hàng này' },
      },
      layer2Summary: {
        type: 'string',
        description: 'Tóm tắt ngắn 3-5 câu những gì 8 lăng kính nghiên cứu sâu phát hiện được, để khách xem lại nhanh (không đưa vào tài liệu cuối)',
      },
      vpc: {
        type: 'object',
        description: 'Khung Giải Pháp Giá Trị (Value Proposition Canvas) cho tệp khách hàng này',
        properties: {
          customerJobs: {
            type: 'array', minItems: 3, maxItems: 5,
            items: { type: 'string' },
            description: 'Việc khách cần làm/đạt được (functional + social + emotional jobs) — mỗi mục 1 câu ngắn, cụ thể cho tệp này',
          },
          gains: {
            type: 'array', minItems: 3, maxItems: 5,
            items: { type: 'string' },
            description: 'Lợi ích khách mong muốn nhận được (kết quả cụ thể họ khao khát, cả lý tính lẫn cảm xúc)',
          },
          gainCreators: {
            type: 'array', minItems: 3, maxItems: 5,
            items: { type: 'string' },
            description: 'Yếu tố tạo lợi ích: sản phẩm/dịch vụ THẬT của thương hiệu (nêu đúng tên) tạo ra từng lợi ích mong muốn như thế nào',
          },
          painRelievers: {
            type: 'array', minItems: 3, maxItems: 5,
            items: { type: 'string' },
            description: 'Giải pháp giảm khó khăn: sản phẩm/chính sách THẬT của thương hiệu (nêu đúng tên) hoá giải từng nỗi đau/rào cản như thế nào',
          },
        },
        required: ['customerJobs', 'gains', 'gainCreators', 'painRelievers'],
      },
    },
    required: ['audience', 'barriers', 'pains', 'quotes', 'layer2Summary', 'vpc'],
  },
};

const SYSTEM_PROMPT = `Bạn là chuyên gia nghiên cứu tâm lý khách hàng sâu cho thương hiệu cá nhân tại Việt Nam.
Trước khi trả lời, hãy tự suy luận nội bộ (không cần in ra) qua đủ 8 lăng kính sau cho tệp khách hàng đã chọn:
1. Ngày điển hình: khi nào trong ngày họ mới thực sự có thời gian rảnh để hành động.
2. Trigger moment: sự kiện cụ thể nào khiến họ bắt đầu tìm giải pháp ngay hôm nay, không phải "để sau".
3. Quy trình quyết định: họ tự quyết hay hỏi người khác trước; cần bằng chứng mới tin hay mua theo cảm xúc rồi hối hận.
4. Phản đối theo từng mức giá: một phản đối cụ thể, khác nhau cho từng gói Entry/Mid/Premium (gói rẻ nghi ngờ sản phẩm, gói đắt nghi ngờ kết quả/niềm tin).
5. Tâm lý hành vi mua: nỗi sợ nào thực sự dẫn dắt quyết định (mất mát, sợ bị đánh giá, sợ chọn sai), họ muốn chứng minh điều gì và với ai, loại bằng chứng xã hội nào họ tin (người ngang tầm, không phải người nổi tiếng cao hơn hẳn).
6. Kênh tiếp cận cụ thể: nơi họ thực sự dành thời gian online (tên nền tảng/loại nhóm cụ thể).
7. Hành vi sau khi mua: thời điểm dễ bỏ cuộc nhất, và thời điểm sẵn sàng nâng cấp.
8. Đối thủ họ đang so sánh song song: lựa chọn thay thế thật trong đầu họ (một khoá học rẻ, một freelancer, tự làm, một agency...), không phải "đối thủ" chung chung.

Dùng kết quả suy luận 8 lăng kính đó để làm SẮC NÉT 4 rào cản, 3 nỗi đau, 5-10 câu quote, và audience -- không được chung chung/khuôn mẫu.

Sau đó lập KHUNG GIẢI PHÁP GIÁ TRỊ (Value Proposition Canvas) nối hai phía:
- Hồ sơ khách hàng: customerJobs (việc khách cần làm — đủ 3 loại: chức năng như "có trang sức đeo đi làm", xã hội như "được đồng nghiệp khen có gu", cảm xúc như "thấy mình xứng đáng"), gains (lợi ích mong muốn — kết quả cụ thể họ khao khát).
- Bản đồ giá trị: gainCreators (sản phẩm THẬT nào của thương hiệu tạo ra từng lợi ích đó, nêu đúng tên sản phẩm) và painRelievers (sản phẩm/chính sách THẬT nào hoá giải từng nỗi đau/rào cản, nêu đúng tên).
Mỗi mục gainCreators/painRelievers phải nhắc đúng tên sản phẩm trong dữ liệu — đây là phần nối giữa nỗi đau khách và thứ thương hiệu bán, là xương sống để viết chủ đề bán hàng thuyết phục.
QUY TẮC BẮT BUỘC:
- Mỗi rào cản: câu ngắn ở ngôi thứ nhất, dạng niềm tin/nỗi sợ (ví dụ "Tôi sợ ... vì ..."), KHÔNG viết câu ghép dài.
- Mỗi nỗi đau: cảm xúc, không chỉ lý tính.
- Quotes: đúng văn phong/từ vựng thật của tệp khách hàng này, tiếng Việt tự nhiên, không sáo rỗng.
- Nếu là "custom mix" gộp 2 tệp, viết audience thành hồ sơ kép rõ ràng (nêu rõ cả 2 nhóm) thay vì gộp trung bình chung chung.
- KHÔNG bịa hay thay đổi thông tin về thương hiệu/sản phẩm/giá ngoài dữ liệu đã cho -- chỉ được suy luận về khách hàng.
- layer2Summary: tóm tắt 3-5 câu về điều 8 lăng kính phát hiện được, phục vụ khách xem lại nhanh, không lặp lại y nguyên các field khác.
- Nếu được yêu cầu "làm sâu hơn": đào sâu thêm vào 8 lăng kính, viết lại barriers/pains/quotes/audience sắc nét và cụ thể hơn hẳn lần trước, không chỉ thêm quote cho có.`;

function segmentDescription(segment, customSegmentNote) {
  if (customSegmentNote) return `Khách yêu cầu "custom mix", mô tả tệp khách hàng mong muốn: ${customSegmentNote}`;
  if (segment) {
    return `Tệp khách hàng đã chọn: ${segment.label}
- Đặc điểm: ${segment.demo}
- Vì sao phù hợp: ${segment.whyFit}
- Mức độ cạnh tranh: ${segment.competitionNote}`;
  }
  return '';
}

function buildUserMessage(input) {
  const { brandName, positioning, background, products, tone, industry, segment, customSegmentNote, deepen, previousResult, enrichment } = input;
  let msg = `Thông tin thương hiệu:
- Tên kênh: ${brandName}
- Định vị: ${positioning}
- Background: ${background || '(không có)'}
- Sản phẩm Entry: ${products.entry.name} (${products.entry.price})
- Sản phẩm Mid: ${products.mid.name} (${products.mid.price})
- Sản phẩm Premium: ${products.premium.name} (${products.premium.price})
- Tone: ${tone || '(không có)'}
- Ngành: ${industry || '(không có)'}${enrichment ? `

HỒ SƠ TƯ LIỆU THƯƠNG HIỆU (trích từ website/tài liệu thật của khách — dùng làm chất liệu cho rào cản/nỗi đau/quotes sát thực tế):
${enrichment}` : ''}

${segmentDescription(segment, customSegmentNote)}`;

  if (deepen && previousResult) {
    msg += `\n\nKết quả lần trước:\n${JSON.stringify(previousResult, null, 2)}\n\nKhách bấm "Làm sâu hơn" -- hãy đào sâu thêm vào 8 lăng kính và viết lại sắc nét, cụ thể hơn hẳn lần trước.`;
  }
  return msg;
}

function validateResult(r) {
  if (!r || typeof r !== 'object') return 'Kết quả rỗng';
  if (!r.audience || !r.audience.demo || !r.audience.income || !r.audience.interest || !r.audience.buysFor) return 'Thiếu field trong audience';
  if (!Array.isArray(r.barriers) || r.barriers.length !== 4) return 'barriers phải đúng 4 mục';
  if (!Array.isArray(r.pains) || r.pains.length !== 3) return 'pains phải đúng 3 mục';
  if (!Array.isArray(r.quotes) || r.quotes.length < 5 || r.quotes.length > 10) return 'quotes phải từ 5 đến 10 mục';
  if (!r.layer2Summary) return 'Thiếu layer2Summary';
  if (!r.vpc || typeof r.vpc !== 'object') return 'Thiếu vpc (Khung Giải Pháp Giá Trị)';
  for (const key of ['customerJobs', 'gains', 'gainCreators', 'painRelievers']) {
    // Lenient: schema min/max isn't hard-enforced by tool_choice, and exact
    // VPC list length doesn't matter for quality — accept >=2, trim to 6.
    if (!Array.isArray(r.vpc[key]) || r.vpc[key].length < 2) return `vpc.${key} cần ít nhất 2 mục`;
    r.vpc[key] = r.vpc[key].slice(0, 6);
  }
  return null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Method not allowed' });
    return;
  }
  try {
    const { account, error: authError } = await requireAccount(req);
    if (authError) {
      res.status(authError.status).json({ ok: false, message: authError.message });
      return;
    }
    if ((account.credits || 0) <= 0) {
      res.status(403).json({ ok: false, message: 'Bạn đã hết lượt tạo file. Mua thêm lượt (99.000đ) để tiếp tục.' });
      return;
    }

    const input = req.body || {};
    const { brandName, positioning, products, segment, customSegmentNote } = input;
    if (!brandName || !positioning || !products) {
      res.status(400).json({ ok: false, message: 'Thiếu thông tin Stage 1' });
      return;
    }
    if (!segment && !customSegmentNote) {
      res.status(400).json({ ok: false, message: 'Thiếu tệp khách hàng đã chọn hoặc mô tả custom mix' });
      return;
    }

    const userMessage = buildUserMessage(input);
    // maxTokens 8000: the default 4096 truncated the response once VPC was
    // added to the schema (vpc is the last property, so it silently vanished).
    let result = await callTool({ system: SYSTEM_PROMPT, messages: [{ role: 'user', content: userMessage }], tool: DEEPDIVE_TOOL, maxTokens: 8000 });
    let error = validateResult(result);

    if (error) {
      const retryMessage = `${userMessage}\n\nLƯU Ý QUAN TRỌNG: lần trả lời trước bị lỗi định dạng (${error}). Lần này BẮT BUỘC đúng: audience đủ 4 field, barriers đúng 4 mục, pains đúng 3 mục, quotes từ 5 đến 10 mục, vpc đủ 4 danh sách (customerJobs/gains/gainCreators/painRelievers) mỗi danh sách 3-5 mục.`;
      result = await callTool({ system: SYSTEM_PROMPT, messages: [{ role: 'user', content: retryMessage }], tool: DEEPDIVE_TOOL, maxTokens: 8000 });
      error = validateResult(result);
    }

    if (error) {
      res.status(502).json({ ok: false, message: `Claude trả kết quả không đúng định dạng sau khi thử lại: ${error}` });
      return;
    }

    res.status(200).json({ ok: true, result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: err.message || 'Lỗi máy chủ' });
  }
};
