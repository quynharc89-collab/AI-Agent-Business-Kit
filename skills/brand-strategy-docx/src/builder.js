'use strict';

const {
  Document, Paragraph, TextRun, Table, TableRow, TableCell, Header, Footer,
  PageNumber, AlignmentType, ShadingType, WidthType, BorderStyle,
  PageOrientation, HeadingLevel, VerticalAlign,
} = require('docx');

const NAVY = '1A3C6E';
const WHITE = 'FFFFFF';
const ALT = 'F5F5F5';
const GRAY = '888888';

const TC = {
  A: { bg: 'D35400', light: 'FAE5D3' },
  B: { bg: '1A5276', light: 'D6EAF8' },
  C: { bg: '1E8449', light: 'D5F5E3' },
  D: { bg: '6C3483', light: 'E8DAEF' },
  E: { bg: '922B21', light: 'FADBD8' },
};

const CONTENT_WIDTH = 15398;
const FONT = 'Arial';

function noBorder() {
  return {
    top: { style: BorderStyle.NONE, size: 0, color: WHITE },
    bottom: { style: BorderStyle.NONE, size: 0, color: WHITE },
    left: { style: BorderStyle.NONE, size: 0, color: WHITE },
    right: { style: BorderStyle.NONE, size: 0, color: WHITE },
  };
}

function thinBorder(color = 'CCCCCC') {
  const b = { style: BorderStyle.SINGLE, size: 4, color };
  return { top: b, bottom: b, left: b, right: b };
}

function run(text, opts = {}) {
  return new TextRun({ text, font: FONT, ...opts });
}

function para(text, opts = {}) {
  const { bold, italic, size, color, alignment, spacingAfter, spacingBefore } = opts;
  return new Paragraph({
    alignment,
    spacing: { after: spacingAfter ?? 80, before: spacingBefore ?? 0 },
    children: [run(text, { bold, italics: italic, size, color })],
  });
}

function cell(children, opts = {}) {
  const { width, shading, valign, borders, margins } = opts;
  return new TableCell({
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    shading: shading ? { type: ShadingType.CLEAR, fill: shading } : undefined,
    verticalAlign: valign ?? VerticalAlign.CENTER,
    borders: borders ?? thinBorder(),
    margins: margins ?? { top: 80, bottom: 80, left: 120, right: 120 },
    children: Array.isArray(children) ? children : [children],
  });
}

function fullWidthBanner(text, bg, opts = {}) {
  const { size = 26, color = WHITE } = opts;
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [CONTENT_WIDTH],
    rows: [
      new TableRow({
        children: [
          cell(
            [para(text, { bold: true, size, color, alignment: AlignmentType.LEFT, spacingAfter: 0 })],
            { width: CONTENT_WIDTH, shading: bg, borders: noBorder(), margins: { top: 160, bottom: 160, left: 200, right: 200 } }
          ),
        ],
      }),
    ],
  });
}

function keyValueTable(rows, opts = {}) {
  const keyWidth = opts.keyWidth ?? 3800;
  const valWidth = CONTENT_WIDTH - keyWidth;
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [keyWidth, valWidth],
    rows: rows.map((r, i) => new TableRow({
      children: [
        cell([para(r.key, { bold: true, color: NAVY, spacingAfter: 0 })], { width: keyWidth, shading: i % 2 === 0 ? WHITE : ALT }),
        cell([para(r.value, { spacingAfter: 0 })], { width: valWidth, shading: i % 2 === 0 ? WHITE : ALT }),
      ],
    })),
  });
}

function gridTable(headers, widths, rowsData, opts = {}) {
  const headerRow = new TableRow({
    children: headers.map((h, i) => cell(
      [para(h, { bold: true, color: WHITE, spacingAfter: 0 })],
      { width: widths[i], shading: opts.headerBg ?? NAVY }
    )),
  });
  const dataRows = rowsData.map((row, rIdx) => new TableRow({
    children: row.map((val, cIdx) => cell(
      [para(String(val ?? ''), { spacingAfter: 0 })],
      { width: widths[cIdx], shading: rIdx % 2 === 0 ? (opts.altLight ?? WHITE) : (opts.alt ?? ALT) }
    )),
  }));
  return new Table({ width: { size: CONTENT_WIDTH, type: WidthType.DXA }, columnWidths: widths, rows: [headerRow, ...dataRows] });
}

function subheader(text) {
  return new Paragraph({
    spacing: { before: 280, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: NAVY, space: 4 } },
    children: [run(text, { bold: true, color: NAVY, size: 24 })],
  });
}

function spacer(h = 200) {
  return new Paragraph({ spacing: { after: h }, children: [run('')] });
}

function quoteBlock(quotes) {
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [CONTENT_WIDTH],
    rows: [
      new TableRow({
        children: [
          cell(
            quotes.map((q) => para(`"${q}"`, { italic: true, spacingAfter: 100 })),
            {
              width: CONTENT_WIDTH,
              shading: 'EBF5FB',
              borders: {
                top: { style: BorderStyle.NONE, size: 0, color: WHITE },
                bottom: { style: BorderStyle.NONE, size: 0, color: WHITE },
                right: { style: BorderStyle.NONE, size: 0, color: WHITE },
                left: { style: BorderStyle.THICK, size: 24, color: NAVY },
              },
              margins: { top: 160, bottom: 160, left: 240, right: 240 },
            }
          ),
        ],
      }),
    ],
  });
}

// Value Proposition Canvas — two-sided table pairing the value map (what the
// brand offers) with the customer profile (what the customer needs). Only
// rendered when sectionOne.vpc exists (the web app's deep-research pass fills
// it; the manual skill flow doesn't).
function vpcTable(vpc) {
  const half = Math.floor(CONTENT_WIDTH / 2);
  const rowDefs = [
    {
      left: { label: '📦 Sản phẩm & dịch vụ', items: vpc.products },
      right: { label: '🎯 Việc khách cần làm (Customer Jobs)', items: vpc.customerJobs },
      shade: 'FAE5D3',
    },
    {
      left: { label: '📈 Yếu tố tạo lợi ích (Gain Creators)', items: vpc.gainCreators },
      right: { label: '😊 Lợi ích mong muốn (Gains)', items: vpc.gains },
      shade: 'D5F5E3',
    },
    {
      left: { label: '💊 Giải pháp giảm khó khăn (Pain Relievers)', items: vpc.painRelievers },
      right: { label: '😟 Khó khăn / nỗi đau (Pains)', items: vpc.pains },
      shade: 'FADBD8',
    },
  ];
  const sideCell = (side, shade) => cell(
    [
      para(side.label, { bold: true, color: NAVY, spacingAfter: 60 }),
      ...side.items.map((item, i) => para(`• ${item}`, { spacingAfter: i === side.items.length - 1 ? 0 : 40 })),
    ],
    { width: half, shading: shade, valign: VerticalAlign.TOP }
  );
  const headerRow = new TableRow({
    children: [
      cell([para('BẢN ĐỒ GIÁ TRỊ — thương hiệu mang lại gì', { bold: true, color: WHITE, spacingAfter: 0 })], { width: half, shading: NAVY }),
      cell([para('HỒ SƠ KHÁCH HÀNG — khách thật sự cần gì', { bold: true, color: WHITE, spacingAfter: 0 })], { width: half, shading: NAVY }),
    ],
  });
  const rows = rowDefs.map((r) => new TableRow({ children: [sideCell(r.left, r.shade), sideCell(r.right, r.shade)] }));
  return new Table({ width: { size: CONTENT_WIDTH, type: WidthType.DXA }, columnWidths: [half, half], rows: [headerRow, ...rows] });
}

function buildCoverPage(input, sectionTwo) {
  const monthYear = new Date().toLocaleDateString('vi-VN', { month: '2-digit', year: 'numeric' });
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [CONTENT_WIDTH],
    rows: [
      new TableRow({
        children: [
          cell(
            [
              spacer(900),
              para(input.brandName.toUpperCase(), { bold: true, color: WHITE, size: 104, alignment: AlignmentType.CENTER, spacingAfter: 200 }),
              para(input.positioning, { italic: true, color: 'D6EAF8', size: 64, alignment: AlignmentType.CENTER, spacingAfter: 400 }),
              para('BỘ TÀI LIỆU CHIẾN LƯỢC NỘI DUNG', { color: 'FAD7A0', size: 44, alignment: AlignmentType.CENTER, spacingAfter: 600 }),
              twoSummaryBoxes(),
              spacer(400),
              para(`Ngày cập nhật: ${monthYear}  |  Tổng số chủ đề: ${sectionTwo.total}`, { color: 'D6EAF8', size: 24, alignment: AlignmentType.CENTER }),
            ],
            { width: CONTENT_WIDTH, shading: NAVY, valign: VerticalAlign.CENTER, borders: noBorder(), margins: { top: 200, bottom: 200, left: 400, right: 400 } }
          ),
        ],
      }),
    ],
  });
}

function twoSummaryBoxes() {
  const boxWidth = Math.floor(CONTENT_WIDTH / 2) - 100;
  const t = new Table({
    width: { size: CONTENT_WIDTH - 600, type: WidthType.DXA },
    columnWidths: [boxWidth, boxWidth],
    alignment: AlignmentType.CENTER,
    rows: [
      new TableRow({
        children: [
          cell(
            [
              para('PHẦN 1', { bold: true, color: WHITE, size: 22, alignment: AlignmentType.CENTER, spacingAfter: 40 }),
              para('Industry Preset', { color: WHITE, size: 20, alignment: AlignmentType.CENTER, spacingAfter: 0 }),
            ],
            { width: boxWidth, shading: '1A5276', borders: noBorder(), margins: { top: 160, bottom: 160, left: 160, right: 160 } }
          ),
          cell(
            [
              para('PHẦN 2', { bold: true, color: WHITE, size: 22, alignment: AlignmentType.CENTER, spacingAfter: 40 }),
              para('Kế Hoạch Nội Dung — 80 Chủ Đề', { color: WHITE, size: 20, alignment: AlignmentType.CENTER, spacingAfter: 0 }),
            ],
            { width: boxWidth, shading: '1E8449', borders: noBorder(), margins: { top: 160, bottom: 160, left: 160, right: 160 } }
          ),
        ],
      }),
    ],
  });
  return t;
}

function buildSectionOneBlocks(input, sectionOne) {
  const blocks = [];
  blocks.push(fullWidthBanner('PHẦN 1 — INDUSTRY PRESET', NAVY, { size: 26 }));
  blocks.push(spacer(160));

  blocks.push(subheader('1. Khách Hàng Mục Tiêu'));
  blocks.push(keyValueTable(sectionOne.targetAudience));
  blocks.push(spacer());

  blocks.push(subheader('2. Phân Khúc Giá'));
  blocks.push(gridTable(
    ['Cấp độ', 'Khoảng giá', 'Sản phẩm'],
    [3000, 3500, CONTENT_WIDTH - 6500],
    sectionOne.pricingTiers.map((t) => [t.level, t.range, t.product])
  ));
  blocks.push(spacer());

  blocks.push(subheader('3. 4 Rào Cản Phổ Biến Nhất'));
  blocks.push(gridTable(
    ['#', 'Rào cản', 'Giải thích'],
    [700, 4500, CONTENT_WIDTH - 5200],
    sectionOne.barriers.map((b) => [b.n, b.barrier, b.explain])
  ));
  blocks.push(spacer());

  blocks.push(subheader('4. 3 Nỗi Đau Sâu Nhất'));
  blocks.push(gridTable(
    ['#', 'Nỗi đau', 'Đã thử gì mà vẫn chưa giải quyết'],
    [700, 4500, CONTENT_WIDTH - 5200],
    sectionOne.pains.map((p) => [p.n, p.pain, p.tried])
  ));
  blocks.push(spacer());

  blocks.push(subheader('5. Từ Vựng Khách Hàng Thật Dùng'));
  blocks.push(quoteBlock(sectionOne.quotes));
  blocks.push(spacer());

  let num = 6;
  if (sectionOne.vpc) {
    blocks.push(subheader(`${num++}. Khung Giải Pháp Giá Trị (Value Proposition Canvas)`));
    blocks.push(vpcTable(sectionOne.vpc));
    blocks.push(spacer());
  }

  blocks.push(subheader(`${num++}. Tone Preset`));
  blocks.push(gridTable(
    ['Tone', 'Khi nào dùng'],
    [3000, CONTENT_WIDTH - 3000],
    sectionOne.tonePresets.map((t) => [t.tone, t.when])
  ));
  blocks.push(spacer());

  blocks.push(subheader(`${num++}. Visual Chuẩn Ngành`));
  blocks.push(keyValueTable(Object.entries(sectionOne.visual).map(([key, value]) => ({ key, value }))));
  blocks.push(spacer());

  blocks.push(subheader(`${num++}. Kỹ Thuật Giá Hiệu Quả`));
  blocks.push(gridTable(
    ['Kỹ thuật', 'Ví dụ câu thật'],
    [3500, CONTENT_WIDTH - 3500],
    sectionOne.pricingTechniques.map((t) => [t.tech, t.example])
  ));
  blocks.push(spacer());

  blocks.push(subheader(`${num++}. Hashtag Gốc Ngành`));
  blocks.push(keyValueTable(Object.entries(sectionOne.hashtags).map(([key, value]) => ({ key, value }))));

  return blocks;
}

function trackOverviewTable(counts, tracks) {
  const names = { A: 'Tuyến A', B: 'Tuyến B', C: 'Tuyến C', D: 'Tuyến D', E: 'Tuyến E' };
  const goals = {
    A: 'Chứng minh năng lực qua kết quả thật',
    B: 'Phá rào cản, xây đồng cảm',
    C: 'Tăng độ tin cậy chuyên môn',
    D: 'Chuyển đổi mềm, mời hành động',
    E: 'Gắn kết cảm xúc với con người thật',
  };
  const total = 80;
  const rows = Object.keys(counts).map((k) => [
    names[k],
    tracks[k].name,
    counts[k],
    `${Math.round((counts[k] / total) * 100)}%`,
    goals[k],
  ]);
  return gridTable(
    ['Tuyến', 'Tên', 'Số chủ đề', 'Tỷ lệ', 'Mục tiêu'],
    [1800, 4200, 1800, 1500, CONTENT_WIDTH - 9300],
    rows
  );
}

function trackTable(trackKey, track) {
  const colors = TC[trackKey];
  const blocks = [];
  blocks.push(fullWidthBanner(
    `TUYẾN ${trackKey} — ${track.name.toUpperCase()} (${track.topics.length} chủ đề) — ${track.desc}`,
    colors.bg,
    { size: 22 }
  ));
  const widths = [520, 3800, 1300, 2900, 4200, 2678];
  const headerRow = new TableRow({
    children: ['#', 'Chủ đề / Nội dung', 'Định dạng', 'Hook / Mục tiêu', 'Kịch bản', 'Caption'].map((h, i) => cell(
      [para(h, { bold: true, color: WHITE, spacingAfter: 0 })],
      { width: widths[i], shading: NAVY }
    )),
  });
  // t.script (array of beats) and t.caption are filled by the web app's LLM
  // writer pass; the manual skill flow omits them and the columns stay blank.
  const scriptParas = (t) => {
    if (!Array.isArray(t.script) || t.script.length === 0) {
      return [para(String(t.script || ''), { spacingAfter: 0 })];
    }
    return t.script.map((line, si) => para(`• ${line}`, { spacingAfter: si === t.script.length - 1 ? 0 : 40 }));
  };
  const dataRows = track.topics.map((t, i) => {
    const shade = i % 2 === 0 ? WHITE : colors.light;
    const cells = [
      [para(String(i + 1), { spacingAfter: 0 })],
      [para(String(t.title), { spacingAfter: 0 })],
      [para(String(t.format), { spacingAfter: 0 })],
      [para(String(t.hook), { spacingAfter: 0 })],
      scriptParas(t),
      [para(String(t.caption || ''), { spacingAfter: 0 })],
    ];
    return new TableRow({
      children: cells.map((children, ci) => cell(children, { width: widths[ci], shading: shade })),
    });
  });
  blocks.push(new Table({ width: { size: CONTENT_WIDTH, type: WidthType.DXA }, columnWidths: widths, rows: [headerRow, ...dataRows] }));
  blocks.push(spacer(200));
  return blocks;
}

function strategyNotesTable() {
  return gridTable(
    ['Mục', 'Nội dung'],
    [3500, CONTENT_WIDTH - 3500],
    [
      ['Tần suất đăng', 'Tối thiểu 1 bài/ngày trên kênh chính, 4-5 bài/tuần trên kênh phụ'],
      ['Tỷ lệ vàng', 'A:B:C:D:E theo đúng tỷ lệ 25:28:22:15:10, không lệch quá 5% trong 1 tháng'],
      ['Giờ đăng TikTok/Reels', '11h-13h và 19h-21h, ưu tiên 20h thứ 3/5/7'],
      ['Giờ đăng Facebook', '8h-9h sáng và 20h-21h tối'],
      ['Giờ đăng YouTube Shorts', '12h-14h và 21h-22h'],
      ['Hook cấm dùng', 'Tránh hook giật tít sai sự thật, cam kết kết quả tuyệt đối ("chắc chắn 100%"), hoặc so sánh hạ thấp đối thủ trực tiếp'],
    ]
  );
}

function buildSectionTwoBlocks(sectionTwo) {
  const blocks = [];
  blocks.push(fullWidthBanner('PHẦN 2 — KẾ HOẠCH NỘI DUNG', '1E8449', { size: 26 }));
  blocks.push(spacer(160));
  blocks.push(subheader('Tổng Quan 5 Tuyến Nội Dung'));
  blocks.push(trackOverviewTable(sectionTwo.counts, sectionTwo.tracks));
  blocks.push(spacer(300));

  for (const key of ['A', 'B', 'C', 'D', 'E']) {
    blocks.push(...trackTable(key, sectionTwo.tracks[key]));
  }

  blocks.push(subheader('Ghi Chú Chiến Lược'));
  blocks.push(strategyNotesTable());
  return blocks;
}

function buildDocument(input, generated) {
  const { sectionOne, sectionTwo } = generated;
  const sectionProps = {
    page: {
      size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE },
      margin: { top: 720, bottom: 720, left: 720, right: 720 },
    },
  };
  const year = new Date().getFullYear();

  const header = new Header({
    children: [
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: NAVY, space: 4 } },
        tabStops: [{ type: 'right', position: CONTENT_WIDTH }],
        children: [
          run(input.brandName, { bold: true, color: NAVY, size: 18 }),
          run('\t', {}),
          run(String(year), { color: GRAY, size: 18 }),
        ],
      }),
    ],
  });

  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          run('Trang ', { color: GRAY, size: 16 }),
          new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: GRAY }),
        ],
      }),
    ],
  });

  const children = [
    buildCoverPage(input, sectionTwo),
    new Paragraph({ children: [], pageBreakBefore: true }),
    ...buildSectionOneBlocks(input, sectionOne),
    new Paragraph({ children: [], pageBreakBefore: true }),
    ...buildSectionTwoBlocks(sectionTwo),
  ];

  return new Document({
    sections: [
      {
        properties: sectionProps,
        headers: { default: header },
        footers: { default: footer },
        children,
      },
    ],
  });
}

module.exports = { buildDocument };
