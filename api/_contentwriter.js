'use strict';

// LLM writer pass: the deterministic generator (skills/brand-strategy-docx/src/
// generator.js) provides the skeleton -- 5 tracks, fixed topic counts, per-row
// format, barrier assignment for Track B -- and Claude writes the actual words
// (title/hook/script/caption) so titles don't read as the same template with one
// noun swapped. Output is validated hard in api/generate.js before shipping.
const { callTool } = require('./_anthropic');

const TRACK_GOALS = {
  A: 'Chứng minh năng lực qua trải nghiệm/kết quả thật — nội dung phải cụ thể, có chi tiết đời thực, hook chạm cảm xúc hoặc gây tò mò.',
  B: 'Phá rào cản tâm lý và xây đồng cảm — mỗi chủ đề gắn với đúng rào cản được giao, kể theo góc chuyện thật.',
  C: 'Tăng độ tin cậy chuyên môn — so sánh, giải đáp thắc mắc, phân tích sai lầm, cập nhật xu hướng.',
  D: 'Chuyển đổi mềm — mời vào cộng đồng, tặng lead magnet, chia sẻ cảm nhận người dùng, mời sự kiện, xem trước sản phẩm.',
  E: 'Gắn kết cảm xúc với con người thật đằng sau thương hiệu — origin story, khoảnh khắc yếu lòng, cột mốc, lòng biết ơn, giá trị cốt lõi.',
};

function trackTool(count) {
  return {
    name: 'return_topics',
    description: `Trả về đúng ${count} chủ đề nội dung hoàn chỉnh.`,
    input_schema: {
      type: 'object',
      properties: {
        topics: {
          type: 'array',
          minItems: count,
          maxItems: count,
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Tiêu đề chủ đề — một câu hoàn chỉnh, tự nhiên, khác hẳn các tiêu đề còn lại về cấu trúc câu và từ mở đầu' },
              hook: { type: 'string', description: 'Vì sao khán giả dừng lại xem — 1 câu, viết theo tâm lý khán giả cụ thể' },
              script: {
                type: 'array', minItems: 3, maxItems: 4,
                items: { type: 'string' },
                description: 'Dàn ý triển khai video: 3-4 gạch đầu dòng ngắn (mở - thân - kết), mỗi gạch 1 câu',
              },
              caption: { type: 'string', description: 'Caption đăng kèm: 1-2 câu + hashtag thương hiệu' },
            },
            required: ['title', 'hook', 'script', 'caption'],
          },
        },
      },
      required: ['topics'],
    },
  };
}

const WRITER_SYSTEM = `Bạn là chuyên gia sáng tạo nội dung video ngắn cho thương hiệu cá nhân Việt Nam.
Nhiệm vụ: viết các chủ đề nội dung hoàn chỉnh (tiêu đề + hook + dàn ý + caption) cho MỘT tuyến nội dung, dựa trên khung được giao.

QUY TẮC BẮT BUỘC:
1. ĐA DẠNG TUYỆT ĐỐI: không có 2 tiêu đề nào được dùng cùng một khung câu hoặc trùng 4 từ mở đầu. Mỗi tiêu đề phải khác nhau về cấu trúc (câu hỏi / câu kể / con số / lời thú nhận / tình huống / trích lời khách...). Đây là lý do lớn nhất khách chê bản cũ — tuyệt đối không lặp khung.
2. TỰ NHIÊN, ĐÚNG NGỮ PHÁP: đọc lên như người thật nói, không ghép danh từ máy móc.
3. RÀO CẢN (nếu dòng có gắn rào cản): diễn giải lại rào cản một cách tự nhiên theo góc riêng của dòng đó — CẤM chép nguyên văn câu rào cản vào tiêu đề hay hook.
4. KHÔNG BỊA SỐ LIỆU: cấm bịa số thành viên, số khách, số ngày kết quả, doanh số. Chỗ nào cần con số thật của thương hiệu thì viết placeholder [X] (ví dụ: "đã có [X] thành viên"). Con số kiểu "3 sai lầm", "5 bước" trong tiêu đề thì được phép.
5. KHÔNG BỊA THÔNG TIN THƯƠNG HIỆU: chỉ dùng sản phẩm/giá/background có trong dữ liệu. Chất liệu khách hàng (nỗi đau, câu nói thật) được phép dùng và diễn giải.
6. Bám đúng "Định dạng" được giao cho từng dòng (ví dụ dòng ghi "Testimonial" thì nội dung phải là dạng chia sẻ của người dùng).
7. Script: 3-4 gạch đầu dòng NGẮN, cụ thể tới mức người quay có thể cầm máy quay luôn, theo nhịp mở (hook lại người xem) - thân (nội dung chính) - kết (call-to-action nhẹ).
8. Caption: 1-2 câu đúng giọng thương hiệu + hashtag thương hiệu được cung cấp.
9. Viết tiếng Việt, xưng hô phù hợp khán giả mục tiêu.`;

function brandBlock(intake) {
  return `THÔNG TIN THƯƠNG HIỆU:
- Tên: ${intake.brandName}
- Định vị: ${intake.positioning}
- Background người sáng lập: ${intake.background || '(không có)'}
- Sản phẩm: Entry "${intake.products.entry.name}" (${intake.products.entry.price}) / Mid "${intake.products.mid.name}" (${intake.products.mid.price}) / Premium "${intake.products.premium.name}" (${intake.products.premium.price})
- Ngành: ${intake.industry}
- Tone: ${intake.tone} | Hashtag: ${intake.hashtag || '#' + intake.brandName.replace(/\s+/g, '')}

KHÁN GIẢ MỤC TIÊU:
- ${intake.audience.demo}
- Thu nhập: ${intake.audience.income}
- Quan tâm: ${intake.audience.interest}
- Mua cho: ${intake.audience.buysFor}

NỖI ĐAU THẬT (chất liệu để viết, diễn giải tự nhiên):
${intake.pains.map((p, i) => `${i + 1}. ${p}`).join('\n')}

CÂU KHÁCH HÀNG THẬT HAY NÓI (dùng làm giọng điệu/chất liệu):
${intake.quotes.map((q) => `- "${q}"`).join('\n')}${intake.vpc ? `

KHUNG GIẢI PHÁP GIÁ TRỊ (xương sống bán hàng — mỗi chủ đề nên chạm ít nhất 1 job/gain/pain và nối tới đúng sản phẩm qua gain creator/pain reliever tương ứng):
- Việc khách cần làm: ${intake.vpc.customerJobs.join(' | ')}
- Lợi ích khách mong muốn: ${intake.vpc.gains.join(' | ')}
- Sản phẩm tạo lợi ích thế nào: ${intake.vpc.gainCreators.join(' | ')}
- Sản phẩm hoá giải khó khăn thế nào: ${intake.vpc.painRelievers.join(' | ')}` : ''}${intake.enrichment ? `

HỒ SƠ TƯ LIỆU THƯƠNG HIỆU (trích từ website/tài liệu thật do khách cung cấp — ưu tiên dùng đúng tên sản phẩm, giá, chất liệu, câu chuyện, cách xưng hô trong đây):
${intake.enrichment}` : ''}`;
}

// Rebuild Track B's barrier assignment exactly as buildTrackB in generator.js
// does (sequential groups of ceil(count/barriers.length)).
function barrierForRow(index, count, barriers) {
  const perBarrier = Math.ceil(count / barriers.length);
  return barriers[Math.min(Math.floor(index / perBarrier), barriers.length - 1)];
}

// Big tracks are split into chunks of at most this many topics. One 22-topic
// call proved both slow (~100s of output tokens) and unreliable on exact counts
// (returned 21/22 once despite the schema); ≤11-topic calls run in parallel are
// faster end-to-end and hit exact counts reliably.
const CHUNK_LIMIT = 11;

function chunkRanges(count) {
  if (count <= CHUNK_LIMIT + 1) return [[0, count]]; // 12 still fits one call
  const chunks = Math.ceil(count / CHUNK_LIMIT);
  const per = Math.ceil(count / chunks);
  const ranges = [];
  for (let start = 0; start < count; start += per) {
    ranges.push([start, Math.min(start + per, count)]);
  }
  return ranges;
}

function rowsBlock(trackKey, track, intake, start, end) {
  const count = track.topics.length;
  return track.topics.slice(start, end).map((t, idx) => {
    const i = start + idx;
    let line = `${i + 1}. Định dạng: ${t.format}`;
    if (trackKey === 'B') {
      line += ` | Rào cản gắn với dòng này: "${barrierForRow(i, count, intake.barriers)}"`;
    }
    return line;
  }).join('\n');
}

async function writeChunk(intake, trackKey, track, [start, end], avoidTitles, feedback) {
  const total = track.topics.length;
  const count = end - start;
  let user = `${brandBlock(intake)}

TUYẾN CẦN VIẾT: Tuyến ${trackKey} — ${track.name}
Mục tiêu tuyến: ${TRACK_GOALS[trackKey]}
Tuyến này có tổng ${total} chủ đề; bạn viết các chủ đề số ${start + 1} đến ${end} (đúng ${count} chủ đề). Một người khác viết phần còn lại, nên tiêu đề của bạn càng đặc trưng, càng ít dùng khung câu phổ biến càng tốt.

KHUNG TỪNG DÒNG (bám đúng định dạng${trackKey === 'B' ? ' và rào cản' : ''} được giao):
${rowsBlock(trackKey, track, intake, start, end)}`;

  if (feedback) {
    user += `\n\nPHẢN HỒI CỦA KHÁCH HÀNG VỀ BẢN TRƯỚC (bắt buộc tuân theo khi viết lại):\n${feedback}`;
  }

  if (avoidTitles && avoidTitles.length) {
    user += `\n\nCÁC TIÊU ĐỀ ĐÃ DÙNG — tiêu đề mới phải khác hẳn những câu này về cấu trúc lẫn từ ngữ:\n${avoidTitles.map((t) => `- ${t}`).join('\n')}`;
  }

  const messages = [{ role: 'user', content: user }];
  let result = await callTool({ system: WRITER_SYSTEM, messages, tool: trackTool(count), maxTokens: 6000 });
  if (!Array.isArray(result.topics) || result.topics.length !== count) {
    // One immediate re-ask on count mismatch -- schema constraints alone don't
    // guarantee exact counts on larger arrays.
    const got = result.topics ? result.topics.length : 0;
    result = await callTool({
      system: WRITER_SYSTEM,
      messages: [{ role: 'user', content: `${user}\n\nLƯU Ý: lần trước bạn trả về ${got}/${count} chủ đề. Lần này BẮT BUỘC đủ đúng ${count} chủ đề.` }],
      tool: trackTool(count),
      maxTokens: 6000,
    });
  }
  if (!Array.isArray(result.topics) || result.topics.length !== count) {
    throw new Error(`Tuyến ${trackKey} (dòng ${start + 1}-${end}): Claude trả về ${result.topics ? result.topics.length : 0}/${count} chủ đề sau khi thử lại`);
  }
  return result.topics;
}

async function rewriteTrack(intake, trackKey, track, vocabLabel, avoidTitles, feedback) {
  const ranges = chunkRanges(track.topics.length);
  const chunks = await Promise.all(ranges.map((range) => writeChunk(intake, trackKey, track, range, avoidTitles, feedback)));
  const written = chunks.flat();
  // Keep the deterministic format assignment; take the written words.
  return written.map((t, i) => ({
    title: t.title,
    format: track.topics[i].format,
    hook: t.hook,
    script: t.script,
    caption: t.caption,
  }));
}

const SECTION_ONE_TOOL = {
  name: 'return_section_one',
  description: 'Trả về phần diễn giải Industry Preset viết tự nhiên.',
  input_schema: {
    type: 'object',
    properties: {
      barrierExplanations: {
        type: 'array', minItems: 4, maxItems: 4,
        items: { type: 'string' },
        description: 'Giải thích tâm lý đằng sau từng rào cản (theo đúng thứ tự 4 rào cản) — 1-2 câu tự nhiên, KHÔNG chép nguyên văn rào cản vào giữa câu',
      },
      painTried: {
        type: 'array', minItems: 3, maxItems: 3,
        items: { type: 'string' },
        description: 'Với từng nỗi đau (đúng thứ tự): khách đã thử gì mà vẫn chưa giải quyết được — 1-2 câu thực tế, hợp ngành',
      },
      pricingTechniques: {
        type: 'array', minItems: 4, maxItems: 4,
        items: {
          type: 'object',
          properties: {
            tech: { type: 'string', description: 'Tên kỹ thuật giá' },
            example: { type: 'string', description: 'Câu nói mẫu dùng ĐÚNG tên và giá sản phẩm thật của thương hiệu' },
          },
          required: ['tech', 'example'],
        },
      },
    },
    required: ['barrierExplanations', 'painTried', 'pricingTechniques'],
  },
};

const SECTION_ONE_SYSTEM = `Bạn là chuyên gia chiến lược thương hiệu cá nhân Việt Nam. Viết phần diễn giải cho tài liệu Industry Preset.
QUY TẮC:
- Giải thích rào cản: nói thẳng vào tâm lý thật đằng sau nỗi sợ đó (nó đến từ trải nghiệm gì, vì sao dai dẳng, nội dung nên phản hồi thế nào) — văn tự nhiên, KHÔNG lặp lại nguyên văn câu rào cản.
- "Đã thử gì": mô tả thực tế những cách khách đã thử và vì sao chưa hiệu quả, đúng với ngành và hoàn cảnh khán giả.
- Kỹ thuật giá: 4 kỹ thuật khác nhau (neo giá, chia nhỏ, so sánh chi tiêu quen thuộc, chi phí của việc không hành động...), mỗi kỹ thuật kèm 1 câu nói mẫu dùng ĐÚNG tên sản phẩm và giá thật được cung cấp — cấm bịa giá hay số liệu khác.
- Không bịa thông tin thương hiệu ngoài dữ liệu.`;

async function rewriteSectionOne(intake, feedback) {
  let user = `${brandBlock(intake)}

4 RÀO CẢN (đúng thứ tự):
${intake.barriers.map((b, i) => `${i + 1}. ${b}`).join('\n')}

Hãy viết: 4 giải thích rào cản, 3 mô tả "đã thử gì mà chưa được" cho 3 nỗi đau, 4 kỹ thuật giá với câu mẫu dùng giá thật.`;
  if (feedback) {
    user += `\n\nPHẢN HỒI CỦA KHÁCH HÀNG VỀ BẢN TRƯỚC (bắt buộc tuân theo khi viết lại):\n${feedback}`;
  }

  const result = await callTool({
    system: SECTION_ONE_SYSTEM,
    messages: [{ role: 'user', content: user }],
    tool: SECTION_ONE_TOOL,
    maxTokens: 4096,
  });
  const ok = Array.isArray(result.barrierExplanations) && result.barrierExplanations.length === 4
    && Array.isArray(result.painTried) && result.painTried.length === 3
    && Array.isArray(result.pricingTechniques) && result.pricingTechniques.length === 4;
  if (!ok) throw new Error('Section 1: Claude trả về sai định dạng');
  return result;
}

module.exports = { rewriteTrack, rewriteSectionOne };
