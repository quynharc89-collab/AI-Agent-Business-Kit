'use strict';

const { Packer } = require('docx');
const { buildDocument } = require('../skills/brand-strategy-docx/src/builder');
const { rewriteTrack, rewriteSectionOne } = require('./_contentwriter');
const { findTitleViolations } = require('./_validator');
const { requireAccount, genKey, genListKey } = require('./_auth');
const { rGet, rSet } = require('./_redis');

const MAX_REVISIONS = 3;
const TRACK_KEYS = ['A', 'B', 'C', 'D', 'E'];

// POST /api/revise -- targeted revision: only the parts the customer named in
// `scope` are rewritten (with their feedback in the prompt); everything else
// stays byte-identical. Max 3 revisions per generation.
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

    const genId = String(req.body.genId || '').trim();
    if (!genId) {
      res.status(400).json({ ok: false, message: 'Thiếu genId — chưa rõ đang sửa file nào.' });
      return;
    }
    const gen = await rGet(genKey(account.email, genId));
    if (!gen || !gen.generated) {
      res.status(404).json({ ok: false, message: 'Không tìm thấy file này — có thể đã bị xoá hoặc genId sai.' });
      return;
    }
    if ((gen.revisionsUsed || 0) >= MAX_REVISIONS) {
      res.status(403).json({ ok: false, message: `Bạn đã dùng hết ${MAX_REVISIONS} lượt sửa cho file này. Mua thêm lượt (99.000đ) để tạo bản mới.` });
      return;
    }

    const scope = Array.isArray(req.body.scope) ? req.body.scope.filter((s) => TRACK_KEYS.includes(s) || s === 'sectionOne') : [];
    const feedback = String(req.body.feedback || '').trim();
    if (scope.length === 0) {
      res.status(400).json({ ok: false, message: 'Chọn ít nhất 1 phần cần sửa (Tuyến A-E hoặc Phần 1).' });
      return;
    }
    if (feedback.length < 20) {
      res.status(400).json({ ok: false, message: 'Góp ý quá ngắn — hãy mô tả cụ thể cần sửa gì (xem hướng dẫn góp ý hiệu quả).' });
      return;
    }

    const { intake, generated } = gen;
    const scopeTracks = scope.filter((s) => TRACK_KEYS.includes(s));
    const wantSectionOne = scope.includes('sectionOne');

    // Untouched tracks' titles become the avoid-list so rewritten tracks
    // don't collide with content that stays.
    const keptTitles = TRACK_KEYS
      .filter((key) => !scopeTracks.includes(key))
      .flatMap((key) => generated.sectionTwo.tracks[key].topics.map((t) => t.title));

    const vocabLabel = (generated.vocab && generated.vocab.label) || '';
    const jobs = [];
    if (wantSectionOne) jobs.push(['sectionOne', rewriteSectionOne(intake, feedback)]);
    for (const key of scopeTracks) {
      jobs.push([key, rewriteTrack(intake, key, generated.sectionTwo.tracks[key], vocabLabel, keptTitles, feedback)]);
    }
    const results = await Promise.all(jobs.map(([, p]) => p));

    jobs.forEach(([key], i) => {
      if (key === 'sectionOne') {
        const s1 = results[i];
        generated.sectionOne.barriers = intake.barriers.map((barrier, n) => ({ n: n + 1, barrier, explain: s1.barrierExplanations[n] }));
        generated.sectionOne.pains = intake.pains.map((pain, n) => ({ n: n + 1, pain, tried: s1.painTried[n] }));
        generated.sectionOne.pricingTechniques = s1.pricingTechniques;
      } else {
        generated.sectionTwo.tracks[key].topics = results[i];
      }
    });

    // Near-dup gate: up to 2 retry rounds limited to rewritten tracks
    // (untouched tracks were already valid among themselves).
    let violations = findTitleViolations(generated.sectionTwo.tracks);
    for (let attempt = 1; violations.length > 0 && attempt <= 2; attempt++) {
      const badKeys = [...new Set(violations.flatMap((v) => [v.trackA, v.trackB]))].filter((k) => scopeTracks.includes(k));
      if (badKeys.length === 0) break;
      console.warn(`Revise: title violations (round ${attempt}) in ${badKeys.join(',')}; retrying`, violations.slice(0, 5));
      const avoidTitles = TRACK_KEYS
        .filter((key) => !badKeys.includes(key))
        .flatMap((key) => generated.sectionTwo.tracks[key].topics.map((t) => t.title));
      const retried = await Promise.all(
        badKeys.map((key) => rewriteTrack(intake, key, generated.sectionTwo.tracks[key], vocabLabel, avoidTitles, feedback))
      );
      badKeys.forEach((key, i) => { generated.sectionTwo.tracks[key].topics = retried[i]; });
      violations = findTitleViolations(generated.sectionTwo.tracks);
    }
    if (violations.length > 0) {
      console.error('Revise: violations persist after retries:', violations.slice(0, 10));
      res.status(500).json({ ok: false, message: 'Bản sửa còn chủ đề trùng lặp — vui lòng bấm sửa lại lần nữa (lượt sửa này chưa bị trừ).' });
      return;
    }

    const doc = buildDocument(intake, generated);
    const buffer = await Packer.toBuffer(doc);

    gen.generated = generated;
    gen.revisionsUsed = (gen.revisionsUsed || 0) + 1;
    gen.lastFeedback = { scope, feedback, at: new Date().toISOString() };
    await rSet(genKey(account.email, genId), gen);

    // Keep the lightweight history index (shown at login) in sync so its
    // revisionsUsed count matches without re-fetching the full blob.
    const list = (await rGet(genListKey(account.email))) || [];
    const idx = list.findIndex((g) => g.genId === genId);
    if (idx !== -1) {
      list[idx].revisionsUsed = gen.revisionsUsed;
      await rSet(genListKey(account.email), list);
    }

    res.status(200).json({
      ok: true,
      filename: gen.filename,
      base64: buffer.toString('base64'),
      revisionsUsed: gen.revisionsUsed,
      revisionsRemaining: MAX_REVISIONS - gen.revisionsUsed,
      revisedParts: scope,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: err.message || 'Lỗi máy chủ khi sửa file' });
  }
};
