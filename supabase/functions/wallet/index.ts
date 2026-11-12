// Alchemist Detailing: the wallet wash card's public function (Migration 009, plan 4.2). Deployed with verify_jwt off:
// Apple's calls carry "Authorization: ApplePass <token>", not a Supabase token, so every route checks its own caller.
//
// Routes (Supabase puts the function's name first: /functions/v1/wallet/...):
//   GET  /wallet/apple/d/<download token>      the .pkpass (from the card page's "Add to Apple Wallet")
//   GET  /wallet/google/d/<download token>     a 302 to Google's save page (dry run in Phase A: JSON saying what it would do)
//   Apple's web service, webServiceURL = .../functions/v1/wallet/apple:
//   POST   /apple/v1/devices/<device>/registrations/<pass type>/<serial>   register (201, 200, 401, 400)
//   DELETE /apple/v1/devices/<device>/registrations/<pass type>/<serial>   unregister (200, 401) - Apple's own method
//   GET    /apple/v1/devices/<device>/registrations/<pass type>?passesUpdatedSince=<tag>   (200 or 204)
//   GET    /apple/v1/passes/<pass type>/<serial>                           the latest pass (200, 304, 401)
//   POST   /apple/v1/log                                                   Apple's error log (200)
// A download token lives 10 minutes and is the only token in a URL path (plan 7). A wrong or expired one, a voided card,
// or a wallet that is switched off sends the visitor back to the card page (the database checks all of it again).
// Tokens are compared inside the database; nothing secret is logged (util.log redacts).
import { config } from "../_shared/wallet/config.ts";
import { DbError, rpc } from "../_shared/wallet/db.ts";
import { passJson, type PassData } from "../_shared/wallet/pass.ts";
import { ArtError, passArt } from "../_shared/wallet/art.ts";
import { buildPkpass } from "../_shared/wallet/sign.ts";
import { CertError, signingPair } from "../_shared/wallet/certs.ts";
import { loyaltyObject, objectId, objectPatch, SAVE_LINK_LIMIT, SAVE_URL, saveToken, signer, googleCall }
  from "../_shared/wallet/google.ts";
import { dec, empty, json, log, readBody, redirect } from "../_shared/wallet/util.ts";

const TOKEN = /^[A-HJ-NP-Z2-9]{26}$/;
const AUTH = /^ApplePass ([A-HJ-NP-Z2-9]{32})$/;
const DEVICE = /^[A-Za-z0-9._-]{1,128}$/;
const SERIAL = /^[A-HJ-NP-Z2-9]{8}$/;

function cardPage(): string {
  const cfg = config();
  return cfg.siteUrl ? `${cfg.siteUrl}/#card` : "https://example.invalid/#card";
}

async function problem(platform: string, code: string, detail: string): Promise<void> {
  try {
    await rpc("wallet_problem", { p_platform: platform, p_code: code, p_detail: detail.slice(0, 300) });
  } catch { /* the log line below is enough */ }
  log("wallet_problem", { platform, code, detail });
}

// A signed .pkpass for this card, or a 503 when Apple isn't set up on this project.
async function pkpass(d: PassData): Promise<Response> {
  const cfg = config();
  if (!cfg.passTypeId || !cfg.teamId) {
    await problem("setup", "apple_not_configured", "No Apple pass type or team on this project.");
    return json(503, { error: "not_set_up", detail: "Apple Wallet isn't set up yet." });
  }
  let pair;
  try {
    pair = await signingPair(cfg);
  } catch (e) {
    await problem("setup", e instanceof CertError ? e.code : "signing_pair", String((e as Error).message));
    return json(503, { error: "not_set_up", detail: "Apple Wallet isn't set up yet." });
  }
  if (!pair) {
    await problem("setup", "apple_no_certificate", "No Pass Type ID key and certificate installed (wallet-sync/apple-csr, apple-cert).");
    return json(503, { error: "not_set_up", detail: "Apple Wallet isn't set up yet." });
  }
  let images;
  try {
    images = await passArt({ stamps: d.stamps, slots: d.slots, member: d.member, test: cfg.label === "test" }, cfg.artUrl);
  } catch (e) {
    if (e instanceof ArtError) {
      await problem("setup", "art_mismatch", e.message);
      return json(503, { error: "not_set_up", detail: "The card's pictures are being updated. Try again shortly." });
    }
    throw e;
  }
  const bytes = await buildPkpass(passJson(d, cfg), images, pair);
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": "application/vnd.apple.pkpass",
      "content-disposition": 'attachment; filename="wash-card.pkpass"',
      "last-modified": new Date(d.changed_at_ms).toUTCString(),
      "cache-control": "no-store",
    },
  });
}

async function appleDownload(dl: string): Promise<Response> {
  if (!TOKEN.test(dl)) return redirect(cardPage());
  const d = await rpc<PassData | null>("wallet_pass_data", { p_dl: dl, p_platform: "apple" });
  if (!d) return redirect(cardPage());
  log("apple_download", { code: d.code });
  return await pkpass(d);
}

async function googleDownload(dl: string): Promise<Response> {
  if (!TOKEN.test(dl)) return redirect(cardPage());
  const d = await rpc<PassData | null>("wallet_pass_data", { p_dl: dl, p_platform: "google" });
  if (!d) return redirect(cardPage());
  const cfg = config();
  const s = await signer(cfg);
  const obj = loyaltyObject(d, cfg);
  if (cfg.googleMode !== "live") {
    const jwt = await saveToken(obj, cfg, s);
    log("google_dry_run", { code: d.code, would: "redirect to Google's save page", jwt_length: jwt.length });
    return json(200, {
      dry_run: true,
      would: "redirect to Google's save page with the whole object (not yet saved at Google)",
      save_link_length: SAVE_URL.length + jwt.length,
      save_link_ok: SAVE_URL.length + jwt.length <= SAVE_LINK_LIMIT,
      object_id: obj.id,
      class_id: obj.classId,
      points: (obj.loyaltyPoints as { balance: { string: string } }).balance.string,
    });
  }
  // Live (Phase B; UNVERIFIED): a card already at Google gets a skinny link after any lagging change is sent.
  const id = objectId(cfg, d.code)!;
  const got = await googleCall(cfg, "GET", `loyaltyObject/${encodeURIComponent(id)}`);
  let token: string;
  if (got.status === 404) {
    token = await saveToken(obj, cfg, s);
  } else if (got.status === 200) {
    await googleCall(cfg, "PATCH", `loyaltyObject/${encodeURIComponent(id)}`, objectPatch({ ...d, notify: false }, cfg));
    token = await saveToken({ id }, cfg, s);
  } else {
    await problem("google", `get_${got.status}`, "Google answered while making a save link.");
    return json(503, { error: "unavailable", detail: "Google Wallet isn't answering. Try again shortly." });
  }
  await rpc("wallet_google_issued", { p_code: d.code, p_object_id: id });
  return redirect(SAVE_URL + token);
}

// ---------------------------------------------------------------- Apple's web service
function appleToken(req: Request): string | null {
  const m = AUTH.exec((req.headers.get("authorization") ?? "").trim());
  return m ? m[1] : null;
}

async function appleService(req: Request, parts: string[], url: URL): Promise<Response> {
  const cfg = config();
  const method = req.method;
  // v1/log
  if (parts.length === 2 && parts[1] === "log") {
    if (method !== "POST") return empty(405, { allow: "POST" });
    const body = await readBody(req, 16384);
    if (body === null) return empty(413);
    let lines: unknown = [];
    try {
      lines = JSON.parse(dec.decode(body)).logs;
    } catch { /* ignore */ }
    const text = (Array.isArray(lines) ? lines : []).map((x) => String(x)).join(" | ").slice(0, 2048);
    log("apple_log", { text });
    return empty(200);
  }
  // v1/passes/<pass type>/<serial>
  if (parts.length === 4 && parts[1] === "passes") {
    if (method !== "GET") return empty(405, { allow: "GET" });
    const [, , ptid, serial] = parts;
    if (!cfg.passTypeId || ptid !== cfg.passTypeId || !SERIAL.test(serial)) return empty(404);
    const token = appleToken(req);
    if (!token) return empty(401);
    const d = await rpc<PassData | null>("wallet_pass_data", { p_code: serial, p_auth: token });
    if (!d) return empty(401);
    const since = Date.parse(req.headers.get("if-modified-since") ?? "");
    if (!Number.isNaN(since) && Math.floor(d.changed_at_ms / 1000) * 1000 <= since) {
      return empty(304, { "last-modified": new Date(d.changed_at_ms).toUTCString() });
    }
    log("apple_pass_refresh", { code: d.code });
    return await pkpass(d);
  }
  // v1/devices/<device>/registrations/<pass type>[/<serial>]
  if ((parts.length === 5 || parts.length === 6) && parts[1] === "devices" && parts[3] === "registrations") {
    const device = parts[2], ptid = parts[4], serial = parts[5];
    if (!DEVICE.test(device)) return empty(404);
    if (!cfg.passTypeId || ptid !== cfg.passTypeId) return empty(404);
    if (parts.length === 5) {
      if (method !== "GET") return empty(405, { allow: "GET" });
      const r = await rpc<{ serialNumbers: string[]; lastUpdated: string } | null>("wallet_apple_changed",
        { p_device: device, p_since: url.searchParams.get("passesUpdatedSince") });
      return r ? json(200, r) : empty(204);
    }
    if (!SERIAL.test(serial)) return empty(404);
    const token = appleToken(req);
    if (method === "POST") {
      if (!token) return empty(401);
      const body = await readBody(req, 4096);
      if (body === null) return empty(413);
      let push = "";
      try {
        push = String(JSON.parse(dec.decode(body)).pushToken ?? "");
      } catch { /* malformed */ }
      const status = await rpc<number>("wallet_apple_register", { p_device: device, p_push: push, p_code: serial, p_auth: token });
      if (status === 201) log("apple_registered", { code: serial });
      return empty(status);
    }
    if (method === "DELETE") {
      if (!token) return empty(401);
      const status = await rpc<number>("wallet_apple_unregister", { p_device: device, p_code: serial, p_auth: token });
      if (status === 200) log("apple_unregistered", { code: serial });
      return empty(status);
    }
    return empty(405, { allow: "POST, DELETE" });
  }
  return empty(404);
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/functions\/v1/, "").replace(/^\/wallet(?=\/|$)/, "");
  const parts = path.split("/").filter((p) => p !== "");
  try {
    if (parts[0] === "apple" && parts[1] === "d" && parts.length === 3) {
      return req.method === "GET" ? await appleDownload(parts[2]) : empty(405, { allow: "GET" });
    }
    if (parts[0] === "google" && parts[1] === "d" && parts.length === 3) {
      return req.method === "GET" ? await googleDownload(parts[2]) : empty(405, { allow: "GET" });
    }
    if (parts[0] === "apple" && parts[1] === "v1") return await appleService(req, parts.slice(1), url);
    return empty(404);
  } catch (e) {
    if (e instanceof DbError) {
      log("db_error", { status: e.status, code: e.code, detail: e.detail });
    } else {
      log("error", { message: String((e as Error)?.message ?? e).slice(0, 300) });
    }
    return json(500, { error: "server_error", detail: "Something went wrong. Try again shortly." });
  }
});
