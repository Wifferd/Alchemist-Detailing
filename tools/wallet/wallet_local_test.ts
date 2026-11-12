// deno-lint-ignore-file no-explicit-any
// Local checks of the wallet functions' shared code (Deno 2.1.4, the Supabase Edge Runtime's Deno), no network.
// (The checks read pass.json and the Google object as loose JSON, hence the lint exception above.)
//
//   WALLET_TEST_SECRETS=<folder with ca.pem, ca.key, local-pass.key, local-pass.pem> WALLET_TEST_OUT=<folder> \
//     deno test --allow-env --allow-read --allow-write --allow-run=openssl tools/wallet/wallet_local_test.ts
//
// The secrets folder is the Phase A throwaway CA (outside every repository). Writes sample passes to WALLET_TEST_OUT
// for tools/wallet/check_pkpass.sh. Never prints a key.
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1.0.8";

Deno.env.set("SUPABASE_URL", "https://wlmostaetntbpmfgyjst.supabase.co");   // the TEST project's settings (config.ts)

const { config } = await import("../../supabase/functions/_shared/wallet/config.ts");
const { passJson } = await import("../../supabase/functions/_shared/wallet/pass.ts");
const { standIn } = await import("../../supabase/functions/_shared/wallet/art.ts");
const { buildPkpass, importSigningKey, parseCert } = await import("../../supabase/functions/_shared/wallet/sign.ts");
const { checkNewCert, CertError, newKeyAndCsr, issuerOf } = await import("../../supabase/functions/_shared/wallet/certs.ts");
const { loyaltyObject, saveToken, signer, SAVE_URL, SAVE_LINK_LIMIT, objectPatch } =
  await import("../../supabase/functions/_shared/wallet/google.ts");
const { redact } = await import("../../supabase/functions/_shared/wallet/util.ts");

const SECRETS = Deno.env.get("WALLET_TEST_SECRETS") ?? "";
const OUT = Deno.env.get("WALLET_TEST_OUT") ?? "";

function card(stamps: number, extra: Record<string, unknown> = {}) {
  return {
    card_id: "00000000-0000-4000-8000-00000000c001",
    code: "K7Q2M9XD",
    code_words: "K7Q2 M9XD",
    platform: "apple" as const,
    card_name: "Wash card",
    stamps,
    slots: 10,
    count_words: stamps <= 10 ? `${stamps} of 10` : `${stamps} washes`,
    member: stamps >= 10,
    member_since: stamps >= 10 ? "2026-11-12T16:00:00Z" : null,
    last_wash_day: stamps > 0 ? "2026-11-12" : null,
    last_change: stamps >= 10 ? "member" : stamps > 0 ? "stamp" : "new",
    notify: stamps > 0,
    reminder_text: null,
    voided: false,
    changed_at: "2026-11-12T16:00:00.123Z",
    changed_at_ms: 1794499200123,
    add_token: "ABCDEFGHJKLMNPQRSTUVWXYZ23",
    apple_token: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
    google_object_id: null,
    google_saved: false,
    issuer: { area: "Parker, Texas", phone: "(945) 361-7551", address: "TEST mailbox, not real", email: "wallet-test@example.com" },
    site_url: null,
    ...extra,
  };
}

async function openssl(args: string[], stdin?: string): Promise<string> {
  const cmd = new Deno.Command("openssl", { args, stdin: stdin ? "piped" : "null", stdout: "piped", stderr: "piped" });
  const p = cmd.spawn();
  if (stdin) {
    const w = p.stdin.getWriter();
    await w.write(new TextEncoder().encode(stdin));
    await w.close();
  }
  const o = await p.output();
  if (!o.success) throw new Error("openssl " + args[0] + " failed: " + new TextDecoder().decode(o.stderr).slice(0, 200));
  return new TextDecoder().decode(o.stdout);
}

Deno.test("config: the TEST project gets the Phase A test settings", () => {
  const cfg = config();
  assertEquals(cfg.label, "test");
  assertEquals(cfg.passTypeId, "pass.test.invalid.card");
  assertEquals(cfg.apnsMode, "dry-run");
  assertEquals(cfg.googleMode, "dry-run");
  assert(cfg.trustTestCa);
});

Deno.test("pass.json: fields, change messages and the house rules", () => {
  const cfg = config();
  const p = passJson(card(3), cfg) as Record<string, any>;
  assertEquals(p.serialNumber, "K7Q2M9XD");
  assertEquals(p.webServiceURL, "https://wlmostaetntbpmfgyjst.supabase.co/functions/v1/wallet/apple");
  assertEquals(p.storeCard.secondaryFields[0].value, "3 of 10");
  assertEquals(p.storeCard.secondaryFields[0].changeMessage, "Wash stamped: %@");
  assertEquals(p.storeCard.secondaryFields[1].changeMessage, undefined);
  assertEquals(p.barcodes[0].message, "https://alchemist-detailing-test.vercel.app/#admin-cards-K7Q2M9XD");
  assertEquals(p.organizationName, "Alchemist Detailing (test)");
  const m = passJson(card(10), cfg) as Record<string, any>;
  assertEquals(m.storeCard.secondaryFields[1].value, "Loyalty member");
  assertEquals(m.storeCard.secondaryFields[1].changeMessage, "%@");
  assertEquals(m.storeCard.secondaryFields[0].changeMessage, undefined, "one message at a time: the 10th stamp messages status only");
  assertEquals(m.backgroundColor, "rgb(218, 156, 48)");
  const quiet = passJson(card(4, { notify: false }), cfg) as Record<string, any>;
  assertEquals(quiet.storeCard.secondaryFields[0].changeMessage, undefined);
  const back = passJson(card(4, { last_change: "unstamp", notify: false }), cfg) as Record<string, any>;
  assert(!JSON.stringify(back).includes("changeMessage"), "a take-back notifies nobody");
  const text = JSON.stringify(m).toLowerCase();
  for (const w of ["free", "reward", "discount", "perk", "text us"]) assert(!text.includes(w), w);
  const v = passJson(card(2, { voided: true }), cfg) as Record<string, any>;
  assertEquals(v.voided, true);
});

Deno.test("sign and pack: sample passes at 0, 3, 10 and 12 for check_pkpass.sh", async () => {
  if (!SECRETS || !OUT) return;
  const cfg = config();
  const key = await importSigningKey(await Deno.readTextFile(`${SECRETS}/local-pass.key`));
  const cert = parseCert(await Deno.readTextFile(`${SECRETS}/local-pass.pem`));
  const ca = await issuerOf(cert, cfg);
  assert(ca, "the test CA is trusted on the TEST project");
  for (const n of [0, 3, 10, 12]) {
    const d = card(n);
    const t0 = performance.now();
    const art = standIn({ stamps: d.stamps, slots: d.slots, member: d.member, test: true });
    const bytes = await buildPkpass(passJson(d, cfg), art, { key, cert, chain: [ca!] });
    const ms = performance.now() - t0;
    await Deno.writeFile(`${OUT}/local-${n}.pkpass`, bytes);
    console.log(`local-${n}.pkpass: ${bytes.length} bytes, ${ms.toFixed(0)} ms (art drawn + signed)`);
  }
});

Deno.test("key in Supabase: a new key and CSR; the issued certificate is accepted, others refused", async () => {
  if (!SECRETS) return;
  const cfg = config();
  const t0 = performance.now();
  const { keyPem, csrPem } = await newKeyAndCsr();
  console.log(`RSA 2048 key + CSR in ${(performance.now() - t0).toFixed(0)} ms`);
  assert(keyPem.startsWith("-----BEGIN PRIVATE KEY-----"));
  assert(csrPem.startsWith("-----BEGIN CERTIFICATE REQUEST-----"));
  const tmp = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(`${tmp}/req.csr`, csrPem);
    const subj = await openssl(["req", "-in", `${tmp}/req.csr`, "-noout", "-verify", "-subject"]);
    assert(subj.includes("subject=C = US, CN = Alchemist Detailing pass"), subj);
    const issue = async (subj: string, file: string) => {
      await openssl(["x509", "-req", "-in", `${tmp}/req.csr`, "-CA", `${SECRETS}/ca.pem`, "-CAkey", `${SECRETS}/ca.key`,
        "-set_serial", String(Date.now()), "-days", "30", "-sha256", "-subj", subj, "-out", `${tmp}/${file}`]);
      return await Deno.readTextFile(`${tmp}/${file}`);
    };
    const good = await issue("/UID=pass.test.invalid.card/CN=Pass Type ID: pass.test.invalid.card/OU=PHASEATEST/O=Alchemist Detailing (test)/C=US", "good.pem");
    const facts = await checkNewCert(good, keyPem, cfg);
    assertEquals(facts.uid, "pass.test.invalid.card");
    const wrongType = await issue("/UID=pass.other.card/CN=x/OU=PHASEATEST/C=US", "type.pem");
    await assertRejects(() => checkNewCert(wrongType, keyPem, cfg), CertError, "pass.other.card");
    const wrongTeam = await issue("/UID=pass.test.invalid.card/CN=x/OU=OTHERTEAM1/C=US", "team.pem");
    await assertRejects(() => checkNewCert(wrongTeam, keyPem, cfg), CertError, "team");
    const otherKeyCert = await Deno.readTextFile(`${SECRETS}/local-pass.pem`);   // issued for a different key
    await assertRejects(() => checkNewCert(otherKeyCert, keyPem, cfg), CertError, "key differs");
    // a certificate from an untrusted issuer (self-signed with the same key)
    await Deno.writeTextFile(`${tmp}/k.pem`, keyPem);
    const self = await openssl(["req", "-x509", "-key", `${tmp}/k.pem`, "-subj",
      "/UID=pass.test.invalid.card/CN=x/OU=PHASEATEST/C=US", "-days", "2"]);
    await assertRejects(() => checkNewCert(self, keyPem, cfg), CertError, "isn't trusted");
    await assertRejects(() => checkNewCert("not a cert", keyPem, cfg), CertError, "PEM");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("Google: the save link stays under 1,750 characters; dry-run signer; the PATCH", async () => {
  const cfg = config();
  const s = await signer(cfg);
  assert(s.dryRun);
  for (const n of [3, 10]) {
    const obj = loyaltyObject({ ...card(n), platform: "google" }, cfg);
    const jwt = await saveToken(obj, cfg, s);
    const len = SAVE_URL.length + jwt.length;
    console.log(`save link at ${n}: ${len} characters`);
    assert(len <= SAVE_LINK_LIMIT, `save link ${len}`);
  }
  const m = loyaltyObject({ ...card(10), platform: "google" }, cfg) as Record<string, any>;
  assertEquals(m.secondaryLoyaltyPoints.balance.string, "Member");
  assertEquals(m.loyaltyPoints.balance.string, "10 / 10");
  assertEquals((loyaltyObject({ ...card(12), platform: "google" }, cfg) as any).loyaltyPoints.balance.string, "12");
  assertEquals(objectPatch({ ...card(4), platform: "google" }, cfg).notifyPreference, "NOTIFY_ON_UPDATE");
  assertEquals(objectPatch({ ...card(4, { last_change: "unstamp", notify: false }), platform: "google" }, cfg).notifyPreference, undefined);
});

Deno.test("art: make_wallet_art.py's folder names; the stand-in draws the AD mark in the slots", async () => {
  const { artFolder } = await import("../../supabase/functions/_shared/wallet/art.ts");
  assertEquals(artFolder({ stamps: 3, slots: 10, member: false, test: false }), "3");
  assertEquals(artFolder({ stamps: 3, slots: 10, member: false, test: true }), "test-3");
  assertEquals(artFolder({ stamps: 12, slots: 10, member: true, test: false }), "10", "past 10 the card keeps the gold pictures");
  assertEquals(artFolder({ stamps: 0, slots: 10, member: false, test: true }), "test-0");
  // A filled slot holds the mark: inside the first slot's ring (centre 55.5, 41 pt at @1x; ring radius 24) the strip
  // at 1 stamp has gold pixels and at 0 none.
  const { decompressSync } = await import("npm:fflate@0.8.2");
  const goldIn = (png: Uint8Array) => {
    const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const w = dv.getUint32(16);
    const parts: number[] = [];
    for (let at = 8; at < png.length;) {
      const len = dv.getUint32(at), type = new TextDecoder().decode(png.subarray(at + 4, at + 8));
      if (type === "IDAT") parts.push(...png.subarray(at + 8, at + 8 + len));
      at += 12 + len;
    }
    const raw = decompressSync(new Uint8Array(parts));
    let n = 0;
    for (let y = 27; y <= 55; y++) {
      for (let x = 41; x <= 70; x++) {
        const i = y * (w * 4 + 1) + 1 + x * 4;
        if (raw[i] > 200 && raw[i + 1] > 150 && raw[i + 2] < 120) n++;
      }
    }
    return n;
  };
  const empty = standIn({ stamps: 0, slots: 10, member: false, test: false })["strip.png"];
  const one = standIn({ stamps: 1, slots: 10, member: false, test: false })["strip.png"];
  assertEquals(goldIn(empty), 0, "an empty slot is only a ring");
  assert(goldIn(one) > 60, `gold pixels of the mark in a filled slot: ${goldIn(one)}`);
  const obj = loyaltyObject({ ...card(3), platform: "google" }, config()) as Record<string, any>;
  assertEquals(obj.heroImage, undefined, "no hero picture until the art's fingerprints are compiled in");
});

Deno.test("logs: tokens, push codes, JWTs and PEM blocks are redacted", () => {
  const t = redact(JSON.stringify({ a: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", b: "a".repeat(10) + "0123456789abcdef0123456789abcdef01",
    c: "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----", d: "eyJhbGciOiJSUzI1NiJ9xxxxxxxx.eyJpc3MiOiJ4In0xxxxxxxxx.c2lnbmF0dXJl" }));
  assert(!t.includes("ABCDEFGHJKLMNPQRSTUVWXYZ"), t);
  assert(!t.includes("0123456789abcdef0123456789abcdef"), t);
  assert(!t.includes("PRIVATE KEY"), t);
  assert(!t.includes("eyJhbGciOiJSUzI1NiJ9"), t);
});
