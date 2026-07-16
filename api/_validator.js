'use strict';

// Near-duplicate title validator, shared by generate.js and revise.js.
// History: the original byte-identical check let through titles that were the
// same template with one noun swapped (the BảoÁnhbook incident) -- every pair
// of the 80 titles is checked for normalized token-set Jaccard similarity and
// for reused sentence frames (same 4 opening words + elevated overlap).
function normalizeTitle(title) {
  return String(title).toLowerCase().replace(/[.,!?"“”'’:;()\[\]—–-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function jaccard(aWords, bWords) {
  const a = new Set(aWords);
  const b = new Set(bWords);
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

const JACCARD_LIMIT = 0.65;

// tracks: { A: {topics: [{title}...]}, ... } — returns [{trackA, trackB, titleA, titleB, reason}]
function findTitleViolations(tracks) {
  const all = [];
  for (const [key, track] of Object.entries(tracks)) {
    for (const topic of track.topics) {
      const norm = normalizeTitle(topic.title);
      all.push({ track: key, title: topic.title, words: norm.split(' '), norm });
    }
  }
  const violations = [];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      let reason = null;
      const sim = jaccard(a.words, b.words);
      if (a.norm === b.norm) reason = 'trùng nguyên văn';
      else if (sim > JACCARD_LIMIT) reason = 'trùng-gần (Jaccard)';
      // Same opening alone isn't enough ("5 cuốn sách mình..." is a natural
      // list opener) -- flag only when the shared opening comes with elevated
      // overall word overlap, i.e. the same sentence frame reused.
      else if (a.words.slice(0, 4).join(' ') === b.words.slice(0, 4).join(' ') && sim > 0.4) reason = 'trùng khung câu mở đầu';
      if (reason) violations.push({ trackA: a.track, trackB: b.track, titleA: a.title, titleB: b.title, reason });
    }
  }
  return violations;
}

module.exports = { findTitleViolations, normalizeTitle, jaccard };
