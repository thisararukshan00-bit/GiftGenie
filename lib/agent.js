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

async function understand(description) {
  if (llmMode() === 'gemini') {
    try {
      const out = await askJSON(`You help someone pick a gift. Read their description of the recipient and extract structured facts.
Return JSON: {"recipient": string (first name or "them"), "relation": string, "vibe": string (max 12 words), "likes": [{"name": string, "type": one of ${JSON.stringify(ENTITY_TYPES)} or null}], "avoid": [string]}
Rules: "likes" are the things they love: prefer specific named things (artists, films, books, brands, games, places, shows), but also keep simple tastes like "matcha" or "hiking" (type null). Max 6. Use the exact proper name. Use null type if unsure.
Description: """${description}"""`);
      if (Array.isArray(out?.likes) && out.likes.length) {
        out.likes = out.likes
          .filter((l) => l && l.name)
          .slice(0, 6)
          .map((l) => ({ name: String(l.name), type: ENTITY_TYPES.includes(l.type) ? l.type : undefined }));
        return out;
      }
    } catch (e) {
      console.warn('understand: falling back to rules -', e.message);
    }
  }
  return parseWithRules(description);
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

async function plan({ profile, occasion, budget, city, feedback }) {
  if (llmMode() === 'gemini') {
    try {
      const out = await askJSON(`You are planning where to look for a gift in a taste graph.
Recipient: ${profile.recipient} (${profile.relation || 'relation unknown'}), vibe: ${profile.vibe || 'unknown'}.
They love: ${profile.likes.map((l) => l.name).join(', ')}.
Occasion: ${occasion || 'not given'}. Budget: ${BUDGETS[budget] || 'not given'}. City: ${city || 'not given'}.
${feedback ? `The giver's feedback on earlier ideas: """${feedback}"""` : ''}
Pick 3 or 4 categories to search, from ${JSON.stringify(GIFT_CATEGORIES)}. Only pick "place" if a city is given. Prefer categories that turn into giftable things at this budget.
Return JSON: {"categories": [string], "reason": string (one sentence)}`);
      const cats = (out?.categories || []).filter((c) => GIFT_CATEGORIES.includes(c) && (c !== 'place' || city));
      if (cats.length) return { categories: [...new Set(cats)].slice(0, 4), reason: out.reason || '' };
    } catch (e) {
      console.warn('plan: falling back to rules -', e.message);
    }
  }
  return planWithRules(budget, city);
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
For each pick, turn the entity into a concrete, buyable or bookable gift.
Return JSON: {"gifts": [{"key": string (from the list), "format": string (the concrete gift, max 14 words), "why": string (2 sentences, mention which of their likes it connects to and why it suits them), "because_of": [string] (1-2 of their likes), "price_hint": string (rough price range)}]}`, { temperature: 0.6 });
      const valid = new Set(candidates.map((c) => c.key));
      const gifts = (out?.gifts || []).filter((g) => g && valid.has(g.key));
      if (gifts.length) return gifts.slice(0, 6);
    } catch (e) {
      console.warn('curate: falling back to rules -', e.message);
    }
  }
  return curateWithRules(candidates, profile, budget);
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

  // 1. Understand
  step('understand', 'running', 'Reading your description');
  const profile = await understand(description);
  if (!profile.likes.length) {
    step('understand', 'failed', 'No interests found', 'Name a few things they love, like a band, a film or a book.');
    return { error: 'Tell GiftGenie a few specific things they love — a band, a film, a book series, a brand.', mode };
  }
  step('understand', 'done', `Gift for ${profile.recipient}`, `Interests: ${profile.likes.map((l) => l.name).join(', ')}`);

  // 2. Ground each interest in the taste graph
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

  // 3. Plan where to look
  step('plan', 'running', 'Deciding where to look');
  const strategy = await plan({ profile, occasion, budget, city, feedback });
  step('plan', 'done', `Searching ${strategy.categories.map((c) => c.replace('_', ' ')).join(', ')}`, strategy.reason);

  // 4. Discover via Qloo Insights
  step('discover', 'running', 'Asking the taste graph');
  const ids = matched.map((x) => x.entity.id);
  const inputIds = new Set(ids);
  const results = await Promise.all(
    strategy.categories.map(async (cat) => {
      try {
        return await insights(cat, ids, { take: 6, locationQuery: city });
      } catch (e) {
        console.warn('insights failed for', cat, e.message);
        return [];
      }
    })
  );
  let n = 0;
  const candidates = results
    .flatMap((list, i) => list.map((e) => ({ ...e, type: e.type || strategy.categories[i] })))
    .filter((e) => e.id && !inputIds.has(e.id))
    .map((e) => ({ ...e, key: `c${++n}` }));
  if (!candidates.length) {
    step('discover', 'failed', 'No recommendations came back', 'Try different interests or another budget.');
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
      because_of: (g.because_of || []).slice(0, 2),
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
