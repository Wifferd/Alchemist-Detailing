// Alchemist Detailing — create a team account (W-05).
//
// Only the admin, signed in with the authenticator-app step, can call this.
// It creates a login for a new manager or detailer, or promotes an existing
// login with that confirmed phone number, then sets the role through the
// database, which checks the admin again.
//
// The phone is never marked as confirmed here: the new team member confirms
// it with a text code at first sign-in, then sets a password.
//
// POST { "phone": "(945) 555-0123", "role": "detailer" | "manager",
//        "first_name": "Dana", "last_name": "Lee" }
// 200  { "user_id": "...", "created": true | false, "role": "detailer" }
// Errors use the database's codes: { "error": code, "detail": text, "hint": field }
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Same rule as public.normalize_phone: 1 + a real-looking US number.
function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  const num = digits.length === 10
    ? "1" + digits
    : digits.length === 11 && digits.startsWith("1")
    ? digits
    : null;
  if (!num || !/^1[2-9][0-8][0-9][2-9][0-9]{6}$/.test(num)) return null;
  if (/^[2-9]11$/.test(num.slice(4, 7))) return null;
  if (num.slice(4, 7) === "555" && num.slice(7, 9) === "01") return null;
  return num;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply(405, { error: "invalid_input", detail: "Use POST." });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return reply(500, { error: "server_error", detail: "Missing configuration." });

  // The caller's own session: every database check runs as them.
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Only the admin, with the authenticator step.
  const check = await asCaller.rpc("assert_admin");
  if (check.error) {
    return reply(403, { error: check.error.message, detail: check.error.details, hint: check.error.hint });
  }

  // 2. Input.
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: "invalid_input", detail: "Send the details as JSON." });
  }
  const role = body.role;
  if (role !== "detailer" && role !== "manager") {
    return reply(400, { error: "invalid_input", detail: "Choose detailer or manager.", hint: "role" });
  }
  const phone = normalizePhone(String(body.phone ?? ""));
  if (!phone) return reply(400, { error: "invalid_input", detail: "Enter a US phone number.", hint: "phone" });
  const firstName = typeof body.first_name === "string" ? body.first_name.trim() : "";
  const lastName = typeof body.last_name === "string" ? body.last_name.trim() : "";

  // 3. An existing login with this confirmed phone is promoted, never duplicated.
  const existing = await asCaller.from("profiles").select("id, is_active").eq("phone", phone).maybeSingle();
  if (existing.error) return reply(500, { error: "server_error", detail: existing.error.message });
  if (existing.data && !existing.data.is_active) {
    return reply(409, {
      error: "wrong_state",
      detail: "This person's account is turned off. Turn it on first if they should have access.",
      hint: "phone",
    });
  }

  let userId = existing.data?.id as string | undefined;
  let created = false;
  if (!userId) {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const res = await admin.auth.admin.createUser({
      phone: "+" + phone,
      phone_confirm: false,
      user_metadata: { first_name: firstName, last_name: lastName },
    });
    if (res.error || !res.data.user) {
      const exists = res.error?.status === 422 || /already|registered|exists/i.test(res.error?.message ?? "");
      return exists
        ? reply(409, {
          error: "wrong_state",
          detail: "A login with this phone number exists but isn't confirmed yet. Ask them to sign in with a text code first, then try again.",
          hint: "phone",
        })
        : reply(500, { error: "server_error", detail: res.error?.message ?? "The account couldn't be created." });
    }
    userId = res.data.user.id;
    created = true;
  }

  // 4. The role, set by the database as the admin (checked again there).
  const set = await asCaller.rpc("set_user_role", { p_user: userId, p_role: role });
  if (set.error) return reply(400, { error: set.error.message, detail: set.error.details, hint: set.error.hint });

  return reply(200, { user_id: userId, created, role });
});
