// Alchemist Detailing — remove vehicle photos never attached to a booking (W-13, F-53).
//
// Photos upload before a booking is sent, so abandoned bookings leave files
// behind. This deletes files older than 24 hours that no booking uses, through
// the Storage API, so the files themselves are removed, not just their rows.
//
// Run it on a schedule (for example hourly) with the service role key, from
// Supabase Cron in the dashboard. Any other caller is refused.
import { createClient } from "jsr:@supabase/supabase-js@2";

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// The platform has already verified a JWT's signature (verify_jwt is on);
// here we only read which role it carries.
function tokenRole(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return reply(500, { error: "server_error", detail: "Missing configuration." });

  // Only the scheduler, calling with the service role key (legacy JWT or the
  // project's secret key), may run this.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!(sameText(token, serviceKey) || tokenRole(token) === "service_role")) {
    return reply(403, { error: "not_allowed", detail: "This job runs on a schedule only." });
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let removed = 0;
  // Up to 10 rounds of 1,000 files per run.
  for (let round = 0; round < 10; round++) {
    const { data, error } = await db.rpc("list_unattached_vehicle_photos", { p_older_than: "24 hours" });
    if (error) return reply(500, { error: "server_error", detail: error.message, removed });
    const names = (data ?? []).map((row: { name: string }) => row.name);
    if (names.length === 0) break;
    for (let i = 0; i < names.length; i += 100) {
      const { error: removeError } = await db.storage.from("vehicle-photos").remove(names.slice(i, i + 100));
      if (removeError) return reply(500, { error: "server_error", detail: removeError.message, removed });
      removed += Math.min(100, names.length - i);
    }
    if (names.length < 1000) break;
  }
  return reply(200, { removed });
});
