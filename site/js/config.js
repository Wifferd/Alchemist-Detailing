/* Alchemist Detailing — connection to Supabase.
   These values are public by design: a publishable key only grants what the
   database's own rules (RLS, grants and function checks) allow a visitor to do.
   Never put a secret key or the service-role key in this file or anywhere in site/.
   Normally the site talks to the live project. Every address of the test
   Vercel project (alchemist-detailing-test.vercel.app, its -wiffy-washes and
   -git-main aliases and each deployment's own address), or ?project=test in
   the address, switches it to the test project ("Alchemist Test"), where
   bookings are practice ones. Without this file, or when
   Supabase can't be reached, booking runs in preview mode. */
(function () {
  var LIVE = { supabaseUrl: 'https://efpzprranvgujkblnwdj.supabase.co', supabaseKey: 'sb_publishable_xXeOpsbSMXPc7Jdn0MLSEQ_VU-pzasw' };
  var TEST = { supabaseUrl: 'https://wlmostaetntbpmfgyjst.supabase.co', supabaseKey: 'sb_publishable_lJPVu8gzF2H6gZLfVs4JZw_hI_H_GZH' };
  // Every test-project address starts with "alchemist-detailing-test." or "alchemist-detailing-test-" (the main
  // address, the aliases, each deployment's own); no live address does (a live deployment's hash has no hyphen).
  var useTest = /[?&]project=test\b/.test(location.search) || /^alchemist-detailing-test[.-]/.test(location.hostname);
  window.ALCHEMIST_CONFIG = useTest ? TEST : LIVE;
  window.ALCHEMIST_CONFIG.project = useTest ? 'test' : 'live';
  // The site's own addresses: the domain and every Vercel address (the test site and previews too). There, a
  // database that can't be reached means booking is down, not a preview: the pages give the phone number instead
  // (data.js isDown, doc 42). Anywhere else (a local copy, a claude.ai preview) the preview runs as before.
  window.ALCHEMIST_CONFIG.deployed = /(^|\.)thealchemistdetailing\.com$/.test(location.hostname) || /\.vercel\.app$/.test(location.hostname);
  // Sign-in is by text code (Twilio Verify, set in Supabase). The optional email and its code show only once the
  // site can email codes (an email sender in Supabase): set this to true then.
  window.ALCHEMIST_CONFIG.emailCodes = false;
})();
