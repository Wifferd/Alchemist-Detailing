/* Alchemist Detailing — the content pages: Tips, FAQ, About (#tips, #faq, #about).
   Every word here is a DRAFT for the owner to edit (doc 30). The FAQ only
   repeats facts the database already holds: prices, area, hold, payment.
   The three pages share the brand pages' head (eyebrow, gold title, a drawn
   rule, one lead sentence) in a plain column: Tips as a grid of open cards,
   the FAQ as an accordion that unfolds, About with the emblem and a photo. */
(function () {
  'use strict';
  const U = window.AlchemistUI;
  const { el } = U;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PHONE = '(945) 361-7551';
  // The staff note on the three draft pages: set to false once the owner has approved the words.
  const SHOW_DRAFT_BANNER = false;   // the owner approved the words on Oct 5, 2026 (doc 32)

  const DRAFT = {
    tips: {
      eyebrow: 'Car care', title: 'Tips',
      intro: 'Keeping the shine between details. Short, practical, from the way we work.',
      items: [
        ['Wash from the top down', 'Start with the roof and finish with the lower panels and wheels, so the dirtiest water never runs over clean paint. Two buckets: one for soap, one to rinse the mitt.'],
        ['Never wash in direct sun', 'Hot panels dry soap and water into spots before you can rinse. Early morning, late afternoon, or shade.'],
        ['Dry with a towel, not the wind', 'Air-drying leaves mineral spots. A plush microfiber drying towel, laid flat and dragged, is gentler than rubbing.'],
        ['Mats out, then vacuum', 'Pull the floor mats, shake them, and vacuum the carpet underneath. Most of the grit lives there.'],
        ['Deal with spills the same day', 'Blot, don\'t rub. The longer a coffee or soda sits, the more it sets. Tell us about older stains when you book and we\'ll plan for them.'],
        ['Pet hair: a rubber glove works', 'A damp rubber glove pulled across the seat gathers hair the vacuum misses. For the deep stuff, that\'s what our pet-hair option is for.'],
        ['Sealant is a habit, not a one-off', 'A spray sealant like WetGloss keeps water beading for several weeks. Reapply after a few washes and the paint stays easier to clean.'],
      ],
    },
    faq: {
      eyebrow: 'Questions', title: 'FAQ',
      intro: 'The short answers. Anything else, call ' + PHONE + '.',
      items: [
        ['Where do you work?', 'We come to you within about 10 miles of Parker, Texas, or you come to us in Parker. We send our address with your confirmation.'],
        ['What does mobile service need from me?', 'An outdoor water faucet and a power outlet. Mobile adds 2.5% to basic services and add-ons, and 7% to deluxe services and bundles.'],
        ['How do I book?', 'Online in a few minutes: your contact, the car, where, the service, a day and time. Your request holds that time for 24 hours while we review it, and we contact you to confirm.'],
        ['How far ahead can I book?', 'From tomorrow up to 60 days ahead. Start times run every 30 minutes from 10 AM to 7 PM, and every job finishes by 8 PM. Monday to Thursday, jobs finish by 4 PM; on Fridays we\'re closed from noon to 5 PM.'],
        ['How do I pay?', 'In person after your detail: card, Apple Pay or tap to pay, cash, or Zelle. Nothing is charged online.'],
        ['Why does the price say "confirmed by us"?', 'XL vehicles, and WetGloss on a van, convertible or an unusual vehicle, are priced by us before your appointment. Everything else is the price you see.'],
        ['What are the condition fees?', 'With an interior service: pet hair $15, excessive dirt, mud or sand $10, spills or light stains $10, heavy or set-in stains $30. Interior Deluxe and the Full Detail Bundle include the lighter ones. Exterior-only details have no condition fees.'],
        ['Can I cancel or change my booking online?', 'Not online. Call ' + PHONE + ' and we\'ll sort it out.'],
        ['Do you do ceramic coatings or paint correction?', 'Not through the website yet. Ask us when you book and we\'ll talk it through.'],
        ['How long does a detail take?', 'About an hour for a basic exterior or interior, two hours for the Signature Combo, and around three and a half hours for the Full Detail Bundle. Add-ons add about 30 minutes each.'],
      ],
    },
    about: {
      eyebrow: 'Our story', title: 'About',
      intro: 'Alchemist Detailing is a small, owner-run detailing business in Parker, Texas.',
      paras: [
        'We detail by hand, with professional-grade chemicals, the way we\'d want our own cars done. Snow foam, proper wheel cleaning, steam where it\'s needed, and a hand dry: no shortcuts, no rush.',
        'Mostly we come to you. Bring the car to us in Parker if you prefer. Either way you deal with the person doing the work.',
        'Our chemicals make your car shine like gold. That\'s the promise on the logo, and it\'s the standard for every car.',
      ],
    },
  };

  // The phone number in running text is a tel: link (ui.js); the words around it are unchanged.
  const withPhone = (text) => text.split(PHONE).flatMap((part, i) => (i ? [U.tel(PHONE), part] : [part]));

  // The FAQ: a details element whose answer unfolds (grid rows 0fr -> 1fr, .32s) and folds (.22s) before it
  // closes. Opening sets `open` first, so the body exists, then .is-open a frame later so the rows transition;
  // closing drops .is-open and removes `open` once the fold has ended (transitionend, with a fallback timer).
  // Under reduced motion the browser toggles it and .is-open only mirrors `open`.
  function faqItem([q, a]) {
    const body = el('div.faq-body', el('div', el('p', withPhone(a))));
    const d = el('details.faq-item', el('summary', q), body);
    if (reduce) { d.addEventListener('toggle', () => d.classList.toggle('is-open', d.open)); return d; }
    let closing = 0;
    const done = () => { clearTimeout(closing); closing = 0; body.removeEventListener('transitionend', onEnd); d.open = false; };
    function onEnd(e) { if (e.target === body) done(); }
    d.querySelector('summary').addEventListener('click', (e) => {
      e.preventDefault();
      if (d.classList.contains('is-open')) {
        d.classList.remove('is-open');
        body.addEventListener('transitionend', onEnd);
        closing = setTimeout(done, 260);
      } else {
        if (closing) { clearTimeout(closing); closing = 0; body.removeEventListener('transitionend', onEnd); }
        d.open = true;
        requestAnimationFrame(() => requestAnimationFrame(() => d.classList.add('is-open')));
      }
    });
    return d;
  }

  const tip = ([title, text]) => el('article.tip', el('h2.tip-title', title), el('div.line'), el('p', text));

  // The emblem from the home page's Standard section: the monogram in a ring that draws itself as it arrives
  // (the ring is written as markup so the SVG lands in its own namespace).
  function emblem() {
    const e = el('div.emblem', { 'data-reveal': '' });
    e.innerHTML = '<svg class="circle" viewBox="0 0 132 132" aria-hidden="true"><circle cx="66" cy="66" r="64"/></svg>';
    e.appendChild(el('img', { src: 'img/mono-metallic.webp', alt: '', width: 547, height: 601, decoding: 'async' }));
    return e;
  }

  let root = null;
  function mount(container, page) { root = container; render(page); }
  function render(page) {
    const d = DRAFT[page];
    const head = el('header.page-head',
      page === 'about' ? emblem() : null,
      el('p.eyebrow', d.eyebrow),
      el('h1.display.gold-text', d.title),
      el('span.rule', { 'data-reveal': '' }),
      el('p.bk-lead', withPhone(d.intro)),
      page === 'about' ? el('p.script', 'Our chemicals make your car shine like gold ✦') : null,
      SHOW_DRAFT_BANNER ? el('div.bk-preview.draft', el('b', 'Draft'), ' — these words are a first draft for the owner to edit. Nothing here is final.') : null);
    let body;
    if (page === 'tips') body = el('div.tip-grid', d.items.map(tip));
    else if (page === 'faq') body = el('div.faq', d.items.map(faqItem));
    else body = el('div.about-grid',
      el('div.about', d.paras.map((t) => el('p', t))),
      el('figure.about-photo', el('img', { src: 'img/work/hero-tall.webp', alt: 'A car detailed by Alchemist', width: 1080, height: 1620, loading: 'lazy', decoding: 'async' })));
    const actions = el('div.bk-actions',
      el('a.btn.btn-gold.shine', { href: '#book' }, 'Book Now ', el('span.arrow', { 'aria-hidden': 'true' }, '→')),
      el('a.btn.btn-glass', { href: '#services' }, 'Services and prices'));
    root.replaceChildren(el('div.wrap.content-page', head, body, actions));
  }
  window.AlchemistContent = { mount, DRAFT };
})();
