/* Alchemist Detailing — connection to the live Supabase project ("Alchemist Detailing", us-east-1).
   These two values are public by design: the publishable key only grants what the
   database's own rules (RLS, grants and function checks) allow a visitor to do.
   Never put a secret key or the service-role key in this file or anywhere in site/.
   The booking app is not built yet; it will read this when it is. Without this file,
   or when Supabase can't be reached, booking runs in preview mode. */
window.ALCHEMIST_CONFIG = {
  supabaseUrl: 'https://efpzprranvgujkblnwdj.supabase.co',
  supabaseKey: 'sb_publishable_xXeOpsbSMXPc7Jdn0MLSEQ_VU-pzasw',
};
