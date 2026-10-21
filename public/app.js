const $ = (s) => document.querySelector(s);
const form = $('#genie-form');
const refineForm = $('#refine-form');
const goBtn = $('#go');
const trace = $('#trace');
const work = $('#work');
const results = $('#results');
const tags = $('#tags');
const formError = $('#form-error');
const modeNote = $('#mode-note');

const EXAMPLES = [
  'My sister Nimmi turns 24 next week. She loves Taylor Swift, Studio Ghibli films, Harry Potter books and matcha.',
  'My dad is a quiet guy who loves Pink Floyd, The Godfather, cricket documentaries and long drives.',
  "My best friend Kasun is into Arctic Monkeys, Christopher Nolan films, Elden Ring and street food.",
];
let exampleIndex = 0;

const CAT_LABEL = {
  brand: 'Brand', book: 'Book', artist: 'Music', movie: 'Film', tv_show: 'TV show',
  video_game: 'Game', podcast: 'Podcast', destination: 'Trip', place: 'Local spot',
};

$('#example-btn').addEventListener('click', () => {
  $('#description').value = EXAMPLES[exampleIndex++ % EXAMPLES.length];
  $('#description').focus();
});

let lastRequest = null;

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const description = String(fd.get('description') || '').trim();
  if (description.length < 8) {
    showFormError('Describe them first — name a few things they love.');
    $('#description').focus();
    return;
  }
  showFormError('');
  lastRequest = {
    description,
    occasion: fd.get('occasion'),
    budget: fd.get('budget'),
    city: String(fd.get('city') || '').trim(),
  };
  $('#feedback').value = '';
  run(lastRequest);
});

refineForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!lastRequest) return;
  const feedback = $('#feedback').value.trim();
  if (!feedback) { $('#feedback').focus(); return; }
  run({ ...lastRequest, feedback });
});

function showFormError(msg) {
  formError.textContent = msg;
  formError.hidden = !msg;
}


function renderStep({ id, status, label, detail }) {
  let li = trace.querySelector(`[data-step="${id}"]`);
  if (!li) {
    li = document.createElement('li');
    li.dataset.step = id;
    li.innerHTML = '<div><div class="label"></div><div class="detail"></div></div>';
    trace.append(li);
  }
  li.dataset.status = status;
  li.querySelector('.label').textContent = label || '';
  li.querySelector('.detail').textContent = detail || '';
}

async function run(payload) {
  goBtn.disabled = true;
  goBtn.textContent = 'Finding gifts…';
  trace.innerHTML = '';
  work.hidden = false;
  results.hidden = true;
  work.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });

  let final = null;
  try {
    const res = await fetch('/api/genie', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok || !res.body) throw new Error(`Server returned ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const msg = JSON.parse(line);
        if (msg.type === 'step') renderStep(msg);
        else if (msg.type === 'result') final = msg;
      }
    }
  } catch (err) {
    final = { error: "GiftGenie couldn't reach its server. Check your connection and try again." };
    console.error(err);
  } finally {
    goBtn.disabled = false;
    goBtn.textContent = 'Find gifts';
  }
  renderResult(final || { error: 'GiftGenie stopped before finishing. Try again.' });
}

function el(tag, attrs = {}, text) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
}

function renderResult(r) {
  results.hidden = false;
  tags.innerHTML = '';
  setModeNote(r.mode);

  if (r.error) {
    $('#results-title').textContent = 'No gift ideas yet';
    $('#matched').textContent = '';
    const li = el('li', { class: 'empty' }, r.error);
    tags.append(li);
    refineForm.hidden = true;
    return;
  }

  refineForm.hidden = false;
  const who = r.recipient && r.recipient !== 'them' ? r.recipient : 'them';
  $('#results-title').textContent = `Gift ideas for ${who}`;
  $('#matched').textContent = r.likes?.length
    ? `Based on their love of ${r.likes.map((l) => l.asked).join(', ')}.`
    : '';

  r.gifts.forEach((g, i) => {
    const li = el('li', { class: 'tag swing' });
    li.style.setProperty('--i', i);
    li.style.setProperty('--tilt', `${(i % 2 ? 1 : -1) * (0.6 + (i % 3) * 0.5)}deg`);

    const card = el('article', { class: 'tag-card' });
    if (g.entity?.image) {
      const img = el('img', { src: g.entity.image, alt: '', loading: 'lazy' });
      img.addEventListener('error', () => img.remove());
      card.append(img);
    }
    card.append(el('span', { class: 'cat' }, CAT_LABEL[g.category] || g.category));
    card.append(el('h3', {}, g.title));
    card.append(el('p', { class: 'format' }, g.format));
    card.append(el('p', { class: 'why' }, g.why));

    if (g.because_of?.length) {
      const ul = el('ul', { class: 'because', 'aria-label': 'Connected to' });
      g.because_of.forEach((b) => ul.append(el('li', {}, `Because of ${b}`)));
      card.append(ul);
    }

    const row = el('div', { class: 'foot-row' });
    row.append(el('span', { class: 'price' }, g.price_hint || ''));
    const q = encodeURIComponent(`${g.title} ${CAT_LABEL[g.category] === 'Book' ? 'book' : ''} gift`.trim());
    const href = g.entity?.website || `https://www.google.com/search?q=${q}`;
    const a = el('a', { href, target: '_blank', rel: 'noopener' }, g.entity?.website ? 'Visit website' : 'Look it up');
    row.append(a);
    card.append(row);

    li.append(card);
    tags.append(li);
  });

  results.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

function setModeNote(mode) {
  if (!mode) return;
  const parts = [];
  if (mode.qloo === 'mock') parts.push('Showing invented demo data until a Qloo API key is added.');
  if (mode.llm === 'rules') parts.push('Running without an LLM, so wording is simpler.');
  modeNote.textContent = parts.join(' ');
}
