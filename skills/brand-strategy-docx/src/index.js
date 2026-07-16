'use strict';

const fs = require('fs');
const path = require('path');
const { Packer } = require('docx');
const { generate } = require('./generator');
const { buildDocument } = require('./builder');

// Edit this for a quick local test, or pass intake JSON as argv[2].
const SAMPLE_INPUT = {
  brandName: 'Khánh Quyên',
  positioning: 'Công chức học AI từ số 0',
  background: 'chuyên viên văn phòng hành chính nhà nước hơn 10 năm',
  products: {
    entry: { name: 'Checklist 10 prompt AI cho công chức', price: 'Miễn phí' },
    mid: { name: 'Khoá AI Thực Chiến Cho Công Chức', price: '990.000đ' },
    premium: { name: 'Mentorship 1:1 + Hệ thống AI cá nhân hoá', price: '4.990.000đ' },
  },
  audience: {
    demo: 'Nam/Nữ 35-55 tuổi, biên chế nhà nước',
    income: 'Lương 7-15 triệu/tháng, ổn định nhưng eo hẹp',
    interest: 'Tiết kiệm thời gian soạn văn bản, không bị tụt hậu công nghệ',
    buysFor: 'Tự đầu tư cho công việc và sự nghiệp lâu dài của bản thân',
  },
  barriers: [
    'Tôi không giỏi công nghệ, sợ học không theo được',
    'Sợ dùng AI bị đánh giá là lười, không tự làm việc',
    'Không có thời gian học vì việc cơ quan đã kín lịch',
    'Sợ tốn tiền mà không áp dụng được vào công việc thật',
  ],
  pains: [
    'Áp lực deadline báo cáo dồn vào cuối quý, làm không kịp',
    'Cảm giác tụt hậu khi đồng nghiệp trẻ dùng công nghệ nhanh hơn',
    'Mệt mỏi vì phải làm lại văn bản nhiều lần do sai sót nhỏ',
  ],
  quotes: [
    'Em ơi chị có lớn tuổi rồi học có theo được không',
    'Cái này có khó dùng không, chị sợ máy tính lắm',
    'Chị làm cơ quan nhà nước có hợp dùng AI không',
    'Tốn bao nhiêu tiền một tháng vậy em',
    'Học xong áp dụng vào công việc cơ quan được không',
  ],
  tone: 'Kết hợp',
  hashtag: '#AIChoCongChuc',
  industry: 'AI cho công chức nhà nước Việt Nam',
};

function parseInput() {
  const arg = process.argv[2];
  if (!arg) return SAMPLE_INPUT;
  try {
    return JSON.parse(arg);
  } catch (e) {
    try {
      return JSON.parse(fs.readFileSync(arg, 'utf8'));
    } catch (e2) {
      console.error('Không đọc được intake JSON (không phải JSON hợp lệ, và không phải file tồn tại):', arg);
      process.exit(1);
    }
  }
}

function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '');
}

async function main() {
  const input = parseInput();
  const generated = generate(input);
  const doc = buildDocument(input, generated);

  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const filename = `${sanitizeFilename(input.brandName)}-ChienLuoc-${mm}-${yyyy}.docx`;
  const outPath = path.resolve(process.cwd(), filename);

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outPath, buffer);

  const { sectionTwo } = generated;
  const estimatedPages = 1 + 9 + 1 + Object.keys(sectionTwo.tracks).length * 2;

  console.log(`Đã tạo file: ${outPath}`);
  console.log(`Ước tính số trang: ~${estimatedPages}`);
  console.log('Số chủ đề mỗi tuyến:');
  for (const [key, track] of Object.entries(sectionTwo.tracks)) {
    console.log(`  Tuyến ${key} — ${track.name}: ${track.topics.length} chủ đề`);
  }
  console.log(`Tổng số chủ đề: ${sectionTwo.total}`);
}

main().catch((err) => {
  console.error('Lỗi khi tạo file:', err);
  process.exit(1);
});
