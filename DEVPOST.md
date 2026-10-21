# Devpost submission — GiftGenie

## Name
GiftGenie

## Tagline
A gift-finding agent that knows what people love, grounded in Qloo's taste graph.

## Built with
node.js, javascript, html5, css3, qloo, gemini, vercel

## Links
- Live app: https://gift-genie-rust.vercel.app
- Code: https://github.com/thisararukshan00-bit/GiftGenie

## About the project

## Inspiration
Every birthday I end up staring at a shopping site with no idea what to buy. I *know* my sister loves Taylor Swift, Studio Ghibli and Harry Potter — but a plain chatbot just turns that into "a Taylor Swift mug". The interesting gift is the thing she doesn't own yet but would love, and finding that needs real knowledge of taste, not guesses. Qloo's taste graph is exactly that knowledge, so I built an agent around it.

## What it does
You describe a person in a sentence or two — *"My dad loves Pink Floyd, The Godfather, cricket and long drives"* — pick an occasion, a budget and (optionally) their city. GiftGenie then:

1. **Understands** who the gift is for and what they love, and **plans** which categories are worth searching for that budget.
2. **Grounds** each interest in Qloo with `/search`, checking that the match is really the same thing (so "Christopher Nolan" never becomes "Christopher Cross").
3. **Discovers** what people with that exact mix of tastes love, calling `/v2/insights` once per category (brands, books, music, films, games, trips, local places filtered to their city).
4. **Curates** the best 5 matches into concrete, buyable gifts, each with a short reason and a "Because of …" tag showing which of their interests it comes from.

Every step streams live into the UI ("How GiftGenie is thinking"), so you can watch the agent reason. A **refine** box lets you push back — *"cheaper, and no books"* — and the agent re-plans.

For the dad example it suggested *The Godfather Part II* on 4K, *Zen and the Art of Motorcycle Maintenance* (because of the long drives), BMW driving gloves, *The Doors* on vinyl and David Byrne's *How Music Works* — none of which were in the description, all of which came from Qloo.

## How Qloo powers it
Qloo is the source of every recommendation. The LLM is **only allowed to choose among entities Qloo returned**; any pick that doesn't map to a Qloo result is dropped. Without Qloo, GiftGenie has nothing to recommend — it would just be a chatbot guessing. With Qloo, a few named interests become cross-domain suggestions (a film fan gets a book, a music fan gets a trip) backed by real cultural affinity data, plus images and descriptions for every card.

## How I built it
- **Agent:** a small Node.js loop — understand + plan (one Gemini call) → ground (Qloo `/search`) → discover (Qloo `/v2/insights`) → curate (one Gemini call). Steps stream to the browser as newline-delimited JSON.
- **LLM:** Google Gemini (Flash-Lite) for reading the description, planning and writing the reasons. If Gemini is slow, overloaded or rate-limited, the agent tries another model and finally falls back to simple rules, so the app always answers.
- **Frontend:** plain HTML, CSS and JavaScript, no framework. Results hang as gift tags on a ribbon; it works on phones and in dark mode.
- **Hosting:** Vercel (static site + one serverless function). Zero npm dependencies.

## Challenges I ran into
- **Rate limits.** My first version fired ~10 Qloo requests at once and got `429 Rate limit exceeded`. I added a small request queue (max two in flight), automatic retry with back-off, and a server-side cache so repeated searches cost nothing.
- **Speed.** The first end-to-end run took 211 seconds because a large model was overloaded (`503 high demand`) and I called it three times. I merged two LLM steps into one, switched to a lighter model, added timeouts and model fallback — it now finishes in about 11 seconds.
- **Getting the right entity.** Free text is messy: "Christopher Nolan" first matched an artist with a similar first name, and video games use a different type name in search. I added type mapping, a retry without the type, and a name check before accepting a match.
- **Local places.** `signal.location.query` only *nudges* results, so "Colombo" still returned places in Croatia. Switching to `filter.location.query` keeps local suggestions actually local.

## Accomplishments that I'm proud of
- It feels like an agent, not a form: you can see it think, and you can talk back to it.
- Every suggestion is grounded in Qloo data — the LLM never invents a product.
- It stays up: timeouts, retries, caching and fallbacks mean a slow API never leaves the user staring at a spinner.

## What I learned
How to design an agent around a real data source instead of around a prompt; how much reliability work (rate limits, retries, timeouts) sits between a demo and something people can actually use; and how Qloo's insights can connect tastes across completely different domains.

## What's next for GiftGenie
- Links to buy each gift from local shops, and price-aware filtering.
- "Gift for a group" — finding something a whole family or team would enjoy, using Qloo's taste overlap.
- Remembering past gifts so it never suggests the same thing twice.
