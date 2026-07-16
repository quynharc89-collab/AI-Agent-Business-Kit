'use strict';

// Upstash Redis over REST -- same pattern as xaykenh-preview/api/_redis.js and
// skills/payment-automation. No npm dependency needed.
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

function assertConfigured() {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    throw new Error('Thiếu UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN trong biến môi trường.');
  }
}

async function command(args) {
  assertConfigured();
  const res = await fetch(UPSTASH_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Redis error: ${data.error || res.status}`);
  }
  return data.result;
}

async function rGet(key) {
  const result = await command(['GET', key]);
  return result ? JSON.parse(result) : null;
}

async function rSet(key, value, exSec) {
  const args = ['SET', key, JSON.stringify(value)];
  if (exSec) args.push('EX', String(exSec));
  await command(args);
}

async function rDel(key) {
  await command(['DEL', key]);
}

module.exports = { rGet, rSet, rDel };
