// Alchemist Detailing — create a team account (W-05).
//
// Only the admin, signed in with the authenticator-app step, can call this.
// It creates a login for a new manager or detailer, or promotes an existing
// login with that confirmed email, then sets the role through the database,
// which checks the admin again.
//
// Sign-in is by email code (Migration 004): the new team member signs in with
// a 6-digit code sent to this address (managers then add the authenticator
// app). The address counts as confirmed because the admin vouches for it; only
// whoever reads that inbox can sign in with it.
//
// POST { "email": "dana@example.com", "role": "detailer" | "manager",
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

// A plain email address, lowercased (the database keeps profiles.email lowercase).
function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  return email;
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
  const email = normalizeEmail(String(body.email ?? ""));
  if (!email) return reply(400, { error: "invalid_input", detail: "Enter their email address.", hint: "email" });
  const firstName = typeof body.first_name === "string" ? body.first_name.trim() : "";
  const lastName = typeof body.last_name === "string" ? body.last_name.trim() : "";

  // 3. An existing login with this confirmed email is promoted, never duplicated.
  const existing = await asCaller.from("profiles").select("id, is_active").eq("email", email).maybeSingle();
  if (existing.error) return reply(500, { error: "server_error", detail: existing.error.message });
  if (existing.data && !existing.data.is_active) {
    return reply(409, {
      error: "wrong_state",
      detail: "This person's account is turned off. Turn it on first if they should have access.",
      hint: "email",
    });
  }

  let userId = existing.data?.id as string | undefined;
  let created = false;
  if (!userId) {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const res = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
    });
    if (res.error || !res.data.user) {
      const exists = res.error?.status === 422 || /already|registered|exists/i.test(res.error?.message ?? "");
      return exists
        ? reply(409, {
          error: "wrong_state",
          detail: "A login with this email exists but isn't confirmed yet. Ask them to sign in on the site with the email code first, then try again.",
          hint: "email",
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
