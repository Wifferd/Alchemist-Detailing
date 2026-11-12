// Small helpers shared by the wallet Edge Functions (Migration 009, plan section 4).
// Nothing here logs a secret: log() drops token-like text before it prints (see redact).

export const enc = new TextEncoder();
export const dec = new TextDecoder();

// Constant-time comparison of two strings (the cleanup-unattached-photos pattern).
export function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function b64url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? enc.encode(input) : input;
  return b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function unb64(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Every PEM block in a text, in order: [{label, der}].
export function pemBlocks(pem: string): { label: string; der: Uint8Array }[] {
  const out: { label: string; der: Uint8Array }[] = [];
  const re = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pem)) !== null) out.push({ label: m[1], der: unb64(m[2]) });
  return out;
}

export function pemToDer(pem: string, label?: string): Uint8Array {
  const blocks = pemBlocks(pem).filter((b) => !label || b.label === label);
  if (blocks.length === 0) throw new Error("no PEM block" + (label ? " " + label : ""));
  return blocks[0].der;
}

export function derToPem(der: Uint8Array, label: string): string {
  const body = b64(der).replace(/(.{64})/g, "$1\n").replace(/\n$/, "");
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n`;
}

export function toBuf(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

export function hex(buf: ArrayBuffer | Uint8Array): string {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const x of u) s += x.toString(16).padStart(2, "0");
  return s;
}

export async function sha1Hex(bytes: Uint8Array): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-1", bytes));
}

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}

export function empty(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers: { "cache-control": "no-store", ...headers } });
}

export function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { location, "cache-control": "no-store" } });
}

// Drops anything that could be a token from text bound for a log: runs of the card alphabet 20 characters or longer
// (add, download and Apple tokens), long hex (push codes, device keys), long base64 (keys, JWTs), and PEM blocks.
export function redact(text: string): string {
  return text
    .replace(/-----BEGIN [A-Z0-9 ]+-----[\s\S]*?(-----END [A-Z0-9 ]+-----|$)/g, "[pem]")
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g, "[jwt]")
    .replace(/[0-9A-Fa-f]{32,}/g, "[hex]")
    .replace(/[A-HJ-NP-Z2-9]{20,}/g, "[token]")
    .replace(/[A-Za-z0-9+/=_-]{60,}/g, "[blob]");
}

// One line per event, as JSON, redacted. Never pass a key, token or push code here on purpose: redact() is a net.
export function log(event: string, fields: Record<string, unknown> = {}): void {
  let line: string;
  try {
    line = JSON.stringify({ event, ...fields });
  } catch {
    line = JSON.stringify({ event });
  }
  console.log(redact(line).slice(0, 2000));
}

// Reads a request body up to a limit; null when it is longer (the caller answers 413).
export async function readBody(req: Request, limit: number): Promise<Uint8Array | null> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > limit) return null;
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      try {
        await reader.cancel();
      } catch { /* ignore */ }
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// "2026-11-12" -> "Nov 12" (the day as it is stored: Parker's date, no time zone shift).
export function shortDay(day: string | null | undefined): string | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [, m, d] = day.split("-").map(Number);
  return `${months[m - 1]} ${d}`;
}
