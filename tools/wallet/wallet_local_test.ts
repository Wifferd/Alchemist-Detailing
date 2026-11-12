// deno-lint-ignore-file no-explicit-any
// Local checks of the wallet functions' shared code (Deno 2.1.4, the Supabase Edge Runtime's Deno), no network.
// (The checks read pass.json and the Google object as loose JSON, hence the lint exception above.)
//
//   WALLET_TEST_SECRETS=<folder with ca.pem, ca.key, local-pass.key, local-pass.pem> WALLET_TEST_OUT=<folder> \
//   WALLET_TEST_ART_MANIFEST=<site/img/wallet/art-manifest.json> \
//     deno test --allow-env --allow-read --allow-write --allow-run=openssl tools/wallet/wallet_local_test.ts
//
// The secrets folder is the Phase A throwaway CA (outside every repository). Writes sample passes to WALLET_TEST_OUT
// for tools/wallet/check_pkpass.sh. Never prints a key. WALLET_TEST_ART_MANIFEST (optional): the site's art manifest
// (tools/wallet/make_wallet_art.py), so the Google checks measure the links with its real hero pictures; without it
// they use every hero name make_wallet_art.py writes (the link's length depends only on the names).
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1.0.8";

Deno.env.set("SUPABASE_URL", "https://wlmostaetntbpmfgyjst.supabase.co");   // the TEST project's settings (config.ts)

const { config } = await import("../../supabase/functions/_shared/wallet/config.ts");
const { passJson } = await import("../../supabase/functions/_shared/wallet/pass.ts");
const { standIn } = await import("../../supabase/functions/_shared/wallet/art.ts");
const { buildPkpass, importSigningKey, parseCert } = await import("../../supabase/functions/_shared/wallet/sign.ts");
const { checkNewCert, CertError, newKeyAndCsr, issuerOf } = await import("../../supabase/functions/_shared/wallet/certs.ts");
const { loyaltyObject, saveLink, saveObject, signer, SAVE_LINK_LIMIT, objectPatch, firstSavePatch } =
  await import("../../supabase/functions/_shared/wallet/google.ts");
const { default: artManifest } = await import("../../supabase/functions/_shared/wallet/art-manifest.ts");
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

// The JSON inside a JWT's middle part.
function jwtPayload(link: string): any {
  const b = link.split("/").pop()!.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b + "=".repeat((4 - b.length % 4) % 4)), (c) => c.charCodeAt(0))));
}

// The manifest the Google checks run with: the site's (WALLET_TEST_ART_MANIFEST) or every hero name make_wallet_art.py
// writes, put into the compiled-in manifest for the length of a test and taken out again.
async function withHeroes<T>(fn: () => Promise<T>): Promise<T> {
  const before = { ...artManifest.files };
  const path = Deno.env.get("WALLET_TEST_ART_MANIFEST");
  const files: Record<string, string> = path ? JSON.parse(await Deno.readTextFile(path)).files : Object.fromEntries(
    [...Array(11).keys()].flatMap((n) => [`google/hero-${n}-v1.png`, `google/hero-test-${n}-v1.png`])
      .concat("google/logo-v1.png").map((k) => [k, "0".repeat(40)]));
  for (const k of [...Array(11).keys()].map((n) => `google/hero-test-${n}-v1.png`)) assert(files[k], `manifest has ${k}`);
  Object.assign(artManifest.files, files);
  try {
    return await fn();
  } finally {
    for (const k of Object.keys(artManifest.files)) if (!(k in before)) Reflect.deleteProperty(artManifest.files, k);
    Object.assign(artManifest.files, before);
  }
}

Deno.test("Google: save links stay under 1,750 characters with the hero pictures, at 0, 3, 9, 10 and 12 washes", async () => {
  await withHeroes(async () => {
    const cfg = config();
    const s = await signer(cfg);
    assert(s.dryRun);
    // live-like: the live site's address, a 19-digit issuer and a long service-account address (Phase B's are unknown)
    const live = { ...cfg, label: "" as const, siteUrl: "https://thealchemistdetailing.com",
      artUrl: "https://thealchemistdetailing.com/img/wallet", googleIssuerId: "3388000000022999999",
      googleClassCard: "alchemist_card_v1" };
    const sLive = { ...s, email: "alchemist-wallet-signer@alchemist-detailing-wallet-live.iam.gserviceaccount.com" };
    const runs: [string, typeof cfg, typeof s][] = [["test", cfg, s], ["live-like", live, sLive]];
    for (const [name, c, sg] of runs) {
      for (const n of [0, 3, 9, 10, 12]) {
        const full = loyaltyObject({ ...card(n), platform: "google" }, c) as Record<string, any>;
        assert(full.heroImage?.sourceUri?.uri, `${name} ${n}: the hero picture is in the object`);
        const sl = await saveLink(full, c, sg);
        console.log(`${name} save link at ${n}: ${sl.length} characters` + (sl.trimmed.length ? ` (trimmed ${sl.trimmed})` : ""));
        assert(sl.link !== null && sl.length <= SAVE_LINK_LIMIT, `${name} save link at ${n}: ${sl.length}`);
        assertEquals(sl.link!.length, sl.length);
        assertEquals(sl.trimmed, [], `${name} ${n}: nothing trimmed beyond the lean object`);
        const o = jwtPayload(sl.link!).payload.loyaltyObjects[0];
        assertEquals(o.secondaryLoyaltyPoints, undefined, "no member lines in the link");
        assertEquals(o.textModulesData, undefined);
        assertEquals(o.heroImage, { sourceUri: full.heroImage.sourceUri }, "the hero without its description");
        assertEquals(o.loyaltyPoints, full.loyaltyPoints);
        assertEquals(o.barcode, full.barcode);
        assertEquals(o.linksModuleData, full.linksModuleData);
        assertEquals(o.id, full.id);
        if (n >= 10) assert(full.heroImage.sourceUri.uri.endsWith(c.label === "test" ? "/google/hero-test-10-v1.png" : "/google/hero-10-v1.png"));
      }
    }
    // The first update after Save puts everything back, with no notice.
    const fp = firstSavePatch({ ...card(10), platform: "google" }, cfg) as Record<string, any>;
    assertEquals(fp.secondaryLoyaltyPoints.balance.string, "Member");
    assertEquals(fp.textModulesData[0].body, "Loyalty member");
    assertEquals(fp.heroImage.contentDescription.defaultValue.value, "10 of 10");
    assert(fp.linksModuleData.uris.length === 2 && fp.loyaltyPoints.balance.string === "10 / 10");
    assertEquals(fp.notifyPreference, undefined);
    assertEquals(saveObject({ id: "x", heroImage: { sourceUri: { uri: "u" }, contentDescription: {} } }),
      { id: "x", heroImage: { sourceUri: { uri: "u" } } });
    // The guard: as the site's address grows, the link drops the hero, then the links, then is refused; never too long.
    const seen = new Set<string>();
    for (let k = 0; k <= 400; k += 8) {
      const site = `https://${"a".repeat(k)}x.example`;
      const c = { ...cfg, siteUrl: site, artUrl: `${site}/img/wallet` };
      const sl = await saveLink(loyaltyObject({ ...card(10), platform: "google" }, c), c, s);
      assert(sl.link === null || sl.length <= SAVE_LINK_LIMIT, `k ${k}: ${sl.length}`);
      seen.add(sl.link === null ? "refused" : sl.trimmed.join("+") || "lean");
    }
    assertEquals([...seen], ["lean", "heroImage", "heroImage+linksModuleData", "refused"]);
  });
  assertEquals(artManifest.files["google/hero-test-3-v1.png"], undefined, "the compiled-in manifest is as it was");
  const cfg = config();
  assertEquals(objectPatch({ ...card(4), platform: "google" }, cfg).notifyPreference, "NOTIFY_ON_UPDATE");
  assertEquals(objectPatch({ ...card(4, { last_change: "unstamp", notify: false }), platform: "google" }, cfg).notifyPreference, undefined);
  const m = loyaltyObject({ ...card(10), platform: "google" }, cfg) as Record<string, any>;
  assertEquals(m.secondaryLoyaltyPoints.balance.string, "Member");
  assertEquals(m.loyaltyPoints.balance.string, "10 / 10");
  assertEquals((loyaltyObject({ ...card(12), platform: "google" }, cfg) as any).loyaltyPoints.balance.string, "12");
});

Deno.test("art: make_wallet_art.py's folder names; the stand-in draws the AD letters (no stars) in the slots", async () => {
  const { artFolder } = await import("../../supabase/functions/_shared/wallet/art.ts");
  assertEquals(artFolder({ stamps: 3, slots: 10, member: false, test: false }), "3");
  assertEquals(artFolder({ stamps: 3, slots: 10, member: false, test: true }), "test-3");
  assertEquals(artFolder({ stamps: 12, slots: 10, member: true, test: false }), "10", "past 10 the card keeps the gold pictures");
  assertEquals(artFolder({ stamps: 0, slots: 10, member: false, test: true }), "test-0");
  // A filled slot holds the mark: inside the first slot's ring (centre 55.5, 41 pt at @1x; ring radius 24) the strip
  // at 1 stamp has gold pixels and at 0 none.
  const { decompressSync } = await import("npm:fflate@0.8.2");
  // png.ts writes 8-bit RGBA rows with filter 0, so the inflated IDAT is the pixels with one byte in front of each row.
  const pixels = (png: Uint8Array) => {
    const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const w = dv.getUint32(16), h = dv.getUint32(20);
    const parts: number[] = [];
    for (let at = 8; at < png.length;) {
      const len = dv.getUint32(at), type = new TextDecoder().decode(png.subarray(at + 4, at + 8));
      if (type === "IDAT") parts.push(...png.subarray(at + 8, at + 8 + len));
      at += 12 + len;
    }
    const raw = decompressSync(new Uint8Array(parts));
    const gold = (x: number, y: number) => {
      const i = y * (w * 4 + 1) + 1 + x * 4;
      return raw[i] > 200 && raw[i + 1] > 150 && raw[i + 2] < 120;
    };
    return { w, h, gold };
  };
  const goldIn = (png: Uint8Array) => {
    const { gold } = pixels(png);
    let n = 0;
    for (let y = 27; y <= 55; y++) {
      for (let x = 41; x <= 70; x++) if (gold(x, y)) n++;
    }
    return n;
  };
  // The gold pixels' box: the AD letters and bar alone are about 1.5 times as wide as tall (529 x 346 in the SVG's
  // units); with the four-point stars and hairlines the mark is taller than wide (529 x 560).
  const goldBox = (png: Uint8Array) => {
    const { w, h, gold } = pixels(png);
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (gold(x, y)) {
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
        }
      }
    }
    return { w: x1 - x0 + 1, h: y1 - y0 + 1 };
  };
  for (const look of [{ stamps: 3, slots: 10, member: false, test: true }, { stamps: 0, slots: 10, member: false, test: false }]) {
    const icon = goldBox(standIn(look)["icon@3x.png"]);
    assert(icon.w / icon.h > 1.4 && icon.w / icon.h < 1.7, `the icon's mark is the letters alone: ${icon.w} x ${icon.h}`);
    const logo = goldBox(standIn(look)["logo@3x.png"]);
    assert(logo.w / logo.h > 1.4 && logo.w / logo.h < 1.7, `the logo's mark is the letters alone: ${logo.w} x ${logo.h}`);
  }
  const empty = standIn({ stamps: 0, slots: 10, member: false, test: false })["strip.png"];
  const one = standIn({ stamps: 1, slots: 10, member: false, test: false })["strip.png"];
  assertEquals(goldIn(empty), 0, "an empty slot is only a ring");
  assert(goldIn(one) > 60, `gold pixels of the mark in a filled slot: ${goldIn(one)}`);
  const obj = loyaltyObject({ ...card(3), platform: "google" }, config()) as Record<string, any>;
  if (Object.keys(artManifest.files).length === 0) {
    assertEquals(obj.heroImage, undefined, "no hero picture until the art's fingerprints are compiled in");
  }
});

Deno.test("logs: tokens, push codes, JWTs and PEM blocks are redacted", () => {
  const t = redact(JSON.stringify({ a: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", b: "a".repeat(10) + "0123456789abcdef0123456789abcdef01",
    c: "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----", d: "eyJhbGciOiJSUzI1NiJ9xxxxxxxx.eyJpc3MiOiJ4In0xxxxxxxxx.c2lnbmF0dXJl" }));
  assert(!t.includes("ABCDEFGHJKLMNPQRSTUVWXYZ"), t);
  assert(!t.includes("0123456789abcdef0123456789abcdef"), t);
  assert(!t.includes("PRIVATE KEY"), t);
  assert(!t.includes("eyJhbGciOiJSUzI1NiJ9"), t);
});
