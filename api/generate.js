'use strict';

const { Packer } = require('docx');
const { generate, resolveIndustryVocab } = require('../skills/brand-strategy-docx/src/generator');
const { buildDocument } = require('../skills/brand-strategy-docx/src/builder');
const { rewriteTrack, rewriteSectionOne } = require('./_contentwriter');
const { findTitleViolations } = require('./_validator');
const { requireAccount, acctKey, genKey, genListKey } = require('./_auth');
const { rGet, rSet } = require('./_redis');

const MAX_HISTORY = 20; // per account -- generous cap, purely to bound Redis growth

function sanitizeFilename(name) {
  return String(name || 'KhachHang').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '');
}

function validateIntake(intake) {
  if (!intake || typeof intake !== 'object') return 'Thiếu dữ liệu intake';
  const required = ['brandName', 'positioning', 'products', 'audience', 'barriers', 'pains', 'quotes', 'tone', 'industry'];
  for (const key of required) {
    if (!intake[key]) return `Thiếu field: ${key}`;
  }
  for (const tier of ['entry', 'mid', 'premium']) {
    if (!intake.products[tier] || !intake.products[tier].name || !intake.products[tier].price) {
      return `Thiếu products.${tier}`;
    }
  }
  for (const key of ['demo', 'income', 'interest', 'buysFor']) {
    if (!intake.audience[key]) return `Thiếu audience.${key}`;
  }
  if (!Array.isArray(intake.barriers) || intake.barriers.length !== 4) return 'barriers phải đúng 4 mục';
  if (!Array.isArray(intake.pains) || intake.pains.length !== 3) return 'pains phải đúng 3 mục';
  if (!Array.isArray(intake.quotes) || intake.quotes.length < 5 || intake.quotes.length > 10) return 'quotes phải từ 5 đến 10 mục';
  // VPC (Khung Giải Pháp Giá Trị) — optional for backwards compat; when
  // present each list needs 2-6 usable items.
  if (intake.vpc) {
    for (const key of ['customerJobs', 'gains', 'gainCreators', 'painRelievers']) {
      const list = intake.vpc[key];
      if (!Array.isArray(list) || list.length < 2 || list.length > 6) return `Khung Giải Pháp Giá Trị: mục ${key} cần 2-6 dòng`;
    }
  }
  return null;
}

// Pitfall #1 guard (see skills/brand-strategy-docx/SKILL.md "Common pitfalls" #1):
// resolveIndustryVocab does a plain substring match against `industry`, and the
// 'ai|công chức|...' key sits early in INDUSTRY_VOCAB, so any industry string
// containing the bare substring "ai" (e.g. "trang sức ứng dụng AI") can falsely
// match the công-chức/nhà-nước vocab. If that key matched but nothing in the
// customer's own words actually mentions the civil-service domain, it's the
// known false-positive trap -- fall back to a version of the string with AI
// tokens stripped, purely for vocab resolution (display fields are untouched).
const CIVIL_SERVICE_HINTS = /công chức|cong chuc|nhà nước|nha nuoc|cán bộ|can bo/i;

function guardIndustryVocabMismatch(intake) {
  const vocab = resolveIndustryVocab(intake.industry);
  const matchedCivilService = /công chức|nhà nước/i.test(vocab.label);
  const customerMentionsCivilService = CIVIL_SERVICE_HINTS.test(
    `${intake.industry} ${intake.positioning} ${intake.background || ''}`
  );
  if (matchedCivilService && !customerMentionsCivilService) {
    const sanitized = intake.industry.replace(/\bAI\b/gi, ' ').replace(/ai/gi, ' ').replace(/\s+/g, ' ').trim();
    if (sanitized) {
      return { ...intake, industry: sanitized };
    }
  }
  return intake;
}

// Near-dup validation lives in _validator.js (shared with revise.js).

// Run the LLM writer pass over the deterministic skeleton: 5 track calls in
// parallel + 1 section-one call. Tracks involved in title violations get one
// retry with an avoid-list; persistent violations fail the request (returning
// the old template output silently is not acceptable -- that output is exactly
// what the client rejected).
async function writeContent(intake, generated) {
  const trackKeys = Object.keys(generated.sectionTwo.tracks);
  const [sectionOneRewrite, ...trackResults] = await Promise.all([
    rewriteSectionOne(intake),
    ...trackKeys.map((key) => rewriteTrack(intake, key, generated.sectionTwo.tracks[key], generated.vocab.label)),
  ]);
  trackKeys.forEach((key, i) => { generated.sectionTwo.tracks[key].topics = trackResults[i]; });

  // Up to 2 retry rounds: a retried track can occasionally collide with a
  // *kept* track despite the avoid-list (observed: track C reproducing a track
  // B title verbatim when both answer the same barrier), so one extra round
  // meaningfully cuts the failure rate at ~30-60s each.
  let violations = findTitleViolations(generated.sectionTwo.tracks);
  for (let attempt = 1; violations.length > 0 && attempt <= 2; attempt++) {
    const badKeys = [...new Set(violations.flatMap((v) => [v.trackA, v.trackB]))];
    console.warn(`Title violations (round ${attempt}) in tracks ${badKeys.join(',')}; retrying`, violations.slice(0, 5));
    const avoidTitles = trackKeys
      .filter((key) => !badKeys.includes(key))
      .flatMap((key) => generated.sectionTwo.tracks[key].topics.map((t) => t.title));
    const retried = await Promise.all(
      badKeys.map((key) => rewriteTrack(intake, key, generated.sectionTwo.tracks[key], generated.vocab.label, avoidTitles))
    );
    badKeys.forEach((key, i) => { generated.sectionTwo.tracks[key].topics = retried[i]; });
    violations = findTitleViolations(generated.sectionTwo.tracks);
  }
  if (violations.length > 0) {
    console.error('Title violations persist after retries:', violations.slice(0, 10));
    throw new Error('Nội dung tạo ra còn chủ đề trùng lặp sau khi thử lại — vui lòng bấm "Tạo file .docx" thêm lần nữa (lượt của bạn chưa bị trừ).');
  }

  // Merge the rewritten Section 1 prose into the deterministic structure.
  generated.sectionOne.barriers = intake.barriers.map((barrier, i) => ({
    n: i + 1,
    barrier,
    explain: sectionOneRewrite.barrierExplanations[i],
  }));
  generated.sectionOne.pains = intake.pains.map((pain, i) => ({
    n: i + 1,
    pain,
    tried: sectionOneRewrite.painTried[i],
  }));
  generated.sectionOne.pricingTechniques = sectionOneRewrite.pricingTechniques;
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

    // Strip credentials so they don't ride along into prompts or storage.
    const { email, phone, ...intakeBody } = req.body;
    let intake = intakeBody;
    const validationError = validateIntake(intake);
    if (validationError) {
      res.status(400).json({ ok: false, message: validationError });
      return;
    }

    intake = guardIndustryVocabMismatch(intake);

    const generated = generate(intake);

    await writeContent(intake, generated);

    // Attach the Value Proposition Canvas so the builder renders it as its
    // own Section-1 table (customer profile ↔ value map).
    if (intake.vpc) {
      generated.sectionOne.vpc = {
        customerJobs: intake.vpc.customerJobs,
        gains: intake.vpc.gains,
        gainCreators: intake.vpc.gainCreators,
        painRelievers: intake.vpc.painRelievers,
        products: [intake.products.entry, intake.products.mid, intake.products.premium].map((p) => `${p.name} (${p.price})`),
        pains: intake.pains,
      };
    }

    const doc = buildDocument(intake, generated);
    const buffer = await Packer.toBuffer(doc);

    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const filename = `${sanitizeFilename(intake.brandName)}-ChienLuoc-${mm}-${yyyy}.docx`;

    // Consume 1 credit and persist this generation under its own genId --
    // "Tạo file mới" must never overwrite an earlier file/its revision-lượt,
    // each purchase's file stays retrievable in the account's history.
    const genId = `gen_${Date.now()}`;
    const createdAt = new Date().toISOString();
    account.credits = (account.credits || 0) - 1;
    await rSet(acctKey(account.email), account);
    await rSet(genKey(account.email, genId), {
      genId,
      intake,
      generated,
      filename,
      revisionsUsed: 0,
      createdAt,
    });

    const list = (await rGet(genListKey(account.email))) || [];
    list.unshift({ genId, brandName: intake.brandName, filename, createdAt, revisionsUsed: 0 });
    await rSet(genListKey(account.email), list.slice(0, MAX_HISTORY));

    const { sectionTwo } = generated;
    const summary = {
      estimatedPages: 1 + 9 + 1 + Object.keys(sectionTwo.tracks).length * 2,
      tracks: Object.entries(sectionTwo.tracks).map(([key, track]) => ({
        key,
        name: track.name,
        count: track.topics.length,
      })),
      total: sectionTwo.total,
      vocabLabel: generated.vocab.label,
    };

    res.status(200).json({
      ok: true,
      genId,
      filename,
      base64: buffer.toString('base64'),
      summary,
      revisionsRemaining: 3,
      creditsRemaining: account.credits,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: err.message || 'Lỗi máy chủ khi tạo file' });
  }
};

// Exposed for regression tests (Vercel only cares about the function export).
module.exports.findTitleViolations = findTitleViolations;
