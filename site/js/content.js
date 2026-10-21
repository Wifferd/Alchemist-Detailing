/* Alchemist Detailing — the content pages: Tips, FAQ, About and Contact
   (#tips, #faq, #about, #contact). The Tips, FAQ and About words were drafts
   (doc 30) the owner approved as written (doc 32). The FAQ only repeats facts
   the database already holds: prices, area, hold, payment. The pages share
   the brand pages' head (eyebrow, gold title, a drawn rule, one lead
   sentence) in a plain column: Tips as a numbered journal, the FAQ as an
   accordion that unfolds, About with the emblem, a photo and the products we
   use, Contact with the ways to reach us, where we work and the hours. */
(function () {
  'use strict';
  const U = window.AlchemistUI, D = window.AlchemistData;
  const { el } = U;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PHONE = '(945) 361-7551', TEL = 'tel:+19453617551';
  const INSTAGRAM = 'https://www.instagram.com/alchemy_details';
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
    contact: {
      eyebrow: 'Get in touch', title: 'Contact',
      intro: 'Call to book or to ask a question.',
    },
  };

  // The tips that have a service (or an FAQ answer) behind them: one quiet link under the words, navigation only.
  const TIP_LINKS = {
    'Deal with spills the same day': ['#faq', 'Condition fees in the FAQ'],
    'Pet hair: a rubber glove works': ['#services-interior', 'Interior services'],
    'Sealant is a habit, not a one-off': ['#services-protection', 'Protection and add-ons'],
  };
  // About's "What we use": only products the menu already names, each with the surface and the service it belongs to.
  const PRODUCTS = [
    ['Koch-Chemie Hydro Foam Sealant', 'Paint', 'Exterior Deluxe'],
    ['WetGloss', 'Paint', 'Add-on'],
    ['Brake Buster', 'Wheels and tires', 'Exterior Basic'],
    ['Top Star', 'Plastics', 'Interior Basic'],
    ['Gummifix', 'Rubber and mats', 'Interior Basic'],
    ['Leather Star', 'Leather', 'Interior Deluxe'],
  ];
  // The week, Monday first. These must match the footer, the FAQ and the LD+JSON in index.html (CLAUDE.md lists all four).
  const HOURS = [
    ['Monday', '10 AM – 4 PM'], ['Tuesday', '10 AM – 4 PM'], ['Wednesday', '10 AM – 4 PM'], ['Thursday', '10 AM – 4 PM'],
    ['Friday', '10 AM – 12 PM, 5 – 8 PM'], ['Saturday', '10 AM – 8 PM'], ['Sunday', '10 AM – 8 PM'],
  ];
  const arrow = () => el('span.arrow', { 'aria-hidden': 'true' }, '→');
  // a hyphenated word never breaks at its hyphen ("one-off", "owner-run")
  const whole = (t, cls) => t.split(/(\S+-\S+)/).map((w, i) => (i % 2 ? el('span.' + cls, w) : w));
  // the FAQ's approved answer to a question, word for word, so Contact and the FAQ always say the same
  const answer = (q) => (DRAFT.faq.items.find((it) => it[0] === q) || [])[1] || '';

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

  // Tips as journal entries: the number is the entry's one gold mark, the title and the words stay in ink.
  function tip([title, text], i) {
    const go = TIP_LINKS[title];
    return el('article.tip',
      el('p.tip-no.tnum', { 'aria-hidden': 'true' }, el('small', 'No.'), String(i + 1).padStart(2, '0')),
      el('div.tip-body',
        el('h2.tip-title', whole(title, 'nobr')), el('div.line'), el('p', text),
        go ? el('a.note-link', { href: go[0] }, go[1], arrow()) : null));
  }

  // About's one moment: the photo is unveiled once, when its plate is first well on screen and the picture decoded
  // (.unveiled; the CSS does the rest). It has its own observer, as the shared reveal settles at once whatever lands
  // in a view another page has already opened, and Tips, the FAQ and Contact share this one. Under reduced motion it
  // is simply there.
  let unveiling = null;   // the last About's observer, let go when the page is built again
  function unveil(fig) {
    const show = () => fig.classList.add('unveiled');
    if (unveiling) unveiling.disconnect();
    if (reduce || !('IntersectionObserver' in window)) { show(); return fig; }
    const seen = unveiling = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      seen.disconnect();
      // a lazy picture inside a closed clip would never start loading: ask for it now, and never wait more than 1.2s
      const img = fig.querySelector('img');
      if (img) img.loading = 'eager';
      Promise.race([img && img.decode ? img.decode().catch(() => {}) : null, new Promise((r) => setTimeout(r, 1200))]).then(show);
    }, { threshold: 0.3 });
    seen.observe(fig);
    return fig;
  }

  // About's quiet spec sheet: the product, where it goes, and the service it comes with.
  function products() {
    return el('section.about-use', { 'aria-labelledby': 'useTitle' },
      el('h2.ct-h#useTitle', 'What we use'),
      el('ul.use-list',
        el('li.use-row.use-keys', { 'aria-hidden': 'true' }, el('span', 'Product'), el('span', 'Used on'), el('span', 'Part of')),
        PRODUCTS.map(([name, on, part]) => el('li.use-row', el('b', name), el('span.use-on', on), el('span.use-part', part)))));
  }

  // ---------------------------------------------------------------- contact
  // Only what the site already says: the phone, Instagram and online booking; where we work, with the booking's own
  // ZIP check (the service ZIPs from the database) and the FAQ's approved answers; the week's hours, today marked.
  // No form, email, map or address, and never "open now": every detail is by appointment.
  function chicagoDay() {
    try { return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'long' }).format(new Date()); }   // the business's time zone
    catch (e) { return new Date().toLocaleDateString('en-US', { weekday: 'long' }); }
  }
  function extMark() {   // the "opens elsewhere" mark (an SVG needs its own namespace, which el() does not make)
    const NS = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(NS, 'svg'), p = document.createElementNS(NS, 'path');
    s.setAttribute('class', 'ext'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    p.setAttribute('d', 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5');
    p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '1.7'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
    s.appendChild(p);
    return s;
  }
  function telMark() {   // the menu's phone mark, for a call button (a call never gets an arrow)
    const NS = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(NS, 'svg'), p = document.createElementNS(NS, 'path');
    s.setAttribute('class', 'tel-mark'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    p.setAttribute('d', 'M6.6 3.8l2.3-.4 1.6 3.9-1.8 1.3a11 11 0 0 0 4.7 4.7l1.3-1.8 3.9 1.6-.4 2.3a2 2 0 0 1-2 1.7A15.6 15.6 0 0 1 4.9 5.8a2 2 0 0 1 1.7-2z');
    p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '1.7'); p.setAttribute('stroke-linejoin', 'round');
    s.appendChild(p);
    return s;
  }
  // "Do we come to you?": the booking's check and its words (booking.js zipHint), against the ZIPs in the database.
  // The field waits quietly for the menu; if the menu can't be read, the field goes and the FAQ's sentence stands.
  function zipCheck() {
    let zips = null, area = 'Parker, Texas', miles = 10, phone = PHONE;
    const f = U.field({ id: 'contact_zip', label: 'Your ZIP', inputmode: 'numeric', autocomplete: 'postal-code', maxlength: 5,
      hint: 'We check it against our service area as you type.',
      oninput: (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 5); paint(); } });
    const msg = f.querySelector('.fld-msg');
    function paint() {
      const z = f.input.value, ok = !!zips && zips.has(z);
      msg.replaceChildren();
      U.append(msg, [z.length < 5 || !zips ? 'We check it against our service area as you type.'
        : ok ? 'In our mobile area ✓' : ['We come to you within about ' + miles + ' miles of ' + area + '. For other areas, call ', U.tel(phone), '.']]);
      msg.classList.toggle('is-ok', ok);
    }
    if (D) Promise.all([D.settings(), D.menu()]).then(([s, m]) => {
      zips = m.zips;
      area = s.public_area || area; miles = s.mobile_radius_miles || miles; phone = s.public_phone || phone;
      paint();
    }).catch(() => f.remove());
    f.classList.add('ct-zip');
    return f;
  }
  function contactBody() {
    const today = chicagoDay();
    const rows = (pairs) => el('dl.ct-rows', pairs.map(([k, v]) => el('div', el('dt', k), el('dd', v))));
    const reach = el('section.ct-block.ct-reach', { 'aria-labelledby': 'ctReach' },
      el('h2.ct-h#ctReach', 'Reach us'),
      el('p.ct-phone.tnum', PHONE),
      el('a.btn.btn-gold.shine', { href: TEL, 'aria-label': 'Call us at ' + PHONE }, telMark(), 'Call us'),
      rows([
        ['Instagram', el('a.ct-link', { href: INSTAGRAM, target: '_blank', rel: 'noopener', 'aria-label': 'Instagram, @alchemy_details (opens in a new tab)' }, '@alchemy_details', extMark())],
        ['Online', el('a.note-link', { href: '#book' }, 'Book online', arrow())],
      ]));
    const where = el('section.ct-block.ct-where', { 'aria-labelledby': 'ctWhere' },
      el('h2.ct-h#ctWhere', 'Where we work'),
      el('p.ct-place', 'Parker, Texas'),
      el('p.ct-text', answer('Where do you work?')),
      zipCheck(),
      el('div.ct-sub', el('h3.ct-k', 'Mobile service'), el('p.ct-text', answer('What does mobile service need from me?'))));
    const hours = el('section.ct-block.ct-hours', { 'aria-labelledby': 'ctHours' },
      el('h2.ct-h#ctHours', 'Hours'),
      el('table.ct-week', { 'aria-labelledby': 'ctHours' },
        el('tbody', HOURS.map(([day, time]) => el('tr', { class: day === today ? 'today' : null, 'aria-current': day === today ? 'date' : null },
          el('th', { scope: 'row' }, day, day === today ? [' ', el('span.ct-today', 'Today')] : null),
          el('td.tnum', time))))),
      el('a.note-link', { href: '#faq' }, 'More in the FAQ', arrow()));
    return el('div.ct-grid', reach, where, hours);
  }

  // The emblem from the home page's Standard section: the monogram in a ring that draws itself as it arrives
  // (the ring is written as markup so the SVG lands in its own namespace).
  function emblem() {
    const e = el('div.emblem', { 'data-reveal': '' });
    e.innerHTML = '<svg class="circle" viewBox="0 0 132 132" aria-hidden="true"><circle cx="66" cy="66" r="64"/></svg>';
    e.appendChild(el('img', { src: 'img/mono-metallic.webp', alt: '', width: 547, height: 601, decoding: 'async' }));
    return e;
  }

  // The home page's two doorways (after Our work): the first tip and the About page's opening line, quoted from
  // DRAFT so the home page and the pages always say the same. Each card is one link, named by its line and action.
  function mountDoors(section) {
    const grid = section && section.querySelector('.door-grid');
    if (!grid) return;
    const [tipTitle, tipText] = DRAFT.tips.items[0];
    const door = (key, href, eyebrow, line, text, go) => el('a.door', { href, 'aria-labelledby': 'door-' + key + '-l door-' + key + '-g', 'aria-describedby': text ? 'door-' + key + '-t' : null },
      el('span.eyebrow', eyebrow),
      el('span.line', { 'aria-hidden': 'true' }),
      el('span.door-line', { id: 'door-' + key + '-l' }, whole(line, 'door-nobr')),
      text ? el('span.door-text', { id: 'door-' + key + '-t' }, text) : null,
      el('span.door-go', { id: 'door-' + key + '-g' }, go, el('span.arrow', { 'aria-hidden': 'true' }, '→')));
    grid.replaceChildren(
      door('tips', '#tips', DRAFT.tips.eyebrow, tipTitle, tipText, 'Read the tips'),
      door('about', '#about', DRAFT.about.eyebrow, DRAFT.about.intro, null, 'About us'));
    section.hidden = false;
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
      SHOW_DRAFT_BANNER ? el('div.bk-preview.draft', el('b', 'Draft'), ' — these words are a first draft for the owner to edit. Nothing here is final.') : null);
    let body;
    if (page === 'tips') body = el('div.tip-list', d.items.map(tip));
    else if (page === 'faq') body = el('div.faq', d.items.map(faqItem));
    else if (page === 'contact') body = contactBody();
    else body = [
      el('div.about-grid',
        el('div.about', d.paras.map((t) => el('p', t))),
        unveil(el('figure.about-photo', el('img', { src: 'img/work/hero-tall.webp', alt: 'A car detailed by Alchemist', width: 1080, height: 1620, loading: 'lazy', decoding: 'async' })))),
      products()];
    // Contact's own call is its one gold action, and its online booking is a text link: no second row of buttons
    const actions = page === 'contact' ? null : el('div.bk-actions',
      el('a.btn.btn-gold.shine', { href: '#book' }, 'Book Now ', arrow()),
      el('a.btn.btn-glass', { href: '#services' }, 'Services and prices'));
    root.replaceChildren(el('div.wrap.content-page', { class: page === 'contact' ? 'contact-page' : null }, head, body, actions));
  }
  window.AlchemistContent = { mount, mountDoors, DRAFT };
})();
