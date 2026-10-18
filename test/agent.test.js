// Runs the agent end-to-end in demo mode (no API keys needed): `npm test`
import assert from 'node:assert/strict';
delete process.env.QLOO_API_KEY;
delete process.env.GEMINI_API_KEY;
const { runGenie, parseWithRules } = await import('../lib/agent.js');

const p = parseWithRules('My sister Nimmi turns 24. She loves Taylor Swift, Studio Ghibli films, Harry Potter books and matcha.');
assert.equal(p.recipient, 'Nimmi');
assert.deepEqual(p.likes.map((l) => l.name), ['Taylor Swift', 'Studio Ghibli', 'Harry Potter', 'matcha']);
assert.equal(p.likes[1].type, 'movie');
assert.equal(p.likes[2].type, 'book');

const steps = [];
const r = await runGenie({ description: 'My dad loves Pink Floyd and The Godfather.', budget: 'small', city: 'Colombo' }, (s) => steps.push(s));
assert.ok(!r.error, r.error);
assert.ok(r.gifts.length >= 3, 'expected at least 3 gifts');
assert.ok(r.categories.includes('place'), 'city should add local places');
assert.deepEqual([...new Set(steps.filter((s) => s.status === 'done').map((s) => s.id))], ['understand', 'ground', 'plan', 'discover', 'curate']);

const empty = await runGenie({ description: '' });
assert.ok(empty.error);
console.log('All agent tests passed ✓');
