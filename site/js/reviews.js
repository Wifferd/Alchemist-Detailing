/* Alchemist Detailing — the public Reviews page (#reviews), phase 5 (doc 29).
   Only approved reviews from real customers, first name and last initial,
   the owner's replies, gold for $200+ details. Nothing is ever made up here:
   until real reviews exist the page says so.
   A gold review is drawn as an assay certificate (the owner's design, Oct 10):
   gold border, inner hairline frame, faint alchemy circles, a still sheen, the
   round Au seal, the words in the brand's italic serif. Ordinary reviews are
   simpler dark cards. The motion (stars lighting one by one, a line of light
   round the edge, the name fading in) lives in the stylesheet and plays once,
   when the card first comes into view. */
(function () {
  'use strict';
  const U = window.AlchemistUI, D = window.AlchemistData;
  const { el } = U;
  const SVG = 'http://www.w3.org/2000/svg', XLINK = 'http://www.w3.org/1999/xlink';
  let root = null, seals = 0;
  const when = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const svg = (tag, attrs, text) => {
    const n = document.createElementNS(SVG, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => n.setAttribute(k, v));
    if (text != null) n.textContent = text;
    return n;
  };

  // five ✦, lit up to the rating; --s is each star's place, so a certificate can light them one after another
  function stars(n, label) {
    return el('span.stars', label === false ? { 'aria-hidden': 'true' } : { 'aria-label': n + ' out of 5 stars' },
      [1, 2, 3, 4, 5].map((i) => { const s = el('i', { class: i <= n ? 'on' : '' }, '✦'); s.style.setProperty('--s', i); return s; }));
  }
  // the assay seal: GOLD DETAIL ✦ ALCHEMIST ✦ round a ring, Au in the middle
  function seal() {
    const id = 'seal-ring-' + (++seals);
    const s = svg('svg', { class: 'rv-seal', viewBox: '0 0 100 100', width: 96, height: 96, 'aria-hidden': 'true' });
    const defs = svg('defs');
    defs.appendChild(svg('path', { id, d: 'M50 50 m-35 0 a35 35 0 1 1 70 0 a35 35 0 1 1 -70 0' }));
    const ring = svg('text');
    const path = svg('textPath', { href: '#' + id }, 'GOLD DETAIL ✦ ALCHEMIST ✦ ');
    path.setAttributeNS(XLINK, 'xlink:href', '#' + id);
    ring.appendChild(path);
    s.append(defs, svg('circle', { class: 'ring', cx: 50, cy: 50, r: 46 }), svg('circle', { class: 'inner', cx: 50, cy: 50, r: 27 }), ring,
      svg('text', { class: 'au', x: 50, y: 57, 'text-anchor': 'middle' }, 'Au'));
    return s;
  }
  // the faint alchemy circles in the certificate's corner
  function circles() {
    const s = svg('svg', { class: 'rv-circles', viewBox: '0 0 320 320', width: 320, height: 320, 'aria-hidden': 'true' });
    const rings = svg('g', { fill: 'none', stroke: 'currentColor', 'stroke-width': 1 });
    for (let r = 40; r <= 152; r += 16) rings.appendChild(svg('circle', { cx: 160, cy: 160, r }));
    const petals = svg('g', { fill: 'none', stroke: 'currentColor', 'stroke-width': 1, opacity: .6 });
    [[176, 160], [144, 160], [160, 176], [160, 144]].forEach(([cx, cy]) => petals.appendChild(svg('circle', { cx, cy, r: 64 })));
    s.append(rings, petals);
    return s;
  }
  const extMark = () => svg('svg', { class: 'ext', viewBox: '0 0 24 24', 'aria-hidden': 'true' }).appendChild(svg('path', { d: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })).parentNode;

  function review(r) {
    const who = el('p.rv-who', el('b', r.name), r.services ? el('span', r.services) : null, el('span', when(r.created_at)));
    const body = el('p.rv-body', '“' + r.body + '”');
    const reply = r.reply ? el('div.rv-reply', el('span.eyebrow', 'Alchemist replied'), el('p', r.reply)) : null;
    if (!r.is_gold) return el('article.rv', { 'data-reveal': '' }, el('div.rv-head', stars(r.rating)), body, who, reply);
    return el('article.rv.gold.cert', { 'data-reveal': '' },
      el('span.rv-frame', { 'aria-hidden': 'true' }), circles(), el('span.rv-sheen', { 'aria-hidden': 'true' }), seal(),
      el('div.rv-main', el('div.rv-head', stars(r.rating), el('span.rv-gold', 'Gold detail')), body, who),
      reply);
  }

  function mount(container) { root = container; render(); }
  async function render() {
    root.replaceChildren(U.loading('Loading…'));
    await D.init();
    const [settings, list] = await Promise.all([D.settings(), D.publicReviews().catch(() => [])]);
    const bookNow = () => el('a.btn.btn-gold.shine', { href: '#book' }, 'Book Now ', el('span.arrow', { 'aria-hidden': 'true' }, '→'));
    const google = () => settings.google_reviews_url ? el('a.btn.btn-glass', { href: settings.google_reviews_url, target: '_blank', rel: 'noopener', 'aria-label': 'Read our Google reviews (opens in a new tab)' }, 'Read our Google reviews ', extMark()) : null;
    const signIn = () => el('p.bk-muted', 'Had a detail with us? ', el('a', { href: '#account' }, 'Sign in to your account'), ' and leave a review under ', el('a', { href: '#appointments' }, 'Appointments'), '.');
    const page = el('div.wrap.rv-page',
      el('header.page-head', el('p.eyebrow', 'Customers'), el('h1.display.gold-text', 'Reviews'), el('span.rule', { 'data-reveal': '' }),
        el('p', 'Every review is from a real customer, after their detail.')),
      list.length
        ? [el('div.rv-grid', list.map(review)), el('div.rv-foot', el('div.bk-actions', bookNow(), google()), signIn())]
        : el('div.rv-empty', stars(0, false), el('p', 'Reviews from Alchemist customers will appear here as they come in.'), el('div.bk-actions', bookNow(), google()), signIn()));
    root.replaceChildren(page);
  }
  window.AlchemistReviews = { mount };
})();
