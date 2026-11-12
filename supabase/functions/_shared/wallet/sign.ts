// Signing and packing an Apple pass (plan 4.3; proven locally in Phase A research, proto/deno_sign_pkpass.ts):
// manifest.json holds the SHA-1 of every file; "signature" is a detached CMS (PKCS#7) signature of the manifest with the
// Pass Type ID key (SHA-256 with RSA), with the contentType, messageDigest and signingTime attributes, carrying the
// signer certificate and the intermediate that issued it (Apple's WWDR G4; the Phase A test CA on TEST). Zipped with
// fflate. Pinned: pkijs 3.4.3 (pkijs 4 is brand new) and fflate 0.8.2; asn1js is imported with pkijs's own range
// (^3.0.6) so both share one copy (an exact pin made a second copy that pkijs's types refuse).
import * as pkijs from "npm:pkijs@3.4.3";
import * as asn1js from "npm:asn1js@^3.0.6";
import { zipSync } from "npm:fflate@0.8.2";
import { enc, pemToDer, sha1Hex, toBuf } from "./util.ts";

pkijs.setEngine("webcrypto", new pkijs.CryptoEngine({ name: "webcrypto", crypto }));

const OID_DATA = "1.2.840.113549.1.7.1";
const OID_SIGNED_DATA = "1.2.840.113549.1.7.2";
const OID_CONTENT_TYPE = "1.2.840.113549.1.9.3";
const OID_MESSAGE_DIGEST = "1.2.840.113549.1.9.4";
const OID_SIGNING_TIME = "1.2.840.113549.1.9.5";

export interface SigningPair {
  key: CryptoKey;              // RSASSA-PKCS1-v1_5 / SHA-256, sign only, not extractable
  cert: pkijs.Certificate;
  chain: pkijs.Certificate[];  // the issuer(s) to include
}

export function parseCert(pem: string): pkijs.Certificate {
  return pkijs.Certificate.fromBER(toBuf(pemToDer(pem, "CERTIFICATE")));
}

export async function importSigningKey(pkcs8Pem: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey("pkcs8", toBuf(pemToDer(pkcs8Pem, "PRIVATE KEY")),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

export async function signManifest(manifestBytes: Uint8Array, pair: SigningPair, now = new Date()): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", manifestBytes);
  const cms = new pkijs.SignedData({
    version: 1,
    encapContentInfo: new pkijs.EncapsulatedContentInfo({ eContentType: OID_DATA }),  // detached: no eContent
    signerInfos: [new pkijs.SignerInfo({
      version: 1,
      sid: new pkijs.IssuerAndSerialNumber({ issuer: pair.cert.issuer, serialNumber: pair.cert.serialNumber }),
      signedAttrs: new pkijs.SignedAndUnsignedAttributes({
        type: 0,
        attributes: [
          new pkijs.Attribute({ type: OID_CONTENT_TYPE, values: [new asn1js.ObjectIdentifier({ value: OID_DATA })] }),
          new pkijs.Attribute({ type: OID_SIGNING_TIME, values: [new asn1js.UTCTime({ valueDate: now })] }),
          new pkijs.Attribute({ type: OID_MESSAGE_DIGEST, values: [new asn1js.OctetString({ valueHex: digest })] }),
        ],
      }),
    })],
    certificates: [pair.cert, ...pair.chain],
  });
  await cms.sign(pair.key, 0, "SHA-256", toBuf(manifestBytes));
  const info = new pkijs.ContentInfo({ contentType: OID_SIGNED_DATA, content: cms.toSchema(true) });
  return new Uint8Array(info.toSchema().toBER(false));
}

// pass.json plus the pictures -> the .pkpass bytes.
export async function buildPkpass(passJson: unknown, images: Record<string, Uint8Array>, pair: SigningPair):
  Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = { "pass.json": enc.encode(JSON.stringify(passJson)), ...images };
  const manifest: Record<string, string> = {};
  for (const name of Object.keys(files).sort()) manifest[name] = await sha1Hex(files[name]);
  const manifestBytes = enc.encode(JSON.stringify(manifest));
  const signature = await signManifest(manifestBytes, pair);
  return zipSync({ ...files, "manifest.json": manifestBytes, signature }, { level: 6 });
}
