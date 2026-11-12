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

// The save link's token: the object for a card not yet at Google (nothing exists there until Save is tapped), or only
// {id} for one that exists.
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
// Google warns past about 1,800 characters in the link; this keeps a margin.
export const SAVE_LINK_LIMIT = 1750;

// The object a save link carries for a card not yet at Google: everything but the member lines (secondaryLoyaltyPoints,
// textModulesData) and the hero's description, which the gold card's link can't carry under the limit (1,899
// characters at 10 washes with them, review round 1). The first update after Save puts them back: the sweep's check of
// a fresh link (wallet-sync, firstSavePatch) or the next sync's PATCH (objectPatch sends all of them).
export function saveObject(full: Record<string, unknown>): Record<string, unknown> {
  const { secondaryLoyaltyPoints: _s, textModulesData: _t, heroImage, ...lean } = full;
  if (heroImage) lean.heroImage = { sourceUri: (heroImage as { sourceUri: unknown }).sourceUri };
  return lean;
}

export interface SaveLink {
  link: string | null;        // null: too long even trimmed (the route refuses and records a problem)
  length: number;             // the link's length (the last one tried)
  trimmed: string[];          // what was left out beyond saveObject's lean set, to fit
}

// The save link for a card not yet at Google, kept under SAVE_LINK_LIMIT: the lean object; if that is still too long,
// without the hero picture, then without the links module (both come back with the first update after Save).
export async function saveLink(full: Record<string, unknown>, cfg: WalletConfig, s: Signer): Promise<SaveLink> {
  const lean = saveObject(full);
  const { heroImage: _hero, ...noHero } = lean;
  const { linksModuleData: _links, ...noLinks } = noHero;
  const tries: [Record<string, unknown>, string[]][] = [[lean, []]];
  if ("heroImage" in lean) tries.push([noHero, ["heroImage"]]);
  if ("linksModuleData" in noHero) tries.push([noLinks, [...tries[tries.length - 1][1], "linksModuleData"]]);
  let length = 0;
  for (const [obj, trimmed] of tries) {
    const link = SAVE_URL + await saveToken(obj, cfg, s);
    length = link.length;
    if (length <= SAVE_LINK_LIMIT) return { link, length, trimmed };
  }
  return { link: null, length, trimmed: tries[tries.length - 1][1] };
}

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
  if (full.linksModuleData) patch.linksModuleData = full.linksModuleData;
  // Google's notifying fields send an update notice only when asked, at most 3 in 24 hours per pass [G12]. d.notify is
  // the database's decision (Migration 009 part 5c: one a day per card, never a past wash added by hand unless it turns
  // the card gold, not when the holder silenced everything).
  if (d.notify && (d.last_change === "stamp" || d.last_change === "member")) patch.notifyPreference = "NOTIFY_ON_UPDATE";
  return patch;
}

export interface PatchResult {
  status: number;                 // Google's answer to the update that counts (the quiet retry's, if there was one)
  noticeRefused: number | null;   // Google's answer to a notifying update it refused, when the quiet retry followed
}

type Call = typeof googleCall;

// A sync's update of a Google object. The database allows a notice at most once a day per card and never for a past
// wash added by hand (part 5c), which keeps every card under Google's 3 notifying updates in 24 hours [G12]. If Google
// still refuses a notifying update with a 4xx other than 404 (QuotaExceededException past its cap, or anything else it
// won't notify about), the same update goes again at once without notifyPreference: the count still reaches the phone,
// and the card isn't left behind for the sweep to resend the refused notice every 10 minutes. 404 (not saved at Google
// yet) and 5xx go back to the caller as they are. (call: googleCall; a stand-in in tools/wallet/wallet_local_test.ts.)
export async function patchObject(cfg: WalletConfig, id: string, patch: Record<string, unknown>,
  call: Call = googleCall): Promise<PatchResult> {
  const path = `loyaltyObject/${encodeURIComponent(id)}`;
  const r = await call(cfg, "PATCH", path, patch);
  if (!patch.notifyPreference || r.status < 400 || r.status >= 500 || r.status === 404) {
    return { status: r.status, noticeRefused: null };
  }
  const { notifyPreference: _n, ...quiet } = patch;
  const again = await call(cfg, "PATCH", path, quiet);
  return { status: again.status, noticeRefused: r.status };
}

// The first update after a fresh save link was saved (the sweep's check, wallet-sync): what saveLink left out (the
// member lines, the hero with its description, the links), with no notice (the holder has just added the card).
export function firstSavePatch(d: PassData, cfg: WalletConfig): Record<string, unknown> {
  return objectPatch({ ...d, notify: false }, cfg);
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
