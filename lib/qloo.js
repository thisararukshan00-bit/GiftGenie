// Thin client for the Qloo hackathon API.
// Docs: https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide
import { mockSearch, mockInsights } from './mock.js';

const BASE = process.env.QLOO_BASE_URL || 'https://hackathon.api.qloo.com';

export const ENTITY_TYPES = [
  'artist', 'book', 'brand', 'destination', 'movie',
  'person', 'place', 'podcast', 'tv_show', 'video_game',
];

// Qloo spells video games "videogame" in URNs; everything else matches our names.
const URN_NAME = { video_game: 'videogame' };
const urn = (t) => (t && ENTITY_TYPES.includes(t) ? `urn:entity:${URN_NAME[t] || t}` : undefined);
const shortType = (s = '') => {
  const t = s.replace('urn:entity:', '');
  return t === 'videogame' ? 'video_game' : t;
};

export function qlooMode() {
  return process.env.QLOO_API_KEY ? 'live' : 'mock';
}

// ---------- Rate-limit friendly fetching ----------
// The hackathon key is rate limited, so: at most a couple of requests in flight,
// automatic retry with back-off on 429, and a small in-memory cache
// (private server-side caching is allowed by the hackathon terms).

const MAX_IN_FLIGHT = Number(process.env.QLOO_CONCURRENCY) || 2;
let inFlight = 0;
const waiting = [];

function limited(fn) {
  return new Promise((resolve, reject) => {
    const run = async () => {
      inFlight++;
      try {
        resolve(await fn());
      } catch (e) {
        reject(e);
      } finally {
        inFlight--;
        waiting.shift()?.();
      }
    };
    if (inFlight < MAX_IN_FLIGHT) run();
    else waiting.push(run);
  });
}

const cache = new Map();
const CACHE_MS = 60 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function qget(path, params) {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const key = url.toString();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const data = await limited(async () => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, {
        headers: { 'X-Api-Key': process.env.QLOO_API_KEY, accept: 'application/json' },
        signal: AbortSignal.timeout(Number(process.env.QLOO_TIMEOUT_MS) || 15000),
      });
      if (res.status === 429 && attempt < 3) {
        const retryAfter = Number(res.headers.get('retry-after'));
        await sleep(retryAfter > 0 ? retryAfter * 1000 : 800 * 2 ** attempt);
        continue;
      }
      if (!res.ok) {
        const body = (await res.text()).slice(0, 200);
        throw new Error(`Qloo ${path} returned ${res.status}: ${body}`);
      }
      return res.json();
    }
  });

  if (cache.size > 500) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), data });
  return data;
}

// Normalise the many shapes Qloo entities can come in.
function simplify(e) {
  const p = e.properties || {};
  const desc =
    p.description ||
    p.short_description ||
    (Array.isArray(p.short_descriptions) && p.short_descriptions.find((d) => d.languages?.includes('en'))?.value) ||
    '';
  return {
    id: e.entity_id || e.id,
    name: e.name,
    type: shortType(e.subtype || (Array.isArray(e.types) ? e.types[0] : e.type)),
    description: String(desc).slice(0, 280),
    image: p.image?.url || null,
    popularity: typeof e.popularity === 'number' ? e.popularity : null,
    affinity: e.query?.affinity ?? null,
    tags: (e.tags || []).slice(0, 6).map((t) => t.name).filter(Boolean),
    address: p.address || null,
    website: Array.isArray(p.websites) ? p.websites[0] : p.website || null,
  };
}

function listFrom(data) {
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.results?.entities)) return data.results.entities;
  if (Array.isArray(data?.entities)) return data.entities;
  return [];
}

// "Christopher Nolan" must not match "Christopher Cross": the most specific
// word of the query (usually the last one) has to appear in the result's name.
const FILLER = new Set(['the', 'and', 'of', 'a', 'an', 'films', 'film', 'movies', 'books', 'music', 'series']);
export function nameMatches(query, candidate) {
  const words = (String(query).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((w) => !FILLER.has(w));
  if (!words.length) return true;
  return String(candidate || '').toLowerCase().includes(words[words.length - 1]);
}

/** Look up the Qloo entity that best matches a free-text name. */
export async function searchEntity(name, type) {
  if (qlooMode() === 'mock') return mockSearch(name, type);
  // Try with the type first; if Qloo rejects that type or nothing matches, search without it.
  const attempts = urn(type) ? [urn(type), undefined] : [undefined];
  for (const types of attempts) {
    let data;
    try {
      data = await qget('/search', { query: name, types, take: 5 });
    } catch (e) {
      if (types && / 400:/.test(e.message)) continue;
      throw e;
    }
    const match = listFrom(data).find((e) => nameMatches(name, e.name));
    if (match) return simplify(match);
  }
  return null;
}

/** Ask the taste graph for entities of `type` that people with these interests love. */
export async function insights(type, entityIds, { take = 6, locationQuery } = {}) {
  if (qlooMode() === 'mock') return mockInsights(type, entityIds, take);
  const data = await qget('/v2/insights', {
    'filter.type': urn(type),
    'signal.interests.entities': entityIds,
    // filter (not just signal) so local places really are in their city
    'filter.location.query': type === 'place' ? locationQuery : undefined,
    take,
  });
  return listFrom(data).map(simplify);
}
