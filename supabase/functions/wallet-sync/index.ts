// Alchemist Detailing: the wallet wash card's background work (Migration 009, plan 4.1 and 4.4 to 4.7). Called only by
// the database: the trigger on wallet_cards and the schedules (pg_net and pg_cron, part 5) and office.wallet_setup in
// the SQL Editor. Deployed with verify_jwt off; every call must carry x-wallet-secret, which is compared (constant time)
// with the Vault entry wallet_sync_secret, a value made inside the database that nobody reads.
//
//   POST /wallet-sync/sync {card}   a card changed: push its iPhones, update its Google object
//   POST /wallet-sync/sweep         every 10 minutes when something lags: redo what is behind
//   POST /wallet-sync/reminders     daily: the reminders that are due (none while wallet_reminders_on is false)
//   POST /wallet-sync/apple-csr     make the Pass Type ID key here, keep it in Vault, answer the CSR (public)
//   POST /wallet-sync/apple-cert {pem}   check the certificate Apple issued and install it
//   POST /wallet-sync/google-setup  insert or update the Google class (dry run in Phase A)
//   POST /wallet-sync/tidy          blank old push codes (also a weekly schedule)
//
// Phase A: pushes and Google calls are dry runs (APNS_MODE, GOOGLE_MODE; config.ts). A dry run counts as sent, so the
// card stops being pending and the whole pipeline can be checked without Apple or Google accounts.
import { config } from "../_shared/wallet/config.ts";
import { DbError, rpc } from "../_shared/wallet/db.ts";
import { vaultGet, vaultPut } from "../_shared/wallet/vault.ts";
import { pushAll } from "../_shared/wallet/apns.ts";
import { CertError, checkNewCert, newKeyAndCsr } from "../_shared/wallet/certs.ts";
import type { PassData } from "../_shared/wallet/pass.ts";
import { addReminderMessage, googleCall, loyaltyClass, objectPatch, pointsText } from "../_shared/wallet/google.ts";
import { dec, json, log, readBody, sameText } from "../_shared/wallet/util.ts";

// wallet_sync_card (part 5): the card as the pass and the Google object show it, without its tokens.
interface SyncCard extends Omit<PassData, "add_token" | "apple_token" | "platform"> {
  apple_on: boolean;
  google_on: boolean;
  apple_pending: boolean;
  google_pending: boolean;
}

let lastFreshRead = 0;

async function authorised(req: Request): Promise<"ok" | "denied" | "not_set_up"> {
  const given = req.headers.get("x-wallet-secret") ?? "";
  let secret = await vaultGet("wallet_sync_secret");
  if (!secret) return "not_set_up";
  if (given && sameText(given, secret)) return "ok";
  // The secret may have been changed since it was cached: read it again, at most once a minute, so wrong secrets
  // can't make every request a database read.
  if (!given || Date.now() - lastFreshRead < 60_000) return "denied";
  lastFreshRead = Date.now();
  secret = await vaultGet("wallet_sync_secret", true);
  return secret && sameText(given, secret) ? "ok" : "denied";
}

async function problem(platform: string, code: string, detail: string): Promise<void> {
  try {
    await rpc("wallet_problem", { p_platform: platform, p_code: code, p_detail: detail.slice(0, 300) });
  } catch { /* logged below */ }
  log("wallet_problem", { platform, code, detail });
}

async function synced(d: SyncCard, platform: "apple" | "google"): Promise<void> {
  await rpc("wallet_synced", { p_card: d.card_id, p_platform: platform, p_changed_at: d.changed_at });
}

async function syncApple(d: SyncCard): Promise<string> {
  const cfg = config();
  if (!d.apple_on) {
    await synced(d, "apple");
    return "Apple is off here: nothing sent";
  }
  const tokens = await rpc<string[]>("wallet_apple_targets", { p_card: d.card_id }) ?? [];
  if (tokens.length === 0) {
    await synced(d, "apple");
    return "no iPhone has it";
  }
  const { mode, results } = await pushAll(tokens, cfg);
  let sent = 0, gone = 0, retry = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.outcome === "sent" || r.outcome === "dry-run") sent++;
    else if (r.outcome === "gone") {
      gone++;
      await rpc("wallet_apple_gone", { p_push: tokens[i] });
    } else if (r.outcome === "retry") retry++;
    else if (r.outcome === "setup") {
      await problem("apple", `apns_${r.reason ?? r.status}`.slice(0, 80),
        `APNs (${mode}) answered ${r.status} ${r.reason ?? ""} for card ${d.code}; the run stopped, no registration changed.`);
      return `stopped: APNs ${r.status} ${r.reason ?? ""}`.trim();
    }
  }
  if (retry > 0) return `${retry} to retry (left pending)`;
  await synced(d, "apple");
  return mode === "dry-run" ? `dry run: would push to ${sent} iPhone(s)` : `pushed ${sent}, gone ${gone}`;
}

async function syncGoogle(d: SyncCard): Promise<string> {
  const cfg = config();
  if (!d.google_on || !d.google_object_id) {
    await synced(d, "google");
    return d.google_on ? "not at Google" : "Google is off here: nothing sent";
  }
  const patch = objectPatch({ ...d, add_token: "", apple_token: "", platform: "google" } as PassData, cfg);
  const reminder = d.last_change === "reminder" && d.notify && d.reminder_text ? d.reminder_text : null;
  if (cfg.googleMode !== "live") {
    log("google_dry_run", { code: d.code, would: "PATCH loyaltyObject", points: pointsText(d),
      notify: patch.notifyPreference ?? "none", message: reminder ? "addMessage TEXT_AND_NOTIFY" : "none" });
    await synced(d, "google");
    return `dry run: would update the object to ${pointsText(d)}` + (reminder ? " and add the reminder" : "");
  }
  const id = d.google_object_id;
  const r = await googleCall(cfg, "PATCH", `loyaltyObject/${encodeURIComponent(id)}`, patch);
  if (r.status === 404) {
    await synced(d, "google");
    return "not saved at Google yet";
  }
  if (r.status === 429 || r.status >= 500) return `Google ${r.status}: left pending`;
  if (r.status !== 200) {
    await problem("google", `patch_${r.status}`, `Google answered ${r.status} updating card ${d.code}.`);
    return `stopped: Google ${r.status}`;
  }
  if (!d.google_saved) await rpc("wallet_google_saved", { p_code: d.code, p_saved: true });
  if (reminder) {
    const m = await addReminderMessage(cfg, id, reminder);
    if (m !== 200) await problem("google", `message_${m}`, `Google answered ${m} to a reminder for card ${d.code}.`);
  }
  await synced(d, "google");
  return "updated";
}

async function syncCard(cardId: string): Promise<Record<string, unknown>> {
  const d = await rpc<SyncCard | null>("wallet_sync_card", { p_card: cardId });
  if (!d) return { card: cardId, result: "no such card" };
  const out: Record<string, unknown> = { code: d.code, changed_at: d.changed_at, last_change: d.last_change };
  out.apple = d.apple_pending ? await syncApple(d) : "up to date";
  out.google = d.google_pending ? await syncGoogle(d) : "up to date";
  log("wallet_sync", out);
  return out;
}

interface Pending {
  card_id: string;
  code: string;
  apple: boolean;
  google: boolean;
  google_check: boolean;
  google_object_id: string | null;
}

async function sweep(): Promise<Record<string, unknown>> {
  const cfg = config();
  const pending = await rpc<Pending[]>("wallet_pending", { p_limit: 50 }) ?? [];
  const results: Record<string, unknown>[] = [];
  let checked = 0;
  for (const p of pending) {
    if (p.google_check && p.google_object_id && cfg.googleMode === "live") {
      const g = await googleCall(cfg, "GET", `loyaltyObject/${encodeURIComponent(p.google_object_id)}`);
      if (g.status === 200) await rpc("wallet_google_saved", { p_code: p.code, p_saved: true });
      checked++;
    }
    if (p.apple || p.google) results.push(await syncCard(p.card_id));
  }
  const out = { pending: pending.length, synced: results.length, google_checked: checked, results };
  log("wallet_sweep", { pending: pending.length, synced: results.length, google_checked: checked });
  return out;
}

interface Due {
  card_id: string;
  code: string;
  kind: string;
  text: string;
  apple_devices: number;
  google: boolean;
}

async function reminders(): Promise<Record<string, unknown>> {
  const due = await rpc<Due[]>("wallet_due_reminders", {}) ?? [];
  let sent = 0;
  const skipped: string[] = [];
  for (const r of due) {
    try {
      // Marks the card (its pass carries the text, changed_at moves); the trigger then calls /sync, which pushes.
      await rpc("wallet_reminded", { p_card: r.card_id, p_kind: r.kind, p_text: r.text, p_apple: r.apple_devices,
        p_google: r.google });
      sent++;
    } catch (e) {
      skipped.push(`${r.code}: ${e instanceof DbError ? e.code : "error"}`);
    }
  }
  log("wallet_reminders", { due: due.length, sent, skipped: skipped.length });
  return { due: due.length, sent, skipped };
}

async function appleCsr(): Promise<Response> {
  const { keyPem, csrPem } = await newKeyAndCsr();
  await vaultPut("wallet_apple_key_next", keyPem);   // the key goes nowhere else: not returned, not logged
  log("apple_csr_made", { key: "kept in Vault as wallet_apple_key_next" });
  return new Response(csrPem, { status: 200, headers: { "content-type": "text/plain", "cache-control": "no-store" } });
}

async function appleCert(body: Record<string, unknown>): Promise<Response> {
  const cfg = config();
  const pem = String(body.pem ?? "");
  const keyNext = await vaultGet("wallet_apple_key_next", true);
  if (!keyNext) return json(409, { error: "no_request", detail: "Make a certificate request first (apple-csr)." });
  try {
    const facts = await checkNewCert(pem, keyNext, cfg);
    await vaultPut("wallet_apple_key", keyNext);
    await vaultPut("wallet_apple_cert", pem.trim() + "\n");
    const expires = facts.notAfter.toISOString().slice(0, 10);
    const moved = await rpc<number>("wallet_cert_installed", { p_expires: expires });
    log("apple_cert_installed", { pass_type: facts.uid, team: facts.ou, expires, cards_moved: moved });
    return json(200, { installed: true, pass_type: facts.uid, team: facts.ou, issuer: facts.issuerCn, expires,
      cards_moved: moved });
  } catch (e) {
    if (e instanceof CertError) {
      log("apple_cert_refused", { code: e.code, detail: e.message });
      return json(422, { installed: false, error: e.code, detail: e.message });
    }
    throw e;
  }
}

async function googleSetup(): Promise<Response> {
  const cfg = config();
  let name = "Wash card", phone: string | null = null, area: string | null = null;
  try {
    const s = await rpc<Record<string, unknown>>("get_public_settings", {});
    name = String(s?.wallet_card_name ?? name);
    phone = s?.public_phone ? String(s.public_phone) : null;
    area = s?.public_area ? String(s.public_area) : null;
  } catch { /* defaults */ }
  const cls = loyaltyClass(cfg, name, phone, area);
  if (cfg.googleMode !== "live") {
    log("google_dry_run", { would: "insert or update the loyalty class", class_id: cls.id });
    return json(200, { dry_run: true, would: "insert or update the loyalty class", class: cls });
  }
  const id = String(cls.id);
  const got = await googleCall(cfg, "GET", `loyaltyClass/${encodeURIComponent(id)}`);
  const r = got.status === 404
    ? await googleCall(cfg, "POST", "loyaltyClass", cls)
    : await googleCall(cfg, "PATCH", `loyaltyClass/${encodeURIComponent(id)}`, cls);
  return json(r.status === 200 ? 200 : 502, { class_id: id, google_status: r.status });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const step = url.pathname.replace(/^\/functions\/v1/, "").replace(/^\/wallet-sync(?=\/|$)/, "").replace(/^\/+|\/+$/g, "");
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  try {
    const auth = await authorised(req);
    if (auth === "not_set_up") return json(503, { error: "not_set_up", detail: "No wallet_sync_secret in Vault." });
    if (auth !== "ok") return json(401, { error: "not_allowed" });
    const raw = await readBody(req, 65536);
    if (raw === null) return json(413, { error: "too_large" });
    let body: Record<string, unknown> = {};
    try {
      body = raw.length ? JSON.parse(dec.decode(raw)) : {};
    } catch {
      return json(400, { error: "invalid_input", detail: "The body must be JSON." });
    }
    switch (step) {
      case "sync": {
        const card = String(body.card ?? "");
        if (!/^[0-9a-f-]{36}$/.test(card)) return json(400, { error: "invalid_input", detail: "card: a card id." });
        return json(200, await syncCard(card));
      }
      case "sweep":
        return json(200, await sweep());
      case "reminders":
        return json(200, await reminders());
      case "apple-csr":
        return await appleCsr();
      case "apple-cert":
        return await appleCert(body);
      case "google-setup":
        return await googleSetup();
      case "tidy": {
        const n = await rpc<number>("wallet_blank_old_push_tokens", {});
        log("wallet_tidy", { blanked: n });
        return json(200, { blanked: n });
      }
      default:
        return json(404, { error: "not_found" });
    }
  } catch (e) {
    if (e instanceof DbError) {
      log("db_error", { step, status: e.status, code: e.code, detail: e.detail });
      return json(500, { error: e.code, detail: e.detail });
    }
    log("error", { step, message: String((e as Error)?.message ?? e).slice(0, 300) });
    return json(500, { error: "server_error" });
  }
});
