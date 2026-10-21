// GiftGenie agent: understand -> ground in Qloo -> plan -> discover -> curate.
// Every gift it returns is tied to a real entity from Qloo's taste graph;
// the LLM may only choose among those entities, never invent new ones.
import { searchEntity, insights, qlooMode, ENTITY_TYPES } from './qloo.js';
import { askJSON, llmMode } from './llm.js';

const GIFT_CATEGORIES = ['brand', 'book', 'artist', 'movie', 'tv_show', 'video_game', 'podcast', 'destination', 'place'];

const BUDGETS = {
  small: 'under $25',
  medium: '$25 to $75',
  big: 'over $75',
  any: 'no fixed budget',
};

const FORMAT = {
  brand: (n) => `Something from ${n}`,
  book: (n) => `A copy of “${n}”`,
  artist: (n) => `${n} on vinyl, or tickets if they're touring`,
  movie: (n) => `A collector's edition or poster of “${n}”`,
  tv_show: (n) => `A box set or merch from “${n}”`,
  video_game: (n) => `“${n}” for their console or PC`,
  podcast: (n) => `Good headphones and a listening list starting with “${n}”`,
  destination: (n) => `A weekend trip, or a travel guide, for ${n}`,
  place: (n) => `An outing or voucher for ${n}`,
};

// ---------- 1. Understand ----------

const TYPE_HINTS = [
  [/\b(films?|movies?|anime films?)\b/i, 'movie'],
  [/\b(books?|novels?|series of books)\b/i, 'book'],
  [/\b(music|songs?|band|albums?|singer)\b/i, 'artist'],
  [/\b(video ?games?|games?)\b/i, 'video_game'],
  [/\b(tv|shows?|series|k-?dramas?|dramas?)\b/i, 'tv_show'],
  [/\b(podcasts?)\b/i, 'podcast'],
];

export function parseWithRules(text) {
  const t = String(text || '');
  const STOP = /^(My|Our|She|He|They|His|Her|The|A|An|I|We)$/;
  const rel = t.match(/\b(?:[Mm]y|[Oo]ur)\s+(?:\w+\s+)?(\w+)\s+([A-Z][a-z]+)/);
  const lead = t.match(/^([A-Z][a-z]+)\b/);
  const recipient = rel && !STOP.test(rel[2]) ? rel[2] : lead && !STOP.test(lead[1]) ? lead[1] : 'them';

  const parts = [];
  const re = /\b(?:loves?|likes?|enjoys?|is into|into|fan of|obsessed with|adores?)\s+([^.!?\n]+)/gi;
  let m;
  while ((m = re.exec(t))) parts.push(m[1]);
  if (!parts.length) parts.push(t);

  const likes = [];
  for (const chunk of parts) {
    for (let raw of chunk.split(/,|;|\band\b|&/i)) {
      raw = raw.trim().replace(/^(the|a|an)\s+(?=[a-z])/i, '');
      if (raw.length < 2) continue;
      let type;
      for (const [rx, ty] of TYPE_HINTS) {
        if (rx.test(raw)) { type = ty; raw = raw.replace(rx, '').trim(); break; }
      }
      if (raw.length >= 2) likes.push({ name: raw, type });
    }
  }
  return { recipient, relation: '', likes: likes.slice(0, 6), vibe: '' };
}

// One LLM call both reads the description and plans where to search,
// which keeps the agent fast (each Gemini round trip is the slowest step).
async function understandAndPlan({ description, occasion, budget, city, feedback }) {
  if (llmMode() === 'gemini') {
    try {
      const out = await askJSON(`You help someone pick a gift using a taste graph.
1) Read their description of the recipient and extract structured facts.
2) Decide which taste-graph categories to search for gift ideas.
Return JSON: {"recipient": string (first name or "them"), "relation": string, "vibe": string (max 12 words), "likes": [{"name": string, "type": one of ${JSON.stringify(ENTITY_TYPES)} or null}], "avoid": [string], "categories": [string], "reason": string (one sentence on why these categories)}
Rules for "likes": the things they love. Prefer specific named things (artists, films, books, brands, games, places, shows) but also keep simple tastes like "matcha" or "hiking" (type null). Max 6. Use the exact proper name. Use null type if unsure.
Rules for "categories": pick 3 or 4 from ${JSON.stringify(GIFT_CATEGORIES)}. Only pick "place" if a city is given. Prefer categories that turn into giftable things at this budget.
Occasion: ${occasion || 'not given'}. Budget: ${BUDGETS[budget] || 'not given'}. City: ${city || 'not given'}.
${feedback ? `The giver's feedback on earlier ideas, follow it: """${feedback}"""` : ''}
Description: """${description}"""`);
      if (Array.isArray(out?.likes) && out.likes.length) {
        const profile = {
          recipient: out.recipient || 'them',
          relation: out.relation || '',
          vibe: out.vibe || '',
          avoid: Array.isArray(out.avoid) ? out.avoid : [],
          likes: out.likes
            .filter((l) => l && l.name)
            .slice(0, 6)
            .map((l) => ({ name: String(l.name), type: ENTITY_TYPES.includes(l.type) ? l.type : undefined })),
        };
        const cats = (out.categories || []).filter((c) => GIFT_CATEGORIES.includes(c) && (c !== 'place' || city));
        const strategy = cats.length
          ? { categories: [...new Set(cats)].slice(0, 4), reason: out.reason || '' }
          : planWithRules(budget, city);
        return { profile, strategy };
      }
    } catch (e) {
      console.warn('understand: falling back to rules -', e.message);
    }
  }
  return { profile: parseWithRules(description), strategy: planWithRules(budget, city) };
}

// ---------- 3. Plan ----------

function planWithRules(budget, city) {
  const plan = {
    small: ['book', 'brand', 'artist'],
    medium: ['brand', 'book', 'artist'],
    big: ['brand', 'destination', 'artist'],
    any: ['brand', 'book', 'artist'],
  }[budget] || ['brand', 'book', 'artist'];
  if (city) plan.push('place');
  return { categories: plan, reason: `Good fits for a budget of ${BUDGETS[budget] || "any size"}${city ? ` plus local spots in ${city}` : ''}.` };
}

// ---------- 5. Curate ----------

function curateWithRules(candidates, profile, budget) {
  const byCat = {};
  for (const c of candidates) (byCat[c.type] ||= []).push(c);
  const picks = [];
  for (let round = 0; picks.length < 6 && round < 3; round++) {
    for (const list of Object.values(byCat)) if (list[round] && picks.length < 6) picks.push(list[round]);
  }
  const likes = profile.likes.map((l) => l.name);
  return picks.map((c) => ({
    key: c.key,
    format: (FORMAT[c.type] || ((n) => n))(c.name),
    why: `People who love ${likes.slice(0, 3).join(', ')} rate ${c.name} highly in Qloo's taste graph.${c.description ? ' ' + c.description : ''}`,
    because_of: likes.slice(0, 2),
    price_hint: BUDGETS[budget] || '',
  }));
}

async function curate({ candidates, profile, occasion, budget, feedback }) {
  if (llmMode() === 'gemini') {
    try {
      const list = candidates
        .map((c) => `${c.key} | ${c.type} | ${c.name} | ${c.description || ''} | tags: ${c.tags.join(', ')}`)
        .join('\n');
      const out = await askJSON(`You are GiftGenie. Choose the best 5 gift ideas for ${profile.recipient}.
They love: ${profile.likes.map((l) => l.name).join(', ')}. Vibe: ${profile.vibe || 'unknown'}. Avoid: ${(profile.avoid || []).join(', ') || 'nothing stated'}.
Occasion: ${occasion || 'not given'}. Budget: ${BUDGETS[budget] || 'not given'}.
${feedback ? `Giver's feedback on earlier ideas, follow it: """${feedback}"""` : ''}
You may ONLY choose from these taste-graph matches (key | category | name | description | tags):
${list}
Make the set varied: cover at least 3 different categories when possible, connect picks to different interests of theirs, and never pick two items from the same series or franchise.
For each pick, turn the entity into a concrete, buyable or bookable gift.
Return JSON: {"gifts": [{"key": string (from the list), "format": string (the concrete gift, max 14 words), "why": string (2 sentences, mention which of their likes it connects to and why it suits them), "because_of": [string] (1-2 of their likes, copied exactly from: ${profile.likes.map((l) => l.name).join(', ')}), "price_hint": string (rough price range)}]}`, { temperature: 0.6 });
      // Small models sometimes write "C3", "c3 " or the entity's name instead of the key:
      // accept those, but still only ever return entities Qloo actually gave us.
      const byKey = new Map(candidates.map((c) => [c.key, c.key]));
      const byName = new Map(candidates.map((c) => [c.name.toLowerCase().trim(), c.key]));
      const seen = new Set();
      const list2 = Array.isArray(out) ? out : out?.gifts || [];
      const gifts = list2
        .map((g) => {
          if (!g) return null;
          const raw = String(g.key ?? g.name ?? g.title ?? '').trim();
          const key = byKey.get(raw.toLowerCase()) || byName.get(raw.toLowerCase());
          return key ? { ...g, key } : null;
        })
        .filter((g) => g && !seen.has(g.key) && seen.add(g.key));
      if (gifts.length) return gifts.slice(0, 6);
      console.warn('curate: Gemini picks did not match any candidate keys:', JSON.stringify(out).slice(0, 300));
    } catch (e) {
      console.warn('curate: falling back to rules -', e.message);
    }
  }
  return curateWithRules(candidates, profile, budget);
}

// "Because of …" tags must name one of their actual interests, never a vibe or a sentence.
const norm = (x) => String(x || '').toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
function onlyTheirLikes(tags, likes) {
  const names = likes.map((l) => l.name);
  const out = [];
  for (const t of Array.isArray(tags) ? tags : []) {
    const hit = names.find((n) => norm(t) === norm(n) || (norm(t).length <= norm(n).length + 12 && norm(t).includes(norm(n))));
    if (hit && !out.includes(hit)) out.push(hit);
  }
  return out;
}

// ---------- The agent loop ----------

export async function runGenie(input, emit = () => {}) {
  const description = String(input.description || '').slice(0, 1500);
  const occasion = String(input.occasion || '').slice(0, 60);
  const budget = BUDGETS[input.budget] ? input.budget : 'any';
  const city = String(input.city || '').slice(0, 60).trim();
  const feedback = String(input.feedback || '').slice(0, 400);
  const mode = { qloo: qlooMode(), llm: llmMode() };

  const step = (id, status, label, detail) => emit({ type: 'step', id, status, label, detail });

  // 1. Understand the person and 2. plan where to look (one LLM call)
  step('understand', 'running', 'Reading your description');
  const { profile, strategy } = await understandAndPlan({ description, occasion, budget, city, feedback });
  if (!profile.likes.length) {
    step('understand', 'failed', 'No interests found', 'Name a few things they love, like a band, a film or a book.');
    return { error: 'Tell GiftGenie a few specific things they love — a band, a film, a book series, a brand.', mode };
  }
  step('understand', 'done', `Gift for ${profile.recipient}`, `Interests: ${profile.likes.map((l) => l.name).join(', ')}`);
  step('plan', 'done', `Will search ${strategy.categories.map((c) => c.replace('_', ' ')).join(', ')}`, strategy.reason);

  // 3. Ground each interest in the taste graph
  step('ground', 'running', 'Finding their interests in Qloo');
  const lookups = await Promise.all(
    profile.likes.map(async (l) => {
      try {
        return { like: l, entity: await searchEntity(l.name, l.type) };
      } catch (e) {
        console.warn('search failed for', l.name, e.message);
        return { like: l, entity: null };
      }
    })
  );
  const matched = lookups.filter((x) => x.entity);
  if (!matched.length) {
    step('ground', 'failed', 'No matches in Qloo', 'Try spelling names in full, like "Taylor Swift" or "Spirited Away".');
    return { error: 'None of those interests matched Qloo. Try full names, like "Taylor Swift" or "Spirited Away".', mode };
  }
  step('ground', 'done', `Matched ${matched.length} of ${lookups.length} interests`,
    matched.map((x) => `${x.like.name} → ${x.entity.name} (${x.entity.type})`).join('\n'));

  // 4. Discover via Qloo Insights
  step('discover', 'running', 'Asking the taste graph');
  const ids = matched.map((x) => x.entity.id);
  const inputIds = new Set(ids);
  const errors = [];
  const ask = (cat) =>
    insights(cat, ids, { take: 6, locationQuery: city }).catch((e) => {
      console.warn('insights failed for', cat, '-', e.message);
      errors.push(`${cat}: ${e.message}`);
      return [];
    });
  let results = await Promise.all(strategy.categories.map(ask));
  // If the planned mix came back empty, widen the search to dependable categories.
  if (results.every((r) => !r.length)) {
    const backup = ['brand', 'artist', 'book'].filter((c) => !strategy.categories.includes(c));
    if (backup.length) {
      strategy.categories.push(...backup);
      results = results.concat(await Promise.all(backup.map(ask)));
    }
  }
  let n = 0;
  const candidates = results
    .flatMap((list, i) => list.map((e) => ({ ...e, type: e.type || strategy.categories[i] })))
    .filter((e) => e.id && !inputIds.has(e.id))
    .map((e) => ({ ...e, key: `c${++n}` }));
  if (!candidates.length) {
    step('discover', 'failed', 'No recommendations came back',
      errors.length ? `Qloo said: ${errors[0].slice(0, 220)}` : 'Try different interests or another budget.');
    return { error: 'Qloo had no recommendations for that mix. Try different interests or a different budget.', mode };
  }
  step('discover', 'done', `${candidates.length} taste matches found`,
    strategy.categories.map((c, i) => `${c.replace('_', ' ')}: ${results[i].length}`).join(' · '));

  // 5. Curate into gifts
  step('curate', 'running', 'Turning matches into gift ideas');
  const picks = await curate({ candidates, profile, occasion, budget, feedback });
  const byKey = Object.fromEntries(candidates.map((c) => [c.key, c]));
  const gifts = picks.map((g) => {
    const e = byKey[g.key];
    return {
      title: e.name,
      category: e.type,
      format: g.format,
      why: g.why,
      because_of: onlyTheirLikes(g.because_of, profile.likes).slice(0, 2),
      price_hint: g.price_hint || '',
      entity: {
        name: e.name, type: e.type, description: e.description, tags: e.tags,
        image: e.image, website: e.website, affinity: e.affinity, address: e.address,
      },
    };
  });
  step('curate', 'done', `${gifts.length} gift ideas ready`);

  return {
    recipient: profile.recipient,
    likes: matched.map((x) => ({ asked: x.like.name, matched: x.entity.name, type: x.entity.type })),
    categories: strategy.categories,
    gifts,
    mode,
  };
}
