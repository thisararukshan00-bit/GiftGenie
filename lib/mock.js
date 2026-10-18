// Demo data used only while no QLOO_API_KEY is set, so the app can be built
// and tried before the hackathon key arrives. Every name here is invented —
// none of it is real Qloo data, and the UI labels it as demo data.

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const CATALOG = {
  brand: [
    ['Lantern & Loom Tea Co.', 'Small-batch tea blends and ceramic brewing sets.', ['Tea', 'Gifting', 'Artisanal']],
    ['Paper Comet Stationery', 'Illustrated notebooks, washi tape and fountain-pen inks.', ['Stationery', 'Illustration']],
    ['Northwind Knitworks', 'Chunky hand-knit scarves and cosy home textiles.', ['Fashion', 'Cosy', 'Handmade']],
    ['Moonbeam Vinyl Club', 'Monthly record subscription with liner-note zines.', ['Music', 'Vinyl', 'Subscription']],
    ['Atlas Pocket Gear', 'Minimal travel organisers and tech pouches.', ['Travel', 'Minimalist']],
  ],
  book: [
    ['The Lighthouse Cartographer', 'A quiet fantasy about mapping a sea that keeps changing.', ['Fantasy', 'Cosy']],
    ['Notes from a Rooftop Garden', 'Essays on growing food and patience in a small city flat.', ['Essays', 'Nature']],
    ['Seven Doors to Midnight', 'A twisty magical-school mystery told across one night.', ['Mystery', 'Magic', 'Young adult']],
    ['The Ramen Atlas', 'An illustrated tour of noodle shops and the families who run them.', ['Food', 'Illustrated']],
  ],
  artist: [
    ['Velvet Satellites', 'Dreamy synth-pop duo with big singalong choruses.', ['Synth-pop', 'Indie']],
    ['Ama Riverside', 'Acoustic singer-songwriter with storytelling lyrics.', ['Folk', 'Singer-songwriter']],
    ['The Paper Lanterns', 'Lo-fi orchestral pop, loved for film-score textures.', ['Lo-fi', 'Orchestral']],
  ],
  movie: [
    ['Wind Over Hollow Hill', 'A hand-drawn animated film about a girl and a forest spirit.', ['Animation', 'Fantasy']],
    ['The Last Night Market', 'A warm comedy set among street-food vendors.', ['Comedy', 'Food']],
  ],
  destination: [
    ['Kirihara Valley', 'Mountain villages, hot springs and tea terraces.', ['Nature', 'Wellness']],
    ['Porto Azul', 'Tiled old town, live music bars and seaside cafés.', ['Culture', 'Food', 'Coastal']],
  ],
  place: [
    ['The Teacup Library Café', 'Book-lined café with a matcha menu and reading nooks.', ['Café', 'Books', 'Matcha']],
    ['Studio Kiln Pottery', 'Drop-in wheel-throwing classes for beginners.', ['Workshop', 'Craft']],
  ],
  video_game: [
    ['Spirit Orchard', 'A cosy farming game with hand-painted seasons.', ['Cosy', 'Simulation']],
  ],
  tv_show: [
    ['The Midnight Bakers', 'A gentle competition show about night-shift bakers.', ['Reality', 'Food']],
  ],
  podcast: [
    ['Small Stories, Big Maps', 'Short audio documentaries about faraway places.', ['Travel', 'Documentary']],
  ],
};

export function mockSearch(name, type) {
  return {
    id: `mock-${slug(name)}`,
    name: String(name).replace(/\b\w/g, (c) => c.toUpperCase()),
    type: type || 'brand',
    description: '',
    image: null,
    popularity: null,
    affinity: null,
    tags: [],
    address: null,
    website: null,
  };
}

export function mockInsights(type, entityIds, take = 6) {
  const rows = CATALOG[type] || [];
  return rows.slice(0, take).map(([name, description, tags], i) => ({
    id: `mock-${type}-${slug(name)}`,
    name,
    type,
    description,
    image: null,
    popularity: 0.9 - i * 0.07,
    affinity: 0.95 - i * 0.05,
    tags,
    address: null,
    website: null,
  }));
}
