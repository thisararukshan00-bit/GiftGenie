// POST /api/genie  — streams the agent's steps as newline-delimited JSON,
// then a final {"type":"result"} line. Works on Vercel and with server.js.
import { runGenie } from '../lib/agent.js';

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end('Use POST');
    return;
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    res.statusCode = 400;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ type: 'result', error: 'The request body was not valid JSON.' }));
    return;
  }

  res.statusCode = 200;
  res.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  const send = (obj) => res.write(JSON.stringify(obj) + '\n');

  try {
    const result = await runGenie(body, send);
    send({ type: 'result', ...result });
  } catch (e) {
    console.error(e);
    send({ type: 'result', error: 'GiftGenie hit an unexpected error. Try again in a moment.' });
  }
  res.end();
}
