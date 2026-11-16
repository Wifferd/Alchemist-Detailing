/* Alchemist Detailing — connection to Supabase.
   These values are public by design: a publishable key only grants what the
   database's own rules (RLS, grants and function checks) allow a visitor to do.
   Never put a secret key or the service-role key in this file or anywhere in site/.
   Only the public addresses talk to the live project (real bookings):
   thealchemistdetailing.com, www.thealchemistdetailing.com and the old
   alchemist-detailing.vercel.app (which forwards to the domain). Everything
   else uses the test project ("Alchemist Test"), where bookings are practice
   ones: the test site, every other Vercel address (previews, branch builds,
   each deployment's own address), a local copy and file://. ?project=test in
   the address forces the test project on any address. Without this file, or
   when Supabase can't be reached, booking runs in preview mode (only off the
   site's own addresses: see `deployed`). */
(function () {
  var LIVE = { supabaseUrl: 'https://efpzprranvgujkblnwdj.supabase.co', supabaseKey: 'sb_publishable_xXeOpsbSMXPc7Jdn0MLSEQ_VU-pzasw' };
  var TEST = { supabaseUrl: 'https://wlmostaetntbpmfgyjst.supabase.co', supabaseKey: 'sb_publishable_lJPVu8gzF2H6gZLfVs4JZw_hI_H_GZH' };
  // An allowlist: a practice booking from a preview, a branch build or a screenshot walk can't land in the owner's
  // real requests. (index.html's head script keeps every other address out of search with the same test, and
  // vercel.json sends X-Robots-Tag: noindex off the domain.)
  var h = location.hostname.replace(/\.$/, '');   // (a trailing dot, thealchemistdetailing.com., is the same host)
  var publicHost = /^(www\.)?thealchemistdetailing\.com$/.test(h) || h === 'alchemist-detailing.vercel.app';
  var useTest = /[?&]project=test\b/.test(location.search) || !publicHost;
  window.ALCHEMIST_CONFIG = useTest ? TEST : LIVE;
  window.ALCHEMIST_CONFIG.project = useTest ? 'test' : 'live';
  // The site's own addresses: the domain and every Vercel address (the test site and previews too). There, a
  // database that can't be reached means booking is down, not a preview: the pages give the phone number instead
  // (data.js isDown, doc 42). Anywhere else (a local copy, a claude.ai preview) the preview runs as before.
  window.ALCHEMIST_CONFIG.deployed = /(^|\.)thealchemistdetailing\.com$/.test(h) || /\.vercel\.app$/.test(h);
  // Online booking is switched off by the owner while the new menu and prices are worked out (Nov 16: "shut down
  // bookings and have my phone number appear on the page with a back button and a \"booking down, come back later,
  // sorry for the inconvenience\""). On the site's own addresses the booking page shows that note, the phone number, a
  // Call button and Back instead of the form; the live database refuses requests too (business_settings.guest_booking
  // set to false the same day). To reopen: set this to false and guest_booking back to true. On the test site and
  // other Vercel addresses (never the public ones), ?booking=open shows the form; ?booking=closed shows the note
  // anywhere (a local copy, for screenshots).
  window.ALCHEMIST_CONFIG.bookingClosed = /[?&]booking=closed\b/.test(location.search) ||
    (window.ALCHEMIST_CONFIG.deployed && !(!publicHost && /[?&]booking=open\b/.test(location.search)));
  // Sign-in is by text code (Twilio Verify, set in Supabase). The optional email and its code show only once the
  // site can email codes (an email sender in Supabase): set this to true then.
  window.ALCHEMIST_CONFIG.emailCodes = false;
  // Text codes need Twilio Verify connected in Supabase (doc 36). Until then a team login made with a phone only
  // can't sign in, and the Admin page's "Add a team member" says so. Set this to true once texts work.
  window.ALCHEMIST_CONFIG.textCodes = false;
})();
