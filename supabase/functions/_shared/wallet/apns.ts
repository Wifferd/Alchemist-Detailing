// The push that tells an iPhone its pass changed (plan 4.4). Apple: an HTTP/2 POST to
// https://api.push.apple.com/3/device/<push token>, apns-topic = the Pass Type ID, body {}. Production APNs only.
//
// Three modes (APNS_MODE): "dry-run" (default; Phase A: nothing is sent, the run logs what it would send), "cert"
// (route 2: the Pass Type ID certificate and key from Vault as a TLS client certificate, Deno.createHttpClient) and
// "token" (route 1: an ES256 provider token from an optional .p8 key, APNS_KEY_P8 and APNS_KEY_ID, made once per worker
// and reused for 40 minutes; Apple: refresh no more than once every 20 and no less than once every 60 minutes).
// UNPROVEN until Phase C: that either route delivers a pass push from hosted Supabase. The relay (route 3) isn't built.
//
// Push type: Apple ties alert and background to an app's bundle ID, and a pass topic is neither, so unless
// APNS_PUSH_TYPE pins one we try alert/10, then background/5, then no apns-push-type header, and log the one that
// delivered ("apns_push_type_delivered") so it can be pinned and recorded in doc 53.
//
// Answers: 200 sent. 410 Unregistered or ExpiredToken: the registration is gone (the only answers that remove one).
// 400 BadDeviceToken, 400 DeviceTokenNotForTopic, any 403, 429 TooManyProviderTokenUpdates and other 4xx: a setup
// problem, the run stops and touches no registration. 429 TooManyRequests, 5xx and network errors: retry later.
import type { WalletConfig } from "./config.ts";
import { apnsCertPems } from "./certs.ts";
import { b64url, enc, log, pemToDer, toBuf } from "./util.ts";

export type PushOutcome = "sent" | "gone" | "setup" | "retry" | "dry-run";
export interface PushResult {
  outcome: PushOutcome;
  status: number;
  reason?: string;
  pushType?: string;
}

const SEQUENCE: { type: string | null; priority: string | null }[] = [
  { type: "alert", priority: "10" },
  { type: "background", priority: "5" },
  { type: null, priority: null },
];

let learned: { type: string | null; priority: string | null } | null = null;
let jwtCache: { jwt: string; at: number } | null = null;
let clientCache: { id: string; client: Deno.HttpClient } | null = null;

async function providerToken(cfg: WalletConfig): Promise<string | null> {
  if (jwtCache && Date.now() - jwtCache.at < 40 * 60 * 1000) return jwtCache.jwt;
  const p8 = Deno.env.get("APNS_KEY_P8"), kid = Deno.env.get("APNS_KEY_ID");
  if (!p8 || !kid || !cfg.teamId) return null;
  const key = await crypto.subtle.importKey("pkcs8", toBuf(pemToDer(p8, "PRIVATE KEY")),
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64url(JSON.stringify({ alg: "ES256", kid }));
  const claims = b64url(JSON.stringify({ iss: cfg.teamId, iat: Math.floor(Date.now() / 1000) }));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${claims}`)));
  jwtCache = { jwt: `${head}.${claims}.${b64url(sig)}`, at: Date.now() };
  return jwtCache.jwt;
}

async function certClient(): Promise<Deno.HttpClient | null> {
  const pems = await apnsCertPems();
  if (!pems) return null;
  const id = pems.cert.slice(-120);
  if (clientCache && clientCache.id === id) return clientCache.client;
  // deno-lint-ignore no-explicit-any
  const client = (Deno as any).createHttpClient({ cert: pems.cert, key: pems.key, http1: false, http2: true }) as Deno.HttpClient;
  clientCache = { id, client };
  return client;
}

function classify(status: number, reason: string | undefined): PushOutcome {
  if (status === 200) return "sent";
  if (status === 410 && (reason === "Unregistered" || reason === "ExpiredToken")) return "gone";
  if (status === 429 && reason === "TooManyProviderTokenUpdates") return "setup";
  if (status === 429 || status >= 500) return "retry";
  return "setup";
}

async function sendOne(token: string, cfg: WalletConfig, auth: { client?: Deno.HttpClient; jwt?: string },
  t: { type: string | null; priority: string | null }): Promise<PushResult> {
  const headers: Record<string, string> = { "apns-topic": cfg.passTypeId ?? "", "content-type": "application/json" };
  if (t.type) headers["apns-push-type"] = t.type;
  if (t.priority) headers["apns-priority"] = t.priority;
  if (auth.jwt) headers.authorization = "bearer " + auth.jwt;
  try {
    const init: RequestInit & { client?: Deno.HttpClient } = { method: "POST", headers, body: "{}", signal: AbortSignal.timeout(15000) };
    if (auth.client) init.client = auth.client;
    const r = await fetch(`https://${cfg.apnsHost}/3/device/${token}`, init);
    let reason: string | undefined;
    const text = await r.text();
    try {
      reason = text ? JSON.parse(text).reason : undefined;
    } catch { /* no body */ }
    return { outcome: classify(r.status, reason), status: r.status, reason, pushType: t.type ?? "none" };
  } catch (e) {
    return { outcome: "retry", status: 0, reason: String(e).slice(0, 120), pushType: t.type ?? "none" };
  }
}

// Pushes to each token; stops at the first setup problem. Returns one result per token tried.
export async function pushAll(tokens: string[], cfg: WalletConfig): Promise<{ mode: string; results: PushResult[] }> {
  if (cfg.apnsMode === "dry-run") {
    log("apns_dry_run", { would_push: tokens.length, topic: cfg.passTypeId, host: cfg.apnsHost });
    return { mode: "dry-run", results: tokens.map(() => ({ outcome: "dry-run" as const, status: 0 })) };
  }
  if (!cfg.passTypeId) return { mode: cfg.apnsMode, results: [{ outcome: "setup", status: 0, reason: "NoPassTypeId" }] };
  const auth: { client?: Deno.HttpClient; jwt?: string } = {};
  if (cfg.apnsMode === "cert") {
    const client = await certClient().catch(() => null);
    if (!client) return { mode: "cert", results: [{ outcome: "setup", status: 0, reason: "NoCertificate" }] };
    auth.client = client;
  } else {
    const jwt = await providerToken(cfg).catch(() => null);
    if (!jwt) return { mode: "token", results: [{ outcome: "setup", status: 0, reason: "NoProviderKey" }] };
    auth.jwt = jwt;
  }
  const pinned = cfg.apnsPushType
    ? [{ type: cfg.apnsPushType === "none" ? null : cfg.apnsPushType, priority: cfg.apnsPushType === "background" ? "5" : cfg.apnsPushType === "alert" ? "10" : null }]
    : null;
  const results: PushResult[] = [];
  for (const token of tokens) {
    const order = pinned ?? (learned ? [learned] : SEQUENCE);
    let res: PushResult = { outcome: "retry", status: 0 };
    for (const t of order) {
      res = await sendOne(token, cfg, auth, t);
      if (res.outcome === "sent" && !pinned && !learned) {
        learned = t;
        log("apns_push_type_delivered", { push_type: t.type ?? "none", mode: cfg.apnsMode });
      }
      if (!(res.status === 400 && res.reason === "InvalidPushType")) break;
    }
    results.push(res);
    if (res.outcome === "setup") break;
  }
  return { mode: cfg.apnsMode, results };
}
