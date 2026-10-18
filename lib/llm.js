// Optional Gemini helper. If GEMINI_API_KEY is missing or every call fails,
// the agent falls back to simple rules so the app still works.
//
// Google retires model names over time, so we try a short list in order and
// remember the first one that answers. Set GEMINI_MODEL to put yours first.

const DEFAULT_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'];
let workingModel = null;

export function llmMode() {
  return process.env.GEMINI_API_KEY ? 'gemini' : 'rules';
}

function modelsToTry() {
  if (workingModel) return [workingModel];
  const preferred = (process.env.GEMINI_MODEL || '').trim();
  return [...new Set([preferred, ...DEFAULT_MODELS].filter(Boolean))];
}

async function callModel(model, prompt, temperature) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature, responseMimeType: 'application/json' },
    }),
  });
}

export async function askJSON(prompt, { temperature = 0.4 } = {}) {
  if (!process.env.GEMINI_API_KEY) throw new Error('No GEMINI_API_KEY set');

  let lastError = 'no model tried';
  for (const model of modelsToTry()) {
    const res = await callModel(model, prompt, temperature);
    if (res.status === 404 || res.status === 400) {
      const body = (await res.text()).slice(0, 300);
      if (/api key/i.test(body)) throw new Error(`Gemini rejected the API key: ${body}`);
      // Model retired or unknown: try the next one.
      lastError = `${model} unavailable (${res.status})`;
      if (workingModel === model) workingModel = null;
      continue;
    }
    if (!res.ok) throw new Error(`Gemini (${model}) returned ${res.status}: ${(await res.text()).slice(0, 200)}`);

    if (workingModel !== model) {
      workingModel = model;
      console.log(`Gemini: using model ${model}`);
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    return JSON.parse(cleaned);
  }
  throw new Error(`No Gemini model worked: ${lastError}`);
}
