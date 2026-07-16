'use strict';

/**
 * All content generation logic. Nothing here is industry-hardcoded for the
 * *topics themselves* — topics are assembled from intake fields + an
 * industry vocabulary lookup (with a generic fallback for niches not in the
 * lookup), so the same code works for any niche.
 */

// ---------------------------------------------------------------------------
// Deterministic "random but odd" numbers, seeded by brand name so re-running
// with the same intake gives the same output, but different brands differ.
// ---------------------------------------------------------------------------
function makeSeededRng(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0;
  return function rng() {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return (state >>> 0) / 4294967296;
  };
}

function oddInt(rng, min, max) {
  let n = Math.floor(min + rng() * (max - min));
  if (n % 2 === 0) n += 1;
  return Math.max(min, Math.min(max, n));
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// ---------------------------------------------------------------------------
// Industry vocabulary lookup. Keys are matched case-insensitively against
// substrings of the user's "lĩnh vực" field. A generic fallback is used for
// any niche not covered here, so the skill still works for arbitrary fields.
// ---------------------------------------------------------------------------
const INDUSTRY_VOCAB = {
  'xây kênh|video thương hiệu|adn thương hiệu|video ai|ai cho thương hiệu|pipeline ai': {
    label: 'Xây kênh thương hiệu bằng AI',
    artifacts: ['video thương hiệu', 'kịch bản AI cho video', 'bộ ảnh sản phẩm bằng AI', 'ADN thương hiệu số hoá', 'lịch đăng đa kênh', 'prompt ảnh/video sản phẩm'],
    metricUnit: 'phút',
    metricRange: [5, 45],
    moneyUnit: 'triệu đồng',
    moneyRange: [1, 15],
    visual: 'ánh sáng studio sang trọng, bối cảnh sản phẩm thương hiệu lên hình bằng AI, trang phục/tông màu nhất quán với ADN thương hiệu, nhấn frame vào chi tiết sản phẩm và chuyển động do AI tạo ra',
    sceneWords: ['pipeline AI tạo video', 'bộ ảnh sản phẩm AI', 'kịch bản dựng sẵn', 'lịch đăng đa kênh'],
  },
  'ai cho|chatgpt|claude|gemini|chatbot|trí tuệ nhân tạo|công chức|cong chuc|nhà nước': {
    label: 'AI cho công chức / khu vực nhà nước',
    artifacts: ['báo cáo quý', 'tờ trình', 'biên bản họp', 'kế hoạch công tác', 'văn bản hành chính', 'bài phát biểu'],
    metricUnit: 'phút',
    metricRange: [9, 45],
    moneyUnit: 'triệu đồng',
    moneyRange: [1, 12],
    visual: 'ánh sáng văn phòng trung tính, bối cảnh bàn làm việc/phòng họp cơ quan, trang phục công vụ gọn gàng (áo sơ mi/blazer), khung hình cận cảnh màn hình laptop khi demo',
    sceneWords: ['phòng họp', 'bàn làm việc cơ quan', 'máy tính cơ quan', 'lịch công tác'],
  },
  'tài chính|tai chinh|đầu tư|dau tu|tiết kiệm': {
    label: 'Tài chính cá nhân / đầu tư',
    artifacts: ['quỹ khẩn cấp', 'bảng chi tiêu', 'kế hoạch trả nợ', 'danh mục đầu tư', 'sổ tiết kiệm', 'báo cáo dòng tiền'],
    metricUnit: 'triệu đồng',
    metricRange: [1, 35],
    moneyUnit: 'triệu đồng',
    moneyRange: [1, 50],
    visual: 'ánh sáng ấm gần gũi, bối cảnh bàn làm việc tại nhà với laptop và sổ tay, trang phục casual lịch sự, nhấn frame vào biểu đồ/bảng số liệu',
    sceneWords: ['app ngân hàng', 'bảng excel chi tiêu', 'ví đầu tư', 'sổ tiết kiệm'],
  },
  'nuôi dạy con|nuoi day con|làm mẹ|lam me|cha mẹ': {
    label: 'Nuôi dạy con / làm cha mẹ',
    artifacts: ['thời gian biểu của con', 'nhật ký ăn dặm', 'bảng theo dõi giấc ngủ', 'kế hoạch học tại nhà', 'hộp đồ chơi giáo dục'],
    metricUnit: 'phút',
    metricRange: [5, 40],
    moneyUnit: 'trăm nghìn đồng',
    moneyRange: [1, 20],
    visual: 'ánh sáng tự nhiên ấm, bối cảnh phòng khách/phòng của con, trang phục thoải mái đời thường, nhấn frame vào khoảnh khắc tương tác mẹ-con',
    sceneWords: ['góc chơi của con', 'bàn ăn gia đình', 'phòng ngủ của con', 'balo đi học'],
  },
  'sức khỏe|suc khoe|gym|fitness|dinh dưỡng': {
    label: 'Sức khoẻ / fitness / dinh dưỡng',
    artifacts: ['thực đơn tuần', 'lịch tập', 'bảng theo dõi cân nặng', 'chỉ số sức khoẻ', 'kế hoạch giảm cân'],
    metricUnit: 'kg',
    metricRange: [1, 12],
    moneyUnit: 'trăm nghìn đồng',
    moneyRange: [1, 15],
    visual: 'ánh sáng phòng gym/bếp sáng rõ, bối cảnh phòng tập hoặc bếp nhà, trang phục thể thao gọn, nhấn frame vào động tác/món ăn cận cảnh',
    sceneWords: ['phòng gym', 'cân điện tử', 'bếp nhà', 'bình nước tập luyện'],
  },
  'sách|sach|đọc sách|chữa lành|phát triển bản thân|self-help|self help': {
    label: 'Đọc sách / phát triển bản thân / chữa lành cảm xúc',
    mode: 'healing',
    artifacts: ['cuốn sách vừa đọc xong', 'bài học rút ra', 'nhật ký cảm xúc', 'bài tập phản tư sau khi đọc', 'buổi chia sẻ trong Book Club', 'danh sách sách nên đọc'],
    metricUnit: 'ngày',
    metricRange: [3, 21],
    moneyUnit: 'trăm nghìn đồng',
    moneyRange: [1, 20],
    visual: 'ánh sáng vàng ấm dịu mắt, bối cảnh góc đọc sách/quán cà phê sách/cửa sổ có nắng, trang phục giản dị thoải mái, nhấn frame cận cảnh trang sách và bút highlight',
    sceneWords: ['góc đọc sách tại nhà', 'quán cà phê sách', 'kệ sách cá nhân', 'sổ tay ghi chú cảm xúc'],
  },
  'marketing|content|kinh doanh online|bán hàng': {
    label: 'Marketing / kinh doanh online',
    artifacts: ['kịch bản quảng cáo', 'bộ content tháng', 'báo cáo doanh thu', 'phiên livestream', 'landing page'],
    metricUnit: 'phút',
    metricRange: [7, 50],
    moneyUnit: 'triệu đồng',
    moneyRange: [1, 80],
    visual: 'ánh sáng studio sáng, bối cảnh góc làm content/màn hình dashboard, trang phục năng động chuyên nghiệp, nhấn frame vào số liệu doanh thu/lượt xem',
    sceneWords: ['dashboard quảng cáo', 'studio quay content', 'điện thoại livestream', 'bảng số liệu doanh thu'],
  },
  'nông sản|phân phối|nhập khẩu nông|hành tây|hành ấn|tỏi|khoai tây|carrot|củ quả|nong san|phan phoi': {
    label: 'Nông sản nhập khẩu & phân phối sỉ',
    mode: 'b2b',
    artifacts: ['lô tỏi/hành mới về', 'bảng giá sỉ hôm nay', 'hợp đồng cung ứng dài hạn', 'chứng từ nhập khẩu', 'quy trình kiểm hàng', 'kho bảo quản'],
    metricUnit: 'tiếng',
    metricRange: [2, 24],
    moneyUnit: 'triệu đồng/tấn',
    moneyRange: [5, 80],
    visual: 'ánh sáng tự nhiên sáng sớm trong kho/chợ đầu mối, bối cảnh kho hàng/cổng nhập/xe tải nông sản, trang phục đồng phục thực địa gọn gàng, nhấn frame vào củ quả tươi và quy trình phân loại/đóng gói',
    sceneWords: ['kho hàng chợ đầu mối Hóc Môn', 'xe tải nhập hàng sáng sớm', 'bàn cân kiểm hàng', 'lô tỏi/hành tươi vừa về'],
  },
};

const GENERIC_VOCAB = {
  label: 'lĩnh vực của khách hàng',
  mode: 'skill',
  artifacts: ['quy trình hằng ngày', 'bảng kế hoạch', 'báo cáo kết quả', 'công cụ làm việc chính', 'tài liệu tham khảo'],
  metricUnit: 'phút',
  metricRange: [7, 40],
  moneyUnit: 'triệu đồng',
  moneyRange: [1, 20],
  visual: 'ánh sáng tự nhiên rõ nét, bối cảnh không gian làm việc thật của khách hàng, trang phục đời thường gọn gàng, nhấn frame vào hành động/kết quả cụ thể',
  sceneWords: ['không gian làm việc', 'công cụ chính', 'bảng kế hoạch', 'kết quả trước-sau'],
};

function resolveIndustryVocab(industryField) {
  const s = (industryField || '').toLowerCase();
  for (const key of Object.keys(INDUSTRY_VOCAB)) {
    const patterns = key.split('|');
    if (patterns.some((p) => s.includes(p))) return INDUSTRY_VOCAB[key];
  }
  return GENERIC_VOCAB;
}

// ---------------------------------------------------------------------------
// Section 1 — Industry Preset content
// ---------------------------------------------------------------------------
function buildBarrierExplanations(barriers, vocab, rng) {
  const b2bAngles = [
    (b) => `"${b}" là nỗi lo phổ biến với hầu hết cơ sở chế biến khi tìm nhà cung cấp mới — thường xuất phát từ ít nhất một lần bị hụt hàng hoặc giá biến động mạnh trước đây.`,
    (b) => `"${b}" khiến họ trì hoãn quyết định hợp tác vì sợ rủi ro — họ cần bằng chứng cụ thể từ nhà cung cấp (quy trình thật, khách hàng tham chiếu, cam kết bằng văn bản) trước khi tin tưởng.`,
    (b) => `Đây là rào cản về uy tín hơn là về giá: dù giá tốt hơn, họ vẫn ngại đổi nhà cung cấp vì "${b}" — lo chi phí chuyển đổi và rủi ro gián đoạn sản xuất.`,
    (b) => `"${b}" thường được củng cố bởi trải nghiệm xấu với nhà sỉ cũ: hứa một đằng làm một nẻo, hoặc chất lượng lô đầu tốt nhưng các lô sau xuống cấp.`,
  ];
  const genericAngles = [
    (b) => `Khách hàng nghe nói về "${b}" nhiều lần nhưng chưa thấy ai trong hoàn cảnh giống mình làm được, nên mặc định nghĩ đây không áp dụng cho họ.`,
    (b) => `"${b}" khiến họ trì hoãn vì sợ bỏ thời gian ra mà không thu lại được gì cụ thể — họ cần thấy kết quả trong vài ${vocab.metricUnit} đầu tiên mới tin.`,
    (b) => `Đây là rào cản về niềm tin vào bản thân hơn là về kiến thức: họ tin "${b}" là vấn đề của mình, không phải của phương pháp.`,
    (b) => `"${b}" thường bị củng cố bởi một lần thử thất bại trước đó (tự học, dùng sai công cụ, nghe lời khuyên chung chung), khiến họ ngại thử lại.`,
  ];
  const angles = vocab.mode === 'b2b' ? b2bAngles : genericAngles;
  return barriers.map((b, i) => angles[i % angles.length](b));
}

function buildPainPointAngles(pains, vocab, rng) {
  const b2bTriedAngles = [
    (p) => `Đã thử mua qua các đầu mối trung gian nhỏ, nhưng giá cao hơn và chất lượng không đồng đều giữa các lô — không thể lập kế hoạch sản xuất ổn định.`,
    (p) => `Đã ký thử với nhà cung cấp khác, nhưng bị giao hàng trễ liên tục và không liên hệ được khi cần đổi lịch — ảnh hưởng cả dây chuyền.`,
    (p) => `Đã tự tìm nguồn nhập trực tiếp từ chợ đầu mối, nhưng không tìm được đơn vị xuất hóa đơn VAT đúng quy định, gây khó hạch toán cho bộ phận kế toán.`,
  ];
  const genericTriedAngles = [
    (p) => `Đã thử tự tìm hiểu qua video miễn phí và nhóm Facebook, nhưng thông tin rời rạc khiến họ áp dụng sai và bỏ giữa đường sau khoảng ${oddInt(rng, 3, 14)} ngày.`,
    (p) => `Đã nhờ người quen chỉ qua loa, làm theo được vài lần rồi quên vì không có hệ thống lưu lại từng bước.`,
    (p) => `Đã mua một khoá học giá rẻ nhưng nội dung quá chung, không đúng với ${vocab.sceneWords[0]} thực tế của họ nên không dùng được.`,
  ];
  const triedAngles = vocab.mode === 'b2b' ? b2bTriedAngles : genericTriedAngles;
  return pains.map((p, i) => ({
    pain: p,
    tried: triedAngles[i % triedAngles.length](p),
  }));
}

function buildPricingTechniques(vocab, rng, input) {
  const moneyEx = () => oddInt(rng, vocab.moneyRange[0], vocab.moneyRange[1]);
  const timeEx = () => oddInt(rng, vocab.metricRange[0], vocab.metricRange[1]);
  if (vocab.mode === 'b2b') {
    return [
      {
        tech: 'So sánh với giá mua qua trung gian',
        example: `"Giá qua trung gian đang ${moneyEx()} ${vocab.moneyUnit}, nhập thẳng từ ${input ? input.brandName : 'chúng tôi'} chỉ ${moneyEx()} ${vocab.moneyUnit} — tiết kiệm ngay từ đơn đầu tiên."`,
      },
      {
        tech: 'Định giá theo chi phí đứt hàng',
        example: `"1 lần đứt nguyên liệu có thể làm trễ cả dây chuyền sản xuất ${timeEx()} ${vocab.metricUnit} — hợp đồng cung ứng dài hạn với cam kết giao đúng hẹn là khoản đầu tư, không phải chi phí."`,
      },
      {
        tech: 'Chia nhỏ giá trị theo khối lượng',
        example: `"Giá sỉ ${moneyEx()} ${vocab.moneyUnit} cho đơn từ ${timeEx()} tấn trở lên — càng đặt nhiều càng tiết kiệm, tính ra mỗi kg còn thấp hơn giá lẻ chợ ${oddInt(rng, 10, 40)}%."`,
      },
      {
        tech: 'Anchor bằng rủi ro chất lượng không kiểm soát được',
        example: `"Hàng không rõ nguồn gốc tiết kiệm ${moneyEx()} ${vocab.moneyUnit}/tấn nhưng 1 lô hỏng là mất trắng ${oddInt(rng, 3, 10)} lần số tiền đó vào nguyên liệu và thành phẩm."`,
      },
    ];
  }
  if (vocab.mode === 'healing') {
    return [
      {
        tech: 'Anchor bằng chi phí trị liệu/tư vấn tâm lý ngoài',
        example: `"Một buổi nói chuyện với chuyên gia tâm lý ngoài đã ${moneyEx()} ${vocab.moneyUnit}, ở đây em chỉ cần ${moneyEx()} ${vocab.moneyUnit} mà có cả hành trình đồng hành lâu dài."`,
      },
      {
        tech: 'Quy đổi theo giá trị cảm xúc nhận lại',
        example: `"Chỉ sau ${timeEx()} ${vocab.metricUnit} đồng hành, chị có hẳn một ${vocab.artifacts[0]} của riêng mình, đáng hơn nhiều so với số tiền bỏ ra."`,
      },
      {
        tech: 'So sánh với thói quen chi tiêu hiện tại',
        example: `"Giá Premium bằng đúng ${moneyEx()} ly cà phê mỗi tháng, nhưng đổi lại là cả một không gian an toàn để chữa lành, không phải tự mình xoay xở."`,
      },
      {
        tech: 'Định giá theo chi phí của việc tiếp tục một mình',
        example: `"Nếu cứ tự đọc và tự xử lý cảm xúc một mình, có khi mất ${timeEx()} ${vocab.metricUnit} vẫn chưa rõ vấn đề ở đâu — trong khi Premium giúp đi đúng hướng ngay từ đầu."`,
      },
    ];
  }
  return [
    {
      tech: 'Anchor bằng chi phí cơ hội',
      example: `"Một buổi tư vấn ngoài bên ngoài đã ${moneyEx()} ${vocab.moneyUnit}, ở đây chị chỉ cần ${moneyEx()} ${vocab.moneyUnit} mà có cả hệ thống dùng lại nhiều lần."`,
    },
    {
      tech: 'Chia nhỏ theo kết quả tức thì',
      example: `"Chỉ ${timeEx()} ${vocab.metricUnit} là anh có ngay một ${vocab.artifacts[0]} hoàn chỉnh, tính ra mỗi lần dùng chưa tới vài chục nghìn."`,
    },
    {
      tech: 'So sánh với thói quen chi tiêu hiện tại',
      example: `"Giá Premium bằng đúng ${moneyEx()} ly cà phê mỗi tháng, nhưng đổi lại là ${vocab.artifacts[1]} làm sẵn, không phải tự mò."`,
    },
    {
      tech: 'Định giá theo rủi ro nếu không hành động',
      example: `"Nếu để tiếp tục làm tay, mỗi ${vocab.artifacts[2]} đang mất khoảng ${timeEx()} ${vocab.metricUnit} — quy ra một tháng còn tốn hơn cả gói Premium."`,
    },
  ];
}

function buildSectionOne(input, vocab, rng) {
  return {
    targetAudience: [
      { key: 'Giới tính / độ tuổi', value: input.audience.demo },
      { key: 'Thu nhập / nghề nghiệp', value: input.audience.income },
      { key: 'Mối quan tâm chính', value: input.audience.interest },
      { key: 'Mua cho ai', value: input.audience.buysFor },
    ],
    pricingTiers: [
      { level: 'Entry', range: input.products.entry.price, product: input.products.entry.name },
      { level: 'Mid', range: input.products.mid.price, product: input.products.mid.name },
      { level: 'Premium', range: input.products.premium.price, product: input.products.premium.name },
    ],
    barriers: buildBarrierExplanations(input.barriers, vocab, rng).map((explain, i) => ({
      n: i + 1,
      barrier: input.barriers[i],
      explain,
    })),
    pains: buildPainPointAngles(input.pains, vocab, rng).map((p, i) => ({
      n: i + 1,
      pain: p.pain,
      tried: p.tried,
    })),
    quotes: input.quotes,
    tonePresets: buildTonePresets(input.tone),
    visual: {
      'Ánh sáng': vocab.visual.split(',')[0].trim(),
      'Nhấn frame': vocab.visual.split(',')[3] ? vocab.visual.split(',')[3].trim() : vocab.visual.split(',').slice(-1)[0].trim(),
      'Bối cảnh': vocab.sceneWords.join(', '),
      'Trang phục': vocab.visual.split(',')[2] ? vocab.visual.split(',')[2].trim() : 'đời thường gọn gàng',
    },
    pricingTechniques: buildPricingTechniques(vocab, rng, input),
    hashtags: {
      'Thương hiệu': input.hashtag || `#${input.brandName.replace(/\s+/g, '')}`,
      'Sản phẩm': `#${(input.products.mid.name || 'sanpham').replace(/\s+/g, '')}`,
      'Nhu cầu': `#${vocab.label.split('/')[0].trim().replace(/\s+/g, '')}`,
      'Tiếng Anh': `#${vocab.label.split('/')[0].trim().replace(/\s+/g, '').toLowerCase()}tips`,
    },
  };
}

function buildTonePresets(tone) {
  const all = [
    { tone: 'Chuyên gia', when: 'Khi giải thích kiến thức, công nghệ, hoặc trả lời câu hỏi cần độ tin cậy cao' },
    { tone: 'Bạn bè', when: 'Khi kể chuyện hành trình cá nhân, chia sẻ thất bại, tương tác bình luận' },
    { tone: 'Năng lượng', when: 'Khi mở đầu video, kêu gọi hành động, hoặc giới thiệu kết quả/demo nhanh' },
    { tone: 'Kết hợp', when: 'Mặc định cho hầu hết nội dung: mở bằng năng lượng, giữa bằng chuyên gia, kết bằng bạn bè' },
  ];
  // Put the user's chosen tone first, keep others as secondary use-cases.
  const chosen = all.find((t) => t.tone.toLowerCase() === String(tone).toLowerCase());
  if (!chosen) return all;
  return [chosen, ...all.filter((t) => t !== chosen)];
}

// ---------------------------------------------------------------------------
// Section 2 — 80 topics across 5 tracks
// ---------------------------------------------------------------------------
const FORMATS_A_B2B = ['Behind the scenes', 'So sánh chất lượng', 'Cập nhật giá/lô hàng', 'Tutorial chọn hàng', 'Trước-Sau kiểm hàng'];
const FORMATS_A_SKILL = ['Demo thật', 'Tutorial', 'Before-After', 'List video', 'Experiment'];
const FORMATS_A_HEALING = ['Trích đoạn + insight', 'Đọc & cảm nhận', 'Before-After cảm xúc', 'List sách/chủ đề', 'Thử áp dụng bài học'];
const FORMATS_B = ['Origin story', 'Lần đầu thất bại', 'Peer story', 'Belief change'];
const FORMATS_C = ['So sánh tool/phương pháp', 'FAQ viral', 'Expert breakdown', 'Trend update'];
const FORMATS_D = ['Community invite', 'Lead magnet', 'Testimonial', 'Event invite', 'Course preview'];
const FORMATS_E = ['Origin story', 'Vulnerability', 'Milestone', 'Gratitude', 'Brand values'];

const HOOKS_A_B2B = [
  (artifact, metric, unit) => `Người mua tò mò vì thấy quy trình thật phía sau ${artifact} — muốn biết nhà cung cấp có đang làm nghiêm hay không.`,
  (artifact, metric, unit) => `Người mua bị thu hút bởi sự minh bạch về chất lượng ${artifact} — đây là điều ít nhà sỉ nào dám show thật.`,
  (artifact, metric, unit) => `Người mua thấy giá và chất lượng ${artifact} được so sánh rõ ràng, giúp họ đưa ra quyết định nhanh hơn.`,
  (artifact, metric, unit) => `Người mua an tâm hơn vì thấy ${artifact} được kiểm soát từ khâu nhập — không phải lời hứa suông.`,
  (artifact, metric, unit) => `Người mua thấy quy trình giao nhận ${artifact} rõ ràng trong ${metric} ${unit} — giảm lo ngại về hàng về trễ hay không đúng chất lượng.`,
  (artifact, metric, unit) => `Người mua tò mò vì ${artifact} được phân loại theo tiêu chuẩn cụ thể — giúp họ biết chính xác loại nào phù hợp với nhu cầu.`,
  (artifact, metric, unit) => `Người mua thấy giá ${artifact} hôm nay được cập nhật thật, không bị "giá ảo" như nhiều chỗ khác.`,
];

const HOOKS_A_SKILL = [
  (artifact, metric, unit) => `Khán giả tò mò vì thời gian ${metric} ${unit} ngắn hơn họ tưởng, muốn xem ngay từng bước thật để áp dụng cho ${artifact}.`,
  (artifact, metric, unit) => `Khán giả bị thu hút bởi phép so sánh trước-sau rõ ràng, muốn biết cách làm mới khác gì cách cũ với ${artifact}.`,
  (artifact, metric, unit) => `Khán giả thích thử thách có giới hạn thời gian, xem trực tiếp không cắt ghép để tin ${artifact} là thật.`,
  (artifact, metric, unit) => `Khán giả thấy tiếc vì không biết cách này sớm hơn, muốn lưu lại để áp dụng ngay cho ${artifact}.`,
  (artifact, metric, unit) => `Khán giả tò mò vì con số tăng tốc cụ thể trên ${artifact}, muốn hiểu điều gì đã thay đổi để đạt được điều đó.`,
  (artifact, metric, unit) => `Khán giả muốn biết liệu cách làm ${artifact} này có áp dụng được cho hoàn cảnh riêng của họ không.`,
  (artifact, metric, unit) => `Khán giả bị cuốn vì thấy kết quả thật ngay trên ${artifact}, không phải lời hứa suông.`,
];

const HOOKS_A_HEALING = [
  (artifact, metric, unit) => `Khán giả thấy mình trong cảm xúc được nhắc tới, muốn nghe trọn vẹn đoạn trích từ ${artifact}.`,
  (artifact, metric, unit) => `Khán giả tò mò vì sự thay đổi cảm xúc rõ rệt, muốn biết điều gì đã chạm vào họ đến vậy.`,
  (artifact, metric, unit) => `Khán giả đồng cảm vì cũng từng ở trạng thái cảm xúc "trước", muốn xem hành trình đi đến "sau" thế nào.`,
  (artifact, metric, unit) => `Khán giả thấy được gợi mở một góc nhìn mới, muốn lưu lại để đọc chậm lại sau.`,
  (artifact, metric, unit) => `Khán giả cảm thấy được thấu hiểu, muốn biết bài học đó áp dụng vào đời mình thế nào sau ${metric} ${unit}.`,
];

function buildTrackA(input, vocab, rng, count) {
  const isHealing = vocab.mode === 'healing';
  const isB2B = vocab.mode === 'b2b';
  const formats = isHealing ? FORMATS_A_HEALING : isB2B ? FORMATS_A_B2B : FORMATS_A_SKILL;
  const hooks = isHealing ? HOOKS_A_HEALING : isB2B ? HOOKS_A_B2B : HOOKS_A_SKILL;
  const topics = [];
  for (let i = 0; i < count; i++) {
    const artifact = vocab.artifacts[i % vocab.artifacts.length];
    const metric = oddInt(rng, vocab.metricRange[0], vocab.metricRange[1]);
    const format = formats[i % formats.length];
    topics.push({
      title: variantTitleA(input, vocab, rng, artifact, metric, i),
      format,
      hook: hooks[i % hooks.length](artifact, metric, vocab.metricUnit),
    });
  }
  return topics;
}

function variantTitleA(input, vocab, rng, artifact, metric, i) {
  if (vocab.mode === 'b2b') {
    const b2bTemplates = [
      () => `${artifact}: quy trình kiểm hàng chúng tôi làm trước khi xuất cho từng đơn`,
      () => `So sánh ${artifact} loại 1 vs loại 2 — khác nhau ở đâu và ảnh hưởng giá thế nào`,
      () => `Cập nhật giá sỉ ${artifact} hôm nay — theo lô thực tế, không phải giá niêm yết`,
      () => `${oddInt(rng, 3, 7)} điều cần kiểm tra khi nhận ${artifact} để tránh thiệt hại về sau`,
      () => `Từ lúc hàng lên tàu ở Ấn Độ đến khi ${artifact} về kho Hóc Môn — mất bao lâu và qua những khâu nào`,
      () => `Tại sao ${artifact} của ${input.brandName} giữ được ${metric} ${vocab.metricUnit} mà vẫn tươi — quy trình bảo quản thật`,
      () => `${artifact} loại nào phù hợp với cơ sở chế biến, loại nào phù hợp với bếp nhà hàng — phân biệt rõ để không mua nhầm`,
    ];
    return b2bTemplates[i % b2bTemplates.length]();
  }
  if (vocab.mode === 'healing') {
    const healingTemplates = [
      () => `Đọc xong ${artifact}, tôi nhận ra một điều thay đổi cách tôi nhìn về chính mình`,
      () => `Một đoạn trong ${artifact} khiến tôi phải dừng lại đọc lại lần hai`,
      () => `Áp dụng bài học từ ${artifact} trong ${metric} ${vocab.metricUnit} — đây là điều tôi nhận ra`,
      () => `Câu nói trong ${artifact} mà tôi ước mình đọc được sớm hơn ${oddInt(rng, 1, 5)} năm`,
      () => `Sau ${metric} ${vocab.metricUnit} sống chậm lại theo ${artifact}, cảm xúc của tôi thay đổi thế nào`,
    ];
    return healingTemplates[i % healingTemplates.length]();
  }
  const templates = [
    () => `Làm xong ${artifact} trong ${metric} ${vocab.metricUnit} — quy trình từng bước tôi đang dùng`,
    () => `So sánh trước-sau: ${artifact} mất ${oddInt(rng, metric + 10, metric + 40)} ${vocab.metricUnit} làm tay vs ${metric} ${vocab.metricUnit} làm theo cách mới`,
    () => `Thử thách ${metric} ${vocab.metricUnit}: hoàn thành ${artifact} ngay trên màn hình, không cắt ghép`,
    () => `${oddInt(rng, 3, 9)} bước làm ${artifact} mà tôi ước có người chỉ từ ${oddInt(rng, 1, 5)} năm trước`,
    () => `Tại sao ${artifact} của tôi nhanh hơn ${oddInt(rng, 2, 9)} lần sau khi đổi cách làm`,
    () => `Tôi để ${metric} ${vocab.metricUnit} làm thử ${artifact} ngay trước camera — kết quả thật, không chỉnh sửa`,
    () => `${artifact}: cách tôi rút từ ${oddInt(rng, metric + 20, metric + 60)} ${vocab.metricUnit} xuống còn ${metric} ${vocab.metricUnit}`,
  ];
  return templates[i % templates.length]();
}

const HOOKS_B = [
  (barrier) => `Khán giả thấy mình trong nỗi sợ "${barrier}" và nhận ra người khác cũng từng nghĩ vậy rồi vượt qua được.`,
  (barrier) => `Khán giả bất ngờ vì câu chuyện thật về "${barrier}" không kết thúc như họ nghĩ, muốn xem điều gì đã thay đổi.`,
  (barrier) => `Khán giả cảm thấy được động viên vì thấy một người bình thường, có cùng rào cản "${barrier}", vẫn làm được.`,
  (barrier) => `Khán giả tò mò vì niềm tin cũ về "${barrier}" bị thử thách, muốn nghe góc nhìn khác để tự đối chiếu.`,
  (barrier) => `Khán giả thấy được an ủi vì không phải một mình đang vật lộn với "${barrier}".`,
  (barrier) => `Khán giả muốn biết cụ thể điều gì đã giúp vượt qua "${barrier}" để áp dụng cho chính mình.`,
];

function buildTrackB(input, vocab, rng, count) {
  const topics = [];
  const perBarrier = Math.ceil(count / input.barriers.length);
  let idx = 0;
  for (const barrier of input.barriers) {
    for (let j = 0; j < perBarrier && idx < count; j++, idx++) {
      const format = FORMATS_B[idx % FORMATS_B.length];
      topics.push({
        title: variantTitleB(barrier, vocab, rng, idx),
        format,
        hook: HOOKS_B[idx % HOOKS_B.length](barrier),
      });
    }
  }
  return topics.slice(0, count);
}

function variantTitleB(barrier, vocab, rng, i) {
  const templates = [
    () => `Tôi từng nghĩ "${barrier}" — đây là điều thay đổi suy nghĩ đó`,
    () => `Ngày tôi suýt bỏ vì "${barrier}", và điều đã giữ tôi lại`,
    () => `Một người cũng từng "${barrier}" — sau ${oddInt(rng, 9, 60)} ngày kết quả thế nào`,
    () => `Sự thật về "${barrier}" mà không ai nói với bạn`,
    () => `Tin nhắn của một người từng nói "${barrier}" — và điều đã xảy ra sau đó ${oddInt(rng, 9, 60)} ngày`,
    () => `Nếu bạn cũng đang nghĩ "${barrier}", hãy đọc câu chuyện này trước`,
  ];
  return templates[i % templates.length]();
}

const HOOKS_C = [
  (artifact) => `Khán giả thấy đáng tin hơn vì có người đã so sánh kỹ ${artifact} thay họ, không phải tự mò mẫm.`,
  (artifact) => `Khán giả cảm thấy được giải đáp đúng thắc mắc về ${artifact} mà họ đang ngại hỏi công khai.`,
  (artifact) => `Khán giả thấy nội dung về ${artifact} có chiều sâu chuyên môn, không chỉ là quảng cáo bề mặt.`,
  (artifact) => `Khán giả muốn cập nhật để không bị lạc hậu so với những người cùng làm ${artifact}.`,
  (artifact) => `Khán giả tò mò vì góc nhìn về ${artifact} khác với những gì họ vẫn nghe.`,
  (artifact) => `Khán giả muốn lưu lại vì đây là tổng hợp gọn gàng về ${artifact}, đỡ phải tự tìm rải rác.`,
  (artifact) => `Khán giả thấy được an tâm hơn về ${artifact} khi có người đứng ra giải thích rõ ràng.`,
];

function buildTrackC(input, vocab, rng, count) {
  const topics = [];
  for (let i = 0; i < count; i++) {
    const artifact = vocab.artifacts[i % vocab.artifacts.length];
    const format = FORMATS_C[i % FORMATS_C.length];
    topics.push({
      title: variantTitleC(input, vocab, rng, artifact, i),
      format,
      hook: HOOKS_C[i % HOOKS_C.length](artifact),
    });
  }
  return topics;
}

function variantTitleC(input, vocab, rng, artifact, i) {
  const templates = [
    () => `${oddInt(rng, 3, 7)} cách làm ${artifact} — cái nào thực sự đáng dùng?`,
    () => `Câu hỏi tôi nhận được nhiều nhất về ${artifact}, trả lời thẳng luôn`,
    () => `Phân tích sai lầm phổ biến khi làm ${artifact} — và cách sửa trong ${oddInt(rng, 1, 9)} bước`,
    () => `Xu hướng mới nhất về ${artifact} năm nay — cái gì còn đúng, cái gì đã lỗi thời`,
    () => `${oddInt(rng, 2, 6)} công cụ làm ${artifact} tôi đã thử — đâu là lựa chọn đáng tiền nhất`,
    () => `Sự khác biệt giữa làm ${artifact} đúng cách và làm cho có — ${oddInt(rng, 3, 9)} điểm cần để ý`,
    () => `Tôi từng hiểu sai về ${artifact} suốt ${oddInt(rng, 1, 5)} năm — đây là điều đúng`,
  ];
  return templates[i % templates.length]();
}

const HOOKS_D = [
  'Khán giả cảm thấy đây là bước đi an toàn, miễn phí, dễ thử trước khi cam kết lớn hơn.',
  'Khán giả thấy có giới hạn số lượng nên muốn hành động ngay, sợ lỡ mất.',
  'Khán giả tin tưởng hơn vì thấy người thật đã dùng và có kết quả thật.',
  'Khán giả thấy cơ hội tương tác trực tiếp hiếm có, muốn giữ chỗ trước khi hết.',
  'Khán giả muốn xem trước để chắc chắn trước khi quyết định chi tiền cho gói lớn nhất.',
  'Khán giả thấy mốc thời gian cụ thể nên dễ tưởng tượng kết quả của riêng mình.',
  'Khán giả muốn tham gia ngay vì thấy cộng đồng đang hoạt động sôi nổi, không phải nhóm bỏ hoang.',
];

const FORMATS_D_B2B = ['Báo giá sỉ mới nhất', 'Case study khách hàng', 'Tham quan kho hàng', 'Chính sách hợp tác sỉ', 'Khuyến mãi lô lớn'];

function buildTrackD(input, vocab, rng, count) {
  const topics = [];
  for (let i = 0; i < count; i++) {
    const artifact = vocab.artifacts[i % vocab.artifacts.length];
    const format = vocab.mode === 'b2b' ? FORMATS_D_B2B[i % FORMATS_D_B2B.length] : FORMATS_D[i % FORMATS_D.length];
    topics.push({
      title: variantTitleD(input, vocab, rng, artifact, i),
      format,
      hook: HOOKS_D[i % HOOKS_D.length],
    });
  }
  return topics;
}

function variantTitleD(input, vocab, rng, artifact, i) {
  if (vocab.mode === 'b2b') {
    const b2bTemplates = [
      () => `Báo giá sỉ ${artifact} tháng này — nhắn số lượng là có giá ngay trong ${oddInt(rng, 1, 3)} tiếng`,
      () => `Khách hàng ${input.brandName} tiết kiệm ${oddInt(rng, 5, 30)} triệu/tháng tiền nguyên liệu — họ đã làm thế nào`,
      () => `Tham quan kho ${input.brandName} — quy trình bảo quản tỏi/hành nhập khẩu giữ tươi ${oddInt(rng, 3, 14)} ngày`,
      () => `Chính sách hợp tác sỉ của ${input.brandName}: giao đúng giờ, có VAT, giá không tăng đột ngột — đọc trước khi liên hệ`,
      () => `Đăng ký nhận báo giá ${artifact} tháng ${oddInt(rng, 7, 12)} — còn ${oddInt(rng, 5, 20)} slot ưu tiên giá sỉ đặc biệt`,
      () => `${oddInt(rng, 3, 7)} câu hỏi cơ sở chế biến hay hỏi nhất trước khi ký hợp đồng với ${input.brandName} — trả lời thẳng`,
      () => `Nhập ${artifact} lần đầu từ ${input.brandName}? Đây là quy trình từng bước từ liên hệ đến nhận hàng`,
    ];
    return b2bTemplates[i % b2bTemplates.length]();
  }
  const templates = [
    () => `Vào nhóm cộng đồng miễn phí của ${input.brandName} — nơi mọi người chia sẻ ${artifact} thật (đã có ${oddInt(rng, 100, 2999)} thành viên)`,
    () => `Tải mẫu ${artifact} miễn phí tôi đang dùng (giới hạn ${oddInt(rng, 50, 199)} suất)`,
    () => `Học viên ${input.brandName} chia sẻ thật: kết quả sau ${oddInt(rng, 14, 90)} ngày dùng ${input.products.mid.name}`,
    () => `Buổi workshop trực tiếp về ${artifact} sắp tới — chỗ trống còn lại ${oddInt(rng, 5, 27)}`,
    () => `Xem trước bên trong ${input.products.premium.name} — phần ${artifact} tôi mở cho khách quan tâm xem trước`,
    () => `${oddInt(rng, 3, 9)} câu hỏi khách hỏi nhiều nhất trước khi mua ${input.products.mid.name} — trả lời hết trong video này`,
    () => `Tặng ${artifact} mẫu khi đăng ký tư vấn ${input.products.premium.name} trong ${oddInt(rng, 3, 14)} ngày tới`,
  ];
  return templates[i % templates.length]();
}

const HOOKS_E = [
  'Khán giả thấy bất ngờ vì background trước đây khác hẳn hiện tại, tạo sự đồng cảm với hành trình thay đổi.',
  'Khán giả cảm động trước sự thành thật về thời điểm yếu lòng nhất, thấy thương hiệu gần gũi hơn.',
  'Khán giả tự hào cùng và muốn xem lại hành trình đã đồng hành từ đâu tới đâu.',
  'Khán giả cảm thấy được trân trọng như một phần của hành trình, không chỉ là khách hàng.',
  'Khán giả thấy được sự thật phía sau ánh đèn, không chỉ là hình ảnh hào nhoáng trên kênh.',
  'Khán giả tò mò vì một quyết định bất ngờ đã thay đổi cả hướng đi của thương hiệu.',
  'Khán giả thấy giá trị thật của thương hiệu qua một hành động cụ thể, không phải lời nói suông.',
  'Khán giả cảm thấy gắn bó hơn khi biết điều gì đã khiến người sáng lập kiên trì đến giờ.',
];

function buildTrackE(input, vocab, rng, count) {
  const topics = [];
  for (let i = 0; i < count; i++) {
    const format = FORMATS_E[i % FORMATS_E.length];
    topics.push({
      title: variantTitleE(input, vocab, rng, i),
      format,
      hook: HOOKS_E[i % HOOKS_E.length],
    });
  }
  return topics;
}

function variantTitleE(input, vocab, rng, i) {
  const templates = [
    () => `Trước khi làm ${input.brandName}, tôi từng là ${input.background}`,
    () => `Ngày tôi suýt bỏ ${input.brandName} — và lý do tôi không bỏ`,
    () => `${oddInt(rng, 1, 9)} năm nhìn lại: cột mốc tôi tự hào nhất với ${input.brandName}`,
    () => `Cảm ơn ${oddInt(rng, 100, 9999)} người đã đồng hành cùng ${input.brandName} — câu chuyện chưa kể`,
    () => `Quyết định khó nhất tôi từng đưa ra khi xây ${input.brandName}, và điều xảy ra sau đó`,
    () => `Một ngày làm việc thật của tôi phía sau ${input.brandName} — không có gì hào nhoáng cả`,
    () => `Giá trị tôi sẽ không bao giờ đánh đổi khi xây ${input.brandName}, dù được trả giá cao`,
    () => `Câu nói của một khách hàng khiến tôi nhớ vì sao mình bắt đầu ${input.brandName}`,
  ];
  return templates[i % templates.length]();
}

function buildContentPlan(input, vocab, rng) {
  const counts = { A: 20, B: 22, C: 18, D: 12, E: 8 };
  const trackAName = vocab.mode === 'healing'
    ? `${vocab.label.split('/')[0].trim()} & Insight Thật`
    : vocab.mode === 'b2b'
    ? `${vocab.label.split('/')[0].trim()} — Minh Bạch & Chất Lượng`
    : `${vocab.label.split('/')[0].trim()} Thực Chiến`;
  const trackADesc = vocab.mode === 'healing'
    ? 'Trải nghiệm đọc/cảm nhận thật, có chi tiết cụ thể, hook chạm cảm xúc'
    : vocab.mode === 'b2b'
    ? 'Behind the scenes thật, cập nhật giá/lô hàng, so sánh chất lượng — xây trust bằng minh bạch'
    : 'Demo thật, có số liệu cụ thể, hook gây tò mò';
  const tracks = {
    A: { name: trackAName, desc: trackADesc, topics: buildTrackA(input, vocab, rng, counts.A) },
    B: { name: 'Hành Trình Thật + Phá Rào Cản', desc: 'Mỗi chủ đề gắn với 1 trong 4 rào cản đã nhập', topics: buildTrackB(input, vocab, rng, counts.B) },
    C: { name: 'Kiến Thức Chuyên Sâu + Tăng Trust', desc: 'So sánh, FAQ viral, expert breakdown, trend update', topics: buildTrackC(input, vocab, rng, counts.C) },
    D: { name: 'Chuyển Đổi Mềm', desc: 'Community invite, lead magnet, testimonial, event invite', topics: buildTrackD(input, vocab, rng, counts.D) },
    E: { name: 'Câu Chuyện Cá Nhân', desc: 'Origin story, vulnerability, milestone, gratitude, brand values', topics: buildTrackE(input, vocab, rng, counts.E) },
  };
  return { counts, tracks, total: 80 };
}

function generate(input) {
  const rng = makeSeededRng(input.brandName + '|' + input.industry);
  const vocab = resolveIndustryVocab(input.industry);
  const sectionOne = buildSectionOne(input, vocab, rng);
  const sectionTwo = buildContentPlan(input, vocab, rng);
  return { sectionOne, sectionTwo, vocab };
}

module.exports = { generate, resolveIndustryVocab, makeSeededRng, oddInt };
