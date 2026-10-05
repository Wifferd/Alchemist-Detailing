/* Alchemist Detailing — connection to Supabase.
   These values are public by design: a publishable key only grants what the
   database's own rules (RLS, grants and function checks) allow a visitor to do.
   Never put a secret key or the service-role key in this file or anywhere in site/.
   Normally the site talks to the live project. Opening the site with
   ?project=test in the address switches it to the test project ("Alchemist
   Test"), where bookings are practice ones. Without this file, or when
   Supabase can't be reached, booking runs in preview mode. */
(function () {
  var LIVE = { supabaseUrl: 'https://efpzprranvgujkblnwdj.supabase.co', supabaseKey: 'sb_publishable_xXeOpsbSMXPc7Jdn0MLSEQ_VU-pzasw' };
  var TEST = { supabaseUrl: 'https://wlmostaetntbpmfgyjst.supabase.co', supabaseKey: 'sb_publishable_lJPVu8gzF2H6gZLfVs4JZw_hI_H_GZH' };
  var useTest = /[?&]project=test\b/.test(location.search);
  window.ALCHEMIST_CONFIG = useTest ? TEST : LIVE;
  window.ALCHEMIST_CONFIG.project = useTest ? 'test' : 'live';
})();
