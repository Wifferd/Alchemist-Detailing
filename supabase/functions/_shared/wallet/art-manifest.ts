// The wallet art's fingerprints (plan 4.3): "apple/<state>/<file>.png" and "google/<file>.png" -> SHA-1 (hex).
// Written by tools/make_wallet_art.py when the art is made; the files themselves are served from site/img/wallet/ and
// each one is checked against this list before it goes into a pass, so a changed picture on the site never ships.
// Empty in Phase A (Nov 12, 2026): the art isn't made yet, so passes use the stand-in drawn by art.ts.
export interface ArtManifest {
  version: number;
  files: Record<string, string>;
}

const manifest: ArtManifest = { version: 0, files: {} };
export default manifest;
