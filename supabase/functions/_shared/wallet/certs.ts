// The Pass Type ID key and certificate (plan 4.6 and 4.7, review B2): the key is made here, inside Supabase, with
// WebCrypto, saved straight into Vault (wallet_apple_key_next) and never returned, printed or logged. Only the CSR (public)
// leaves, and only the certificate (public) comes back. Then the certificate is checked against the key, the Pass Type
// ID, the team and a trusted issuer before it replaces the old pair.
import * as pkijs from "npm:pkijs@3.4.3";
import * as asn1js from "npm:asn1js@^3.0.6";
import type { WalletConfig } from "./config.ts";
import { APPLE_WWDR_G4, PHASE_A_TEST_CA } from "./trust.ts";
import { importSigningKey, parseCert, type SigningPair } from "./sign.ts";
import { vaultGet } from "./vault.ts";
import { derToPem, enc, sha1Hex } from "./util.ts";

pkijs.setEngine("webcrypto", new pkijs.CryptoEngine({ name: "webcrypto", crypto }));

const OID_UID = "0.9.2342.19200300.100.1.1";
const OID_CN = "2.5.4.3";
const OID_OU = "2.5.4.11";
const OID_O = "2.5.4.10";
const OID_C = "2.5.4.6";

export class CertError extends Error {
  constructor(public code: string, detail: string) {
    super(detail);
  }
}

// A new RSA 2048 key and its CSR. The key comes back as PKCS#8 PEM for the caller to put in Vault, and nowhere else.
// The CSR's subject is CN "Alchemist Detailing pass", C US, no email (plan 4.7 step 1; UNVERIFIED whether Apple wants
// the account's email in it).
export async function newKeyAndCsr(commonName = "Alchemist Detailing pass"): Promise<{ keyPem: string; csrPem: string }> {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true, ["sign", "verify"]) as CryptoKeyPair;
  const csr = new pkijs.CertificationRequest();
  csr.version = 0;
  // One attribute per RDN (C, then CN). pkijs would put both in one multi-valued RDN ("C = US + CN = ..."), so the
  // name is encoded here and read back.
  const rdn = (type: string, value: asn1js.BaseBlock) =>
    new asn1js.Set({ value: [new pkijs.AttributeTypeAndValue({ type, value: value as never }).toSchema()] });
  const name = new asn1js.Sequence({ value: [
    rdn(OID_C, new asn1js.PrintableString({ value: "US" })),
    rdn(OID_CN, new asn1js.Utf8String({ value: commonName })),
  ] });
  csr.subject = pkijs.RelativeDistinguishedNames.fromBER(name.toBER(false));
  csr.attributes = [];
  await csr.subjectPublicKeyInfo.importKey(pair.publicKey);
  await csr.sign(pair.privateKey, "SHA-256");
  const csrDer = new Uint8Array(csr.toSchema().toBER(false));
  const keyDer = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  return { keyPem: derToPem(keyDer, "PRIVATE KEY"), csrPem: derToPem(csrDer, "CERTIFICATE REQUEST") };
}

function dn(name: pkijs.RelativeDistinguishedNames, oid: string): string | null {
  for (const tv of name.typesAndValues) {
    if (tv.type === oid) {
      // deno-lint-ignore no-explicit-any
      const v = (tv.value as any)?.valueBlock?.value;
      return typeof v === "string" ? v : null;
    }
  }
  return null;
}

export interface CertFacts {
  uid: string | null;
  cn: string | null;
  ou: string | null;
  o: string | null;
  notAfter: Date;
  notBefore: Date;
  issuerCn: string | null;
}

export function certFacts(cert: pkijs.Certificate): CertFacts {
  return {
    uid: dn(cert.subject, OID_UID),
    cn: dn(cert.subject, OID_CN),
    ou: dn(cert.subject, OID_OU),
    o: dn(cert.subject, OID_O),
    notAfter: cert.notAfter.value,
    notBefore: cert.notBefore.value,
    issuerCn: dn(cert.issuer, OID_CN),
  };
}

// The certificates this project accepts as the issuer of its Pass Type ID certificate.
export function trustedIssuers(cfg: WalletConfig): pkijs.Certificate[] {
  const out: pkijs.Certificate[] = [];
  if (APPLE_WWDR_G4.includes("BEGIN CERTIFICATE")) out.push(parseCert(APPLE_WWDR_G4));
  if (cfg.trustTestCa) out.push(parseCert(PHASE_A_TEST_CA));
  return out;
}

// The trusted certificate that issued and signed `cert`, or null.
export async function issuerOf(cert: pkijs.Certificate, cfg: WalletConfig): Promise<pkijs.Certificate | null> {
  for (const ca of trustedIssuers(cfg)) {
    if (!cert.issuer.isEqual(ca.subject)) continue;
    try {
      if (await cert.verify(ca)) return ca;
    } catch { /* not this one */ }
  }
  return null;
}

// Does this private key belong to this certificate? Signs a random challenge and checks it with the certificate's key.
export async function keyMatchesCert(keyPem: string, cert: pkijs.Certificate): Promise<boolean> {
  try {
    const key = await importSigningKey(keyPem);
    const spki = cert.subjectPublicKeyInfo.toSchema().toBER(false);
    const pub = await crypto.subtle.importKey("spki", spki, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, challenge);
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", pub, sig, challenge);
  } catch {
    return false;
  }
}

// All the checks of plan 4.7 step 3, before a certificate is installed. Throws CertError with a plain sentence.
export async function checkNewCert(certPem: string, keyPem: string, cfg: WalletConfig): Promise<CertFacts> {
  let cert: pkijs.Certificate;
  try {
    cert = parseCert(certPem);
  } catch {
    throw new CertError("invalid_input", "That isn't a certificate in PEM form.");
  }
  const facts = certFacts(cert);
  if (!(await keyMatchesCert(keyPem, cert))) {
    throw new CertError("wrong_key", "This certificate wasn't made from the latest certificate request (its key differs).");
  }
  if (!cfg.passTypeId || facts.uid !== cfg.passTypeId) {
    throw new CertError("wrong_pass_type", `The certificate is for ${facts.uid ?? "no pass type"}, not ${cfg.passTypeId ?? "(not set)"}.`);
  }
  if (!cfg.teamId || facts.ou !== cfg.teamId) {
    throw new CertError("wrong_team", `The certificate's team is ${facts.ou ?? "missing"}, not ${cfg.teamId ?? "(not set)"}.`);
  }
  if (!(await issuerOf(cert, cfg))) {
    throw new CertError("untrusted_issuer", `The certificate's issuer (${facts.issuerCn ?? "unknown"}) isn't trusted here.`);
  }
  const now = Date.now();
  if (facts.notAfter.getTime() <= now || facts.notBefore.getTime() > now + 5 * 60 * 1000) {
    throw new CertError("not_valid_now", "The certificate isn't valid today.");
  }
  return facts;
}

// The pair that signs passes: Vault first (wallet_apple_key, wallet_apple_cert), then the owner's-Mac fallback secrets
// (APPLE_PASS_KEY_PEM, APPLE_PASS_CERT_PEM; plan 4.6). Null when nothing is installed. Cached per worker.
let pairCache: { id: string; pair: SigningPair; at: number } | null = null;

export async function signingPair(cfg: WalletConfig): Promise<SigningPair | null> {
  const keyPem = (await vaultGet("wallet_apple_key")) ?? Deno.env.get("APPLE_PASS_KEY_PEM") ?? null;
  const certPem = (await vaultGet("wallet_apple_cert")) ?? Deno.env.get("APPLE_PASS_CERT_PEM") ?? null;
  if (!keyPem || !certPem) return null;
  const id = await sha1Hex(enc.encode(keyPem + "\n" + certPem));
  if (pairCache && pairCache.id === id && Date.now() - pairCache.at < 10 * 60 * 1000) return pairCache.pair;
  const cert = parseCert(certPem);
  const issuer = await issuerOf(cert, cfg);
  if (!issuer) throw new CertError("untrusted_issuer", "The installed certificate's issuer isn't trusted here.");
  const pair: SigningPair = { key: await importSigningKey(keyPem), cert, chain: [issuer] };
  pairCache = { id, pair, at: Date.now() };
  return pair;
}

// The raw PEMs for an APNs client certificate (route 2). Same source as signingPair.
export async function apnsCertPems(): Promise<{ cert: string; key: string } | null> {
  const key = (await vaultGet("wallet_apple_key")) ?? Deno.env.get("APPLE_PASS_KEY_PEM") ?? null;
  const cert = (await vaultGet("wallet_apple_cert")) ?? Deno.env.get("APPLE_PASS_CERT_PEM") ?? null;
  return key && cert ? { cert, key } : null;
}
