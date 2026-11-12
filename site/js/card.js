/* Alchemist Detailing — the wash card's page (#card, and #card-<token> for one holder), Migration 009, plan 2.2.
   The printed QR opens https://thealchemistdetailing.com/card, which vercel.json sends here. The page says what the
   card is (10 slots, one per finished wash; at 10 it turns gold and says "Loyalty member"; no reward is named: the
   owner decides one later), and offers the wallet for the visitor's device: Apple Wallet on an iPhone, Google Wallet
   on Android, both (and the QR) on a computer; never Apple on an iPad, which has no Wallet for passes.
   A tap makes the card (wallet_new_card: once per browser, kept in localStorage 'ad.card'), asks for a 10-minute
   download link (wallet_link) and opens it (the Edge Function serves the .pkpass, or sends the visitor on to Google's
   save page). A returning holder (the token in storage, or the pass's back link #card-<token>) sees their card: the
   count, the card number to read out, and the reminders switch once reminders are on.
   Nothing here is trusted: the database checks the wallet flags, the caps, the token and the hidden field again
   (house rule 5). The page holds nothing personal and asks for nothing personal. No WebGL here: a phone that arrives
   from the QR loads fast.
   Wording is PROPOSED until the owner approves it (plan 6.4): no reward, perk, discount or "free", no prices or hours,
   and the number is for calling only. */
(function () {
  'use strict';
  const U = window.AlchemistUI, D = window.AlchemistData;
  const { el, tel, toast } = U;

  const STORE = 'ad.card', REQ = 'ad.cardreq';
  const TOKEN = /^[A-HJ-NP-Z2-9]{26}$/;
  const PATH = /^\/wallet\/(apple|google)\/d\/[A-HJ-NP-Z2-9]{26}$/;
  const ART = 'img/wallet/';
  // The official badge files. Apple's licence for its "Add to Apple Wallet" artwork holds only while the Apple Developer
  // membership is active, and both brands allow only their own artwork (never a drawn copy), so each file is added
  // with its account: Apple's US-English outline badge (SVG, for dark backgrounds) in Phase C, Google's "Add to Google
  // Wallet" button in Phase B (research-practice 4.4). Until a file is named here, its wallet shows "coming soon",
  // whatever the database's flag says.
  const BADGE = { apple: null, google: null };
  const LABEL = { apple: 'Apple Wallet', google: 'Google Wallet' };

  let root = null, settings = null, ready = null, seq = 0, busy = false, phone = '(945) 361-7551';
  const st = { token: null, card: null, gone: null, error: null, saving: false };

  // ---------------------------------------------------------------- storage (each read and write may throw)
  const read = (k, s) => { try { return (s || localStorage).getItem(k); } catch (e) { return null; } };
  const write = (k, v, s) => { try { if (v == null) (s || localStorage).removeItem(k); else (s || localStorage).setItem(k, v); } catch (e) { /* private mode: this visit only */ } };
  // one request id per tab, so a double tap or a reload before the answer gets the same card back
  function requestId() {
    let id = read(REQ, sessionStorage);
    if (!id) { id = D.helpers.uuid(); write(REQ, id, sessionStorage); }
    return id;
  }

  // ---------------------------------------------------------------- the visitor's device (plan 2.2's table)
  // iPadOS Safari reports a Mac: a Mac user agent with more than one touch point is an iPad. The OS version is never
  // read (iOS 26 freezes it).
  function device() {
    const ua = navigator.userAgent || '';
    const touch = (navigator.maxTouchPoints || 0) > 1;
    const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && touch);
    const iphone = !ipad && /iPhone|iPod/.test(ua);
    const android = /Android/i.test(ua);
    // apps whose own browser often can't download a wallet card (research-practice 4.3); a printed QR opens in the
    // camera's browser, so this matters for links shared on social media
    const app = /Instagram/i.test(ua) ? 'instagram' : /FBAN|FBAV|FB_IAB|FBIOS|FB4A|Messenger/i.test(ua) ? 'facebook'
      : /TikTok|musical_ly|BytedanceWebview/i.test(ua) ? 'tiktok' : /Snapchat|LinkedInApp|Pinterest|\bLine\//i.test(ua) ? 'app' : null;
    return { kind: iphone ? 'iphone' : ipad ? 'ipad' : android ? 'android' : 'desktop', app };
  }

  // ---------------------------------------------------------------- shell
  function load() {
    if (ready) return ready;
    ready = (async () => { await D.init(); settings = await D.settings(); phone = settings.public_phone || phone; })();
    return ready;
  }
  function mount(container) { root = container; render(); }

  const slots = () => (settings && settings.wallet_slots) || 10;
  const cardName = () => (settings && settings.wallet_card_name) || 'Wash card';
  // a wallet is offered when the database's flag is on and its official badge is in place
  const on = (p) => !!(settings && settings['wallet_' + p + '_on']) && !!BADGE[p];
  const reminders = () => !!(settings && settings.wallet_reminders_on);
  const today = () => D.helpers.isoDate(D.helpers.todayIn(settings && settings.timezone));
  const day = (iso) => {
    if (!iso) return null;
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + (iso.slice(0, 4) !== today().slice(0, 4) ? ', ' + iso.slice(0, 4) : '');
  };
  const countWords = (c) => (c.stamps <= (c.slots || slots()) ? c.stamps + ' of ' + (c.slots || slots()) : c.stamps + ' washes');
  const arrow = () => el('span.arrow', { 'aria-hidden': 'true' }, '→');

  // The example a preview shows (a local copy, a claude.ai preview): labelled, nothing is saved anywhere.
  const example = () => ({ code: 'K7Q2M9XD', code_words: 'K7Q2 M9XD', card_name: cardName(), stamps: 3, slots: slots(), member: false,
    last_wash_day: D.helpers.isoDate(D.helpers.addDays(D.helpers.todayIn(settings && settings.timezone), -12)), reminders_on: reminders(), reminders_off: false, on_apple: false, on_google: false, voided: false, example: true });

  async function render() {
    const n = ++seq;
    if (!root) return;
    root.replaceChildren(U.loading('Loading…'));
    await load();
    if (n !== seq) return;
    // the database can't be reached on the real site (doc 42): the phone number, no example card
    if (D.isDown) return root.replaceChildren(U.outage(['The wash card can’t load right now. To book, call ', tel(phone), '.'], phone));
    // whose card: the pass's back link (#card-<token>) first, then this browser's own
    let hash = location.hash.slice(1);
    try { hash = decodeURIComponent(hash); } catch (e) { /* a broken %-sequence: read as typed (it then matches no token) */ }
    const sub = (hash.split('-')[1] || '').trim().toUpperCase();
    st.error = null; st.card = null; st.gone = null;
    if (!D.isLive) {
      if (sub) st.card = example();
    } else {
      const linked = TOKEN.test(sub) ? sub : null;
      if (sub && !linked) st.gone = 'That card link isn’t complete. Open it again from the back of your card.';
      const token = linked || (TOKEN.test(read(STORE) || '') ? read(STORE) : null);
      if (token) {
        try {
          st.card = await D.walletCard(token);
          st.token = token;
          if (linked) write(STORE, token);   // the holder's own link: this browser now knows the card
        } catch (e) {
          if (n !== seq) return;
          if (e.code === 'not_found') {
            if (!linked) write(STORE, null);   // a card this browser kept that the database doesn't know: start afresh
            else st.gone = 'That card wasn’t found. Check the link on the back of your card, or call ' + phone + '.';
            st.token = null;
          } else st.error = e.message;
        }
      } else st.token = null;
    }
    if (n !== seq) return;
    root.replaceChildren(page());
  }

  // ---------------------------------------------------------------- the page
  function page() {
    const c = st.card;
    const dev = device();
    const head = el('header.page-head', el('p.eyebrow', 'Alchemist Detailing'), el('h1.display.gold-text', c ? 'Your ' + cardName().toLowerCase() : cardName()), el('span.rule', { 'data-reveal': '' }),
      el('p', c ? 'Your card, as we have it.' : 'A card for your phone’s wallet. Every wash we finish fills a slot.'));
    const banner = U.modeBanner(c && c.example ? 'an example card, nothing is saved.' : 'nothing is saved, and the wallet buttons don’t open.', D.isLive);
    return el('div.wrap.wc-page',
      banner,
      head,
      st.gone ? el('p.bk-note.wc-gone', { role: 'status' }, st.gone) : null,
      st.error ? el('p.bk-note.wc-gone', { role: 'alert' }, st.error) : null,
      el('div.wc-main',
        el('div.wc-show', pass(c || { stamps: 0, slots: slots(), member: false })),
        el('div.wc-side', c ? holder(c) : null, c && c.voided ? voided() : wallets(dev, c))),
      how(),
      c && !c.voided && (c.reminders_on || reminders()) ? reminderSwitch(c) : null,
      privacy(),
      el('p.wc-fine', 'Apple, iPhone and Apple Wallet are trademarks of Apple Inc., registered in the U.S. and other countries. Android and Google Wallet are trademarks of Google LLC.'));
  }

  // The card as the wallet shows it, drawn from the pass's own pictures (img/wallet/: the same strip, logo and colours
  // as the real pass; tools/wallet/make_wallet_art.py). It stays black (or gold) in the light theme: it is the card.
  function pass(c) {
    const n = c.member ? 10 : Math.max(0, Math.min(c.stamps || 0, 9));
    const dir = ART + 'apple/' + n + '/strip';
    const logo = ART + 'apple/' + n + '/logo';   // gold on the black card, the ink on gold on the gold one
    const field = (k, v) => el('div.wc-field', el('span', k), el('b.tnum', v));
    return el('figure.wc-pass', { class: c.member ? 'member' : '' },
      el('div.wc-pass-top',
        el('img', { src: logo + '@3x.png', srcset: logo + '.png 1x, ' + logo + '@2x.png 2x, ' + logo + '@3x.png 3x', width: 72, height: 50, alt: '' }),
        el('span.wc-pass-name', 'Alchemist Detailing')),
      el('img.wc-strip', { src: dir + '@3x.png', srcset: dir + '.png 1x, ' + dir + '@2x.png 2x, ' + dir + '@3x.png 3x', width: 375, height: 144,
        alt: c.member ? 'All ' + (c.slots || slots()) + ' slots filled: a gold card' : (c.stamps || 0) + ' of ' + (c.slots || slots()) + ' slots filled' }),
      el('div.wc-fields',
        field('Washes', countWords(Object.assign({ slots: slots() }, c))),
        field('Status', c.member ? 'Loyalty member' : 'Collecting'),
        field('Last wash', day(c.last_wash_day) || '—')),
      c.code_words ? el('figcaption.wc-pass-code.tnum', c.code_words) : el('figcaption.sr-only', 'A new card: ' + slots() + ' empty slots'));
  }

  // A returning holder: the count, the card number to read out, where it is saved
  function holder(c) {
    const where = [c.on_apple ? 'Apple Wallet' : null, c.on_google ? 'Google Wallet' : null].filter(Boolean).join(' and ');
    return el('section.wc-holder', { 'aria-label': 'Your card' },
      el('dl.wc-facts',
        el('dt', 'Card number'), el('dd.tnum.wc-code', c.code_words),
        el('dt', 'Washes'), el('dd.tnum', countWords(c) + (c.member ? ' · Loyalty member' : '')),
        el('dt', 'Last wash'), el('dd', day(c.last_wash_day) || 'None yet'),
        el('dt', 'In a wallet'), el('dd', where || 'Not added yet')),
      el('p.bk-muted', 'Read your card number to us if we finished your car while you were out.'));
  }
  function voided() {
    return el('div.wc-wallet', el('p.bk-note', 'This card is no longer in use. To ask about it, call ', tel(phone), '.'));
  }

  // ---------------------------------------------------------------- the wallet buttons, by device
  function wallets(dev, c) {
    const box = el('div.wc-wallet');
    const apple = on('apple'), google = on('google');
    const again = !!c;
    // the honeypot people never see (as in booking): a filled one makes the database refuse the card
    const hp = el('div.bk-hp', { 'aria-hidden': 'true' }, el('label', { for: 'wc-website' }, 'Website'), el('input', { id: 'wc-website', name: 'website', type: 'text', tabIndex: -1, autocomplete: 'off' }));
    const say = el('p.wc-say', { role: 'status', 'aria-live': 'polite' });
    const badge = (p) => el('button.wc-badge', { type: 'button', class: p, disabled: !D.isLive, onclick: () => add(p, hp.querySelector('input').value, say) },
      el('img', { src: BADGE[p], alt: 'Add to ' + LABEL[p], height: 48 }));
    const qr = () => el('img.wc-qr', { src: ART + (window.ALCHEMIST_CONFIG && window.ALCHEMIST_CONFIG.project === 'live' ? 'card-qr.svg' : 'card-qr-test.svg'), width: 148, height: 148, alt: 'QR code for this page' });
    const mine = dev.kind === 'iphone' ? 'apple' : dev.kind === 'android' ? 'google' : null;

    // Neither wallet ready (Phase A, and until each account and its artwork exist): a calm "coming soon", with what
    // the visitor can do now
    if (!apple && !google) {
      const where = dev.kind === 'iphone' ? 'Adding it to Apple® Wallet on your iPhone is coming soon.'
        : dev.kind === 'android' ? 'Adding it to Google Wallet on your phone is coming soon.'
        : dev.kind === 'ipad' ? 'Adding it to Apple® Wallet on an iPhone is coming soon. (iPad has no Wallet for cards like this one.)'
        : 'Adding it to Apple® Wallet or Google Wallet is coming soon. You’ll add it from your phone.';
      box.append(el('p.eyebrow.wc-soon-eyebrow', 'Coming soon'), el('p.wc-soon', where),
        el('div.wc-actions', el('a.btn.btn-gold.shine', { href: '#book' }, 'Book a detail', arrow()),
          el('a.acct-go', { href: 'tel:+1' + phone.replace(/\D/g, '').slice(-10) }, U.telMark(), el('span', 'Call ', el('span.tnum', phone)))));
      return box;
    }
    // (the DOM's own append writes a null out as the word "null": only nodes go in)
    const put = (...xs) => box.append(...xs.filter(Boolean));
    if (dev.app) put(inApp(dev));
    const soon = (p) => el('p.wc-soon', 'Adding it to ' + (p === 'apple' ? 'Apple® Wallet' : 'Google Wallet') + ' is coming soon.');
    if (mine) {
      // a phone: its own wallet only, and a line for the other kind of phone
      put(on(mine) ? badge(mine) : soon(mine), say,
        el('p.bk-muted', mine === 'apple' ? 'Android phone? Open this page on it' + (google ? '.' : ': Google Wallet is coming soon.') : 'iPhone? Open this page on it' + (apple ? '.' : ': Apple Wallet is coming soon.')));
    } else if (dev.kind === 'ipad') {
      put(el('p.wc-soon', apple ? 'Open this page on your iPhone to add the card to Apple® Wallet. iPad has no Wallet for cards like this one.' : 'Adding it to Apple® Wallet on an iPhone is coming soon. (iPad has no Wallet for cards like this one.)'), qr(),
        google ? el('p.bk-muted', 'On an Android phone, the same page adds it to Google Wallet.') : null);
    } else {
      // a computer: both, the same height, and the QR to carry the page to the phone
      const how = apple && google ? 'an iPhone adds the card to Apple® Wallet, an Android phone to Google Wallet.' : apple ? 'an iPhone adds the card to Apple® Wallet.' : 'an Android phone adds the card to Google Wallet.';
      put(el('div.wc-badges', apple ? badge('apple') : null, google ? badge('google') : null), say,
        el('div.wc-carry', qr(), el('p.bk-muted', 'Scan this code with your phone’s camera to open this page there: ' + how)),
        !apple ? soon('apple') : !google ? soon('google') : null);
    }
    if (again) put(el('p.bk-muted', 'Already added? Adding it again replaces it in your wallet: you won’t get two.'));
    else if (reminders()) put(el('p.bk-muted.wc-consent', 'The card may remind you now and then that it’s time for a wash. You can turn reminders off from the card at any time.'));
    box.append(hp);
    return box;
  }

  // An app's own browser (Instagram, Facebook, TikTok…) often can't save a wallet card: how to open the page in the
  // phone's browser. Android takes an intent link; Instagram on an iPhone its own link; otherwise the app's menu.
  function inApp(dev) {
    const page = location.origin + '/card';
    const ios = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent || '');
    const go = dev.kind === 'android' ? el('a.btn.btn-glass', { href: 'intent://' + location.host + '/card#Intent;scheme=https;end' }, 'Open in Chrome')
      : ios && dev.app === 'instagram' ? el('a.btn.btn-glass', { href: 'instagram://extbrowser/?url=' + encodeURIComponent(page) }, 'Open in Safari') : null;
    return el('div.bk-note.wc-inapp', el('b', 'Open this page in ' + (ios ? 'Safari' : 'your browser') + ' first.'), ' Apps’ own browsers often can’t save a wallet card. Tap ••• or the share button, then “Open in ' + (ios ? 'Safari' : 'browser') + '”.', go ? el('div.wc-actions', go) : null);
  }

  // One tap: the card (once per browser), a download link, then the wallet. A second tap while it works does nothing.
  async function add(platform, website, say) {
    if (busy || !D.isLive) return;
    busy = true;
    say.classList.remove('err');
    say.textContent = 'Getting your card ready…';
    try {
      let token = st.token;
      if (!token) {
        const made = await D.walletNewCard(requestId(), website);
        if (!made || !TOKEN.test(made.token || '')) throw D.fail('unknown', 'Something went wrong. Please reload the page and try again.');
        token = made.token; st.token = token; write(STORE, token);
      }
      const link = await D.walletLink(token, platform);
      if (!link || !PATH.test(link.path || '')) throw D.fail('unknown', 'Something went wrong. Please reload the page and try again.');
      say.textContent = 'Opening ' + LABEL[platform] + '…';
      location.href = D.walletBase() + link.path;
      // the wallet opens over the page, or the page goes on to Google: a page that stays (or comes back) takes taps again
      setTimeout(() => { busy = false; say.textContent = ''; }, 4000);
    } catch (e) {
      busy = false;
      say.textContent = e.message || 'That didn’t work. Please try again.';
      say.classList.add('err');
      if (e.code === 'not_found') { write(STORE, null); st.token = null; }
    }
  }
  // back from the wallet through the browser's own cache: the page is live again
  window.addEventListener('pageshow', (e) => { if (e.persisted) busy = false; });

  // ---------------------------------------------------------------- what the card is, reminders, privacy
  function how() {
    const n = slots();
    const gold = ART + 'apple/10/strip';
    return el('section.acct-sec.wc-how', el('h2.bk-h2', 'How it works'),
      el('ol.wc-steps',
        el('li', el('span.n.tnum', { 'aria-hidden': 'true' }, '01'), el('span', 'Add the card to your phone’s wallet. It asks for no name, number or email.')),
        el('li', el('span.n.tnum', { 'aria-hidden': 'true' }, '02'), el('span', 'After each wash we finish, we stamp one of its ' + n + ' slots. Usually we scan the card’s code at your car; if you’re out, we stamp it later.')),
        el('li', el('span.n.tnum', { 'aria-hidden': 'true' }, '03'), el('span', 'At ' + n + ' washes the card turns gold and says “Loyalty member”.'),
          el('img.wc-gold', { src: gold + '@2x.png', srcset: gold + '.png 1x, ' + gold + '@2x.png 2x, ' + gold + '@3x.png 3x', width: 375, height: 144, loading: 'lazy', alt: 'The gold card: all ' + n + ' slots filled' }))));
  }
  function reminderSwitch(c) {
    const off = !!c.reminders_off;
    const btn = el('button.wc-switch', { type: 'button', 'aria-pressed': off ? 'false' : 'true', disabled: st.saving || c.example,
      onclick: async () => {
        if (st.saving || !st.token) return;
        st.saving = true; btn.setAttribute('aria-busy', 'true');
        try { st.card = await D.walletSetReminders(st.token, off); toast(off ? 'Reminders on' : 'Reminders off'); }
        catch (e) { toast(e.message || 'That didn’t work.'); }
        st.saving = false;
        root.replaceChildren(page());
        const again = root.querySelector('.wc-switch'); if (again) again.focus({ preventScroll: true });
      } }, el('span.wc-knob', { 'aria-hidden': 'true' }), el('span', off ? 'Off' : 'On'));
    return el('section.acct-sec.wc-remind', el('h2.bk-h2', 'Wash reminders'),
      el('div.wc-remind-row', el('p.bk-muted', 'Now and then your card can remind you that it’s time for a wash.'), el('div.wc-switch-wrap', el('span.sr-only', 'Wash reminders'), btn)));
  }
  function privacy() {
    return el('details.wc-privacy', el('summary', 'Wash card privacy'),
      el('ul',
        el('li', 'The card holds a card number, a count of washes and their dates. No name, phone number, email, address or vehicle.'),
        el('li', 'Each stamp is linked to the booking it was for, which we already keep.'),
        el('li', 'We don’t share or sell any of it. Apple or Google keeps its own copy of the card in your wallet.'),
        el('li', 'To remove the card, delete it from your wallet. We keep our record of the card and its stamps.')));
  }

  window.AlchemistCard = { mount };
})();
