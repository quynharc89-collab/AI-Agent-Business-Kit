'use strict';

// Shared helper to call the Claude Messages API with a forced tool_choice so
// the response is always the exact structured JSON shape we ask for --
// no free-text parsing, no guessing what the model "meant".
//
// Model choice per call site (founder decision, 7/2026, after a real cost
// review): Sonnet 5 stays default for anything creative/quality-critical
// (segments, deepdive/VPC, the 80-topic writer) -- that quality is the whole
// reason the LLM writer pass replaced the old template generator in the first
// place. Haiku is only used for api/enrich.js's digest call (plain
// summarization of scraped text, no creative writing, near-zero quality risk).
const MODEL = 'claude-sonnet-5';
const MODEL_HAIKU = 'claude-haiku-4-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

async function callTool({ system, messages, tool, maxTokens = 4096, model = MODEL }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Thiếu ANTHROPIC_API_KEY trong biến môi trường của server.');
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages,
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const msg = (data && data.error && data.error.message) || JSON.stringify(data);
    throw new Error(`Anthropic API error (${response.status}): ${msg}`);
  }

  const toolUse = (data.content || []).find((c) => c.type === 'tool_use' && c.name === tool.name);
  if (!toolUse) {
    throw new Error('Claude không trả về tool_use như mong đợi.');
  }
  return toolUse.input;
}

module.exports = { callTool, MODEL, MODEL_HAIKU };
