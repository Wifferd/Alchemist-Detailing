// The wallet art's fingerprints (plan 4.3): "apple/<state>/<file>.png" and "google/<file>.png" -> SHA-1 (hex).
// Written by tools/make_wallet_art.py when the art is made; the files themselves are served from site/img/wallet/ and
// each one is checked against this list before it goes into a pass, so a changed picture on the site never ships.
// Empty in Phase A (Nov 12, 2026): passes use the stand-in drawn by art.ts. Compile the site's manifest in here
// (tools/wallet/make_wallet_art.py --ts) only once that project's site serves the art (plan 4.3's order: push the
// site, check both Vercel projects deployed it, then deploy the function); before that every listed picture would be
// fetched from a site that doesn't have it, and the pass route would answer 503.
export interface ArtManifest {
  version: number;
  files: Record<string, string>;
}

const manifest: ArtManifest = { version: 0, files: {} };
export default manifest;
