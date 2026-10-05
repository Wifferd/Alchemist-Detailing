/* Alchemist Detailing — the content pages: Tips, FAQ, About (#tips, #faq, #about).
   Every word here is a DRAFT for the owner to edit (doc 30). The FAQ only
   repeats facts the database already holds: prices, area, hold, payment. */
(function () {
  'use strict';
  const U = window.AlchemistUI, D = window.AlchemistData;
  const { el } = U;
  const PHONE = '(945) 361-7551';

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
        ['How far ahead can I book?', 'From tomorrow up to 60 days ahead. Start times run every 30 minutes from 10 AM to 7 PM, and every job finishes by 8 PM.'],
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

  let root = null;
  function mount(container, page) { root = container; render(page); }
  function render(page) {
    const d = DRAFT[page];
    const body = el('div.bk-grid',
      el('div.bk-preview', el('b', 'Draft'), ' — these words are a first draft for the owner to edit. Nothing here is final.'),
      el('p.bk-note', d.intro),
      d.items ? el('div.faq', d.items.map(([q, a]) => el('details.faq-item', el('summary', q), el('p', a)))) : null,
      d.paras ? el('div.about', d.paras.map((t) => el('p', t))) : null,
      el('div.bk-actions', el('a.btn.btn-gold.shine', { href: '#book' }, 'Book Now ', el('span.arrow', { 'aria-hidden': 'true' }, '→')), el('a.btn.btn-glass', { href: '#services' }, 'Services and prices')));
    root.replaceChildren(el('div.bk.acct', el('header.bk-head', el('p.eyebrow', d.eyebrow), el('h1.display.bk-title', d.title)), body));
  }
  window.AlchemistContent = { mount, DRAFT };
})();
