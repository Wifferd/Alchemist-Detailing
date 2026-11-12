// Google Wallet: the loyalty class and object, the "Add to Google Wallet" save link, and updates (plan 2.4, 4.2, 4.5).
//
// Two modes (config.googleMode): "dry-run" (Phase A, and whenever the GOOGLE_WALLET_SA secret is missing): the object
// and the save link are built and signed with a throwaway key made in this worker, nothing reaches Google, and the
// caller logs or returns what it would have sent. "live" (Phase B on): the service account JSON (pasted into the
// dashboard by the owner himself, never sent through the chat) signs RS256 tokens with WebCrypto.
// UNVERIFIED until Phase B: every call to Google, the skinny save link without classId [G16], and the gold routes G-a
// (hero colour, the default here), G-b (classId change) and G-c (linked pass).
import type { WalletConfig } from "./config.ts";
import manifest from "./art-manifest.ts";
import { ORG, type PassData, siteOf } from "./pass.ts";
import { b64url, enc, pemToDer, toBuf } from "./util.ts";

const API = "https://walletobjects.googleapis.com/walletobjects/v1";

export interface Signer {
  email: string;
  key: CryptoKey;
  dryRun: boolean;
}

function artState(d: PassData): number {
  return d.member ? d.slots : Math.max(0, Math.min(d.stamps, d.slots));
}

// The points line: "3 / 10" (Google allows 7 characters), the count alone past the slots.
export function pointsText(d: { stamps: number; slots: number }): string {
  return d.stamps <= d.slots ? `${d.stamps} / ${d.slots}` : String(d.stamps);
}

export function objectId(cfg: WalletConfig, code: string): string | null {
  return cfg.googleIssuerId ? `${cfg.googleIssuerId}.${code}` : null;
}

export function loyaltyObject(d: PassData, cfg: WalletConfig): Record<string, unknown> {
  const issuer = cfg.googleIssuerId ?? "0000000000000000000";   // dry-run stand-in, never sent
  const site = siteOf(d, cfg);
  // tools/make_wallet_art.py: hero-<n>-v1.png, and hero-test-<n>-v1.png for the test project's grey look
  const hero = `google/hero-${cfg.label === "test" ? "test-" : ""}${artState(d)}-v1.png`;
  const obj: Record<string, unknown> = {
    id: `${issuer}.${d.code}`,
    classId: `${issuer}.${cfg.googleClassCard}`,
    state: d.voided ? "INACTIVE" : "ACTIVE",
    accountId: d.code,                                          // nothing personal (plan 7)
    loyaltyPoints: { label: "Washes", balance: { string: pointsText(d) } },
    barcode: { type: "QR_CODE", value: site ? `${site}/#admin-cards-${d.code}` : d.code, alternateText: d.code_words },
    linksModuleData: {
      uris: site
        ? [
          { id: "book", uri: `${site}/#book`, description: "Book a wash" },
          { id: "card", uri: `${site}/#card-${d.add_token}`, description: "Card page and reminders" },
        ]
        : [],
    },
  };
  if (d.member) {
    // PROPOSED (Q-9): "Member" in the points line (7-character limit) and "Loyalty member" in a text module.
    obj.secondaryLoyaltyPoints = { label: "Status", balance: { string: "Member" } };
    obj.textModulesData = [{ id: "status", header: "Status", body: "Loyalty member" }];
  }
  // Gold route G-a: each count has its own hero image (gold at the last slot); the class sets no background colour, so
  // Google takes the hero's dominant colour. Only once the art exists (art-manifest), at a new address per count.
  if (manifest.files[hero] && cfg.artUrl) {
    obj.heroImage = { sourceUri: { uri: `${cfg.artUrl}/${hero}` },
      contentDescription: { defaultValue: { language: "en-US", value: d.count_words } } };
  }
  return obj;
}

export function loyaltyClass(cfg: WalletConfig, cardName: string, phone: string | null, area: string | null,
  member = false): Record<string, unknown> {
  const issuer = cfg.googleIssuerId ?? "0000000000000000000";
  const test = cfg.label === "test";
  const modules = [{ id: "how", header: "How it works", body: "Each wash fills one slot." }];   // PROPOSED wording
  if (phone) modules.push({ id: "call", header: "Call", body: phone });
  if (area) modules.push({ id: "area", header: "Area", body: area });
  const cls: Record<string, unknown> = {
    id: `${issuer}.${member ? cfg.googleClassMember : cfg.googleClassCard}`,
    issuerName: test ? `${ORG} (test)` : ORG,
    programName: (test ? `TEST ${cardName.toLowerCase()}` : cardName).slice(0, 20),
    reviewStatus: "UNDER_REVIEW",
    multipleDevicesAndHoldersAllowedStatus: "ONE_USER_ALL_DEVICES",
    textModulesData: modules,
  };
  if (manifest.files["google/logo-v1.png"] && cfg.artUrl) {
    cls.programLogo = { sourceUri: { uri: `${cfg.artUrl}/google/logo-v1.png` },
      contentDescription: { defaultValue: { language: "en-US", value: ORG } } };
  }
  return cls;
}

async function signJwt(claims: Record<string, unknown>, signer: Signer): Promise<string> {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(claims));
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", signer.key, enc.encode(`${head}.${body}`)));
  return `${head}.${body}.${b64url(sig)}`;
}

// The save link's token: the whole object for a card not yet at Google (nothing exists there until Save is tapped),
// or only {id} for one that exists. Google warns past about 1,800 characters in the link.
export async function saveToken(obj: Record<string, unknown>, cfg: WalletConfig, signer: Signer): Promise<string> {
  const origins = cfg.siteUrl ? [new URL(cfg.siteUrl).host] : [];
  return await signJwt({
    iss: signer.email,
    aud: "google",
    typ: "savetowallet",
    iat: Math.floor(Date.now() / 1000),
    origins,
    payload: { loyaltyObjects: [obj] },
  }, signer);
}

export const SAVE_URL = "https://pay.google.com/gp/v/save/";
export const SAVE_LINK_LIMIT = 1750;

let dryKey: CryptoKey | null = null;
let liveSigner: Signer | null = null;

export async function signer(cfg: WalletConfig): Promise<Signer> {
  if (cfg.googleMode === "live") {
    if (liveSigner) return liveSigner;
    const sa = JSON.parse(Deno.env.get("GOOGLE_WALLET_SA") ?? "{}");
    const key = await crypto.subtle.importKey("pkcs8", toBuf(pemToDer(String(sa.private_key ?? ""), "PRIVATE KEY")),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    liveSigner = { email: String(sa.client_email ?? ""), key, dryRun: false };
    return liveSigner;
  }
  if (!dryKey) {
    const pair = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      false, ["sign", "verify"]) as CryptoKeyPair;
    dryKey = pair.privateKey;
  }
  return { email: "dry-run@wallet.invalid", key: dryKey, dryRun: true };
}

// ---------------------------------------------------------------- REST (live only)
let access: { token: string; until: number } | null = null;

async function accessToken(cfg: WalletConfig): Promise<string> {
  if (access && Date.now() < access.until - 5 * 60 * 1000) return access.token;
  const s = await signer(cfg);
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwt({
    iss: s.email,
    scope: "https://www.googleapis.com/auth/wallet_object.issuer",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }, s);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`google_oauth_${r.status}`);
  const j = await r.json();
  access = { token: String(j.access_token), until: Date.now() + Number(j.expires_in ?? 3600) * 1000 };
  return access.token;
}

export async function googleCall(cfg: WalletConfig, method: string, path: string, body?: unknown):
  Promise<{ status: number; body: Record<string, unknown> | null }> {
  if (cfg.googleMode !== "live") throw new Error("google dry-run: no calls");
  const r = await fetch(`${API}/${path}`, {
    method,
    headers: { authorization: "Bearer " + (await accessToken(cfg)), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await r.text();
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch { /* not JSON */ }
  return { status: r.status, body: parsed };
}

// What a sync sends for a card that changed: the points, the member lines, the hero (gold route G-a) and the state.
export function objectPatch(d: PassData, cfg: WalletConfig): Record<string, unknown> {
  const full = loyaltyObject(d, cfg);
  const patch: Record<string, unknown> = {
    state: full.state,
    loyaltyPoints: full.loyaltyPoints,
    secondaryLoyaltyPoints: full.secondaryLoyaltyPoints ?? null,
    textModulesData: full.textModulesData ?? [],
  };
  if (full.heroImage) patch.heroImage = full.heroImage;
  // Google's notifying fields send an update notice only when asked, at most 3 in 24 hours per pass [G12].
  if (d.notify && (d.last_change === "stamp" || d.last_change === "member")) patch.notifyPreference = "NOTIFY_ON_UPDATE";
  return patch;
}

// A reminder as a Google message with a notification (at most 10 messages per object: trim to the newest 9 first).
export async function addReminderMessage(cfg: WalletConfig, id: string, text: string): Promise<number> {
  const got = await googleCall(cfg, "GET", `loyaltyObject/${encodeURIComponent(id)}`);
  if (got.status !== 200) return got.status;
  const messages = Array.isArray(got.body?.messages) ? got.body!.messages as unknown[] : [];
  if (messages.length >= 10) {
    const trim = await googleCall(cfg, "PATCH", `loyaltyObject/${encodeURIComponent(id)}`, { messages: messages.slice(-9) });
    if (trim.status !== 200) return trim.status;
  }
  const r = await googleCall(cfg, "POST", `loyaltyObject/${encodeURIComponent(id)}/addMessage`, {
    message: { header: ORG, body: text, messageType: "TEXT_AND_NOTIFY" },
  });
  return r.status;
}
