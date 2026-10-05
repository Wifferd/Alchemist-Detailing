/* Alchemist Detailing — the public Reviews page (#reviews), phase 5 (doc 29).
   Only approved reviews from real customers, first name and last initial,
   the owner's replies, gold for $200+ details. Nothing is ever made up here:
   until real reviews exist the page says so. */
(function () {
  'use strict';
  const U = window.AlchemistUI, D = window.AlchemistData;
  const { el } = U;
  let root = null;
  const stars = (n) => el('span.stars', { 'aria-label': n + ' out of 5 stars' }, [1, 2, 3, 4, 5].map((i) => el('i', { class: i <= n ? 'on' : '' }, '\u2726')));
  const when = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  function mount(container) { root = container; render(); }
  async function render() {
    root.replaceChildren(el('div.bk-loading', el('span.bk-spin'), 'Loading\u2026'));
    await D.init();
    const [settings, list] = await Promise.all([D.settings(), D.publicReviews().catch(() => [])]);
    const body = el('div.bk-grid',
      list.length ? el('div.rv-grid', list.map((r) => el('article.rv', { class: r.is_gold ? 'gold shine' : '' },
        el('div.rv-head', stars(r.rating), r.is_gold ? el('span.rv-gold', 'Gold detail') : null),
        el('p.rv-body', r.body),
        el('p.rv-who', el('b', r.name), r.services ? el('span', ' \u00b7 ' + r.services) : null, el('span', ' \u00b7 ' + when(r.created_at))),
        r.reply ? el('div.rv-reply', el('span.eyebrow', 'Alchemist replied'), el('p', r.reply)) : null)))
      : el('p.bk-note', 'Reviews from Alchemist customers will appear here as they come in. Every review is from a real customer, after their detail.'),
      settings.google_reviews_url ? el('div.bk-actions', el('a.btn.btn-glass', { href: settings.google_reviews_url, target: '_blank', rel: 'noopener' }, 'Read our Google reviews')) : null,
      el('p.bk-muted', 'Had a detail with us? Sign in to your account and leave a review under Appointments.'));
    root.replaceChildren(el('div.bk.acct', el('header.bk-head', el('p.eyebrow', 'Customers'), el('h1.display.bk-title', 'Reviews')), body));
  }
  window.AlchemistReviews = { mount };
})();
