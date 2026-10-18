// Thin client for the Qloo hackathon API.
// Docs: https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide
import { mockSearch, mockInsights } from './mock.js';

const BASE = process.env.QLOO_BASE_URL || 'https://hackathon.api.qloo.com';

export const ENTITY_TYPES = [
  'artist', 'book', 'brand', 'destination', 'movie',
  'person', 'place', 'podcast', 'tv_show', 'video_game',
];

export function qlooMode() {
  return process.env.QLOO_API_KEY ? 'live' : 'mock';
}

const urn = (t) => (t && ENTITY_TYPES.includes(t) ? `urn:entity:${t}` : undefined);
const shortType = (s = '') => s.replace('urn:entity:', '');

async function qget(path, params) {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const res = await fetch(url, {
    headers: { 'X-Api-Key': process.env.QLOO_API_KEY, accept: 'application/json' },
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    throw new Error(`Qloo ${path} returned ${res.status}: ${body}`);
  }
  return res.json();
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

/** Look up the Qloo entity that best matches a free-text name. */
export async function searchEntity(name, type) {
  if (qlooMode() === 'mock') return mockSearch(name, type);
  const data = await qget('/search', { query: name, types: urn(type), take: 3 });
  const first = listFrom(data)[0];
  return first ? simplify(first) : null;
}

/** Ask the taste graph for entities of `type` that people with these interests love. */
export async function insights(type, entityIds, { take = 6, locationQuery } = {}) {
  if (qlooMode() === 'mock') return mockInsights(type, entityIds, take);
  const data = await qget('/v2/insights', {
    'filter.type': urn(type),
    'signal.interests.entities': entityIds,
    'signal.location.query': type === 'place' ? locationQuery : undefined,
    take,
  });
  return listFrom(data).map(simplify);
}
