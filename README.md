# GiftGenie 🎁

**A gift-finding agent grounded in Qloo's taste graph.**

Describe someone in a sentence — *"My sister Nimmi loves Taylor Swift, Studio Ghibli films, Harry Potter books and matcha"* — and GiftGenie finds things that people with the same taste genuinely love, then turns them into concrete, buyable gifts with a reason for each one.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/).

## Why Qloo matters here

A plain LLM asked for gift ideas guesses from stereotypes ("she likes Taylor Swift → buy a Taylor Swift mug"). GiftGenie instead asks Qloo's taste graph (250M+ entities) what *else* people with that exact mix of interests love — across brands, books, music, films, games, trips and local places. The LLM is only allowed to choose among entities Qloo returned, so every gift is grounded in real cultural affinity data, not invented.

## How the agent works

Each run streams its reasoning to the UI as five steps:

1. **Understand** — extract the recipient and their specific interests (Gemini, or simple rules if no LLM key).
2. **Ground** — look up each interest in Qloo with `/search` to get entity IDs.
3. **Plan** — decide which categories to search (brand, book, artist, destination, place…) based on occasion, budget and city.
4. **Discover** — call Qloo `/v2/insights` once per category, using all matched interests as `signal.interests.entities`.
5. **Curate** — pick the best 5–6 matches and turn each into a concrete gift, with *why it suits them* and *which of their interests it connects to*. Picks that don't map to a Qloo result are dropped.

A **refine** box lets the giver push back ("cheaper, and no books") and the agent re-plans with that feedback.

```
browser ──POST /api/genie──▶ agent ──▶ Gemini (understand / plan / curate)
   ▲                           │
   └── NDJSON step stream ◀────┴──▶ Qloo /search + /v2/insights
```

## Run it locally

Requires Node.js 18 or newer. No npm packages needed.

```bash
cp .env.example .env     # add your keys (optional — see below)
npm start                # http://localhost:3000
npm test                 # runs the agent end-to-end in demo mode
```

- Without `QLOO_API_KEY`, GiftGenie uses a small set of **invented demo data** (clearly labelled in the UI) so the app can be tried before the hackathon key arrives.
- Without `GEMINI_API_KEY`, it falls back to rule-based parsing and templated wording.

## Deploy (free) on Vercel

1. Push this repo to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new) — no build settings needed (`public/` is served as static files, `api/genie.js` becomes a serverless function).
3. Add `QLOO_API_KEY` and `GEMINI_API_KEY` under **Settings → Environment Variables**, then redeploy.

## Project structure

```
api/genie.js     serverless endpoint, streams agent steps as NDJSON
lib/agent.js     the agent loop (understand → ground → plan → discover → curate)
lib/qloo.js      Qloo API client (/search, /v2/insights)
lib/llm.js       Gemini JSON helper
lib/mock.js      invented demo data for keyless development
public/          the web app (HTML, CSS, vanilla JS)
server.js        zero-dependency local dev server
```

## Data note

Qloo responses are never stored in this repository, following the hackathon's API terms.

## License

[MIT](LICENSE) © 2026 Thisara Rukshan
