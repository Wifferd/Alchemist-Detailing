// Calls the database's wallet_* functions as service_role (Migration 009 part 4: the tables have no grants, not even to
// service_role, so everything goes through these functions). Plain fetch to PostgREST, no client library.
//
// Errors: the functions raise SQLSTATE P0001 with message = a code (not_found, wrong_state, invalid_input...) and
// detail = a sentence. DbError carries both.

export class DbError extends Error {
  constructor(public status: number, public code: string, public detail: string) {
    super(`${code}: ${detail}`);
  }
}

function serviceKey(): string {
  const k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!k) throw new DbError(500, "server_error", "Missing configuration.");
  return k;
}

export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const url = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
  const key = serviceKey();
  const headers: Record<string, string> = {
    apikey: key,
    "content-type": "application/json",
    accept: "application/json",
  };
  // A legacy service-role JWT goes in Authorization too; a new-style secret key (sb_secret_...) only as apikey.
  if (!key.startsWith("sb_")) headers.authorization = "Bearer " + key;
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers,
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(15000),
  });
  const text = await r.text();
  if (!r.ok) {
    let code = "server_error", detail = `Database call ${fn} answered ${r.status}.`;
    try {
      const e = JSON.parse(text);
      if (e && e.code === "P0001") {
        code = String(e.message ?? code);
        detail = String(e.details ?? detail);
      } else if (e && e.message) {
        detail = `${fn}: ${String(e.code ?? "")} ${String(e.message)}`.slice(0, 300);
      }
    } catch { /* not JSON */ }
    throw new DbError(r.status, code, detail);
  }
  if (text === "" || text === "null") return null as T;
  return JSON.parse(text) as T;
}
