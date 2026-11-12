// Non-secret settings of the wallet functions, per Supabase project (the site's config.js pattern: the project decides).
// Every value can be replaced by an Edge Function secret of the same name (the owner sets those in the dashboard; the
// Supabase MCP can't set a value without him). Secrets (keys) are never here: the Apple key and certificate live in
// Vault (wallet_vault_get), the Google service account and an optional APNs .p8 key in Edge Function secrets.
//
// Phase A (Nov 12, 2026): only the TEST project is configured, with the throwaway pass type "pass.test.invalid.card",
// dry-run pushes and dry-run Google. Any other project (live) has no Pass Type ID until Phase D sets
// APPLE_PASS_TYPE_ID, APPLE_TEAM_ID, SITE_URL and the Google values: until then its routes answer "not set up".

export type ApnsMode = "dry-run" | "cert" | "token";
export type GoogleMode = "dry-run" | "live";

export interface WalletConfig {
  ref: string;
  supabaseUrl: string;
  label: "" | "test";            // "test": passes say "(test)", drawn grey; the Phase A test CA is trusted
  passTypeId: string | null;     // Apple pass type (also the APNs topic)
  teamId: string | null;         // Apple team (the certificate's OU)
  siteUrl: string | null;        // this project's website, for the pass's links and barcode
  artUrl: string | null;         // where the wallet art is served (site/img/wallet on that site)
  apnsMode: ApnsMode;
  apnsPushType: string | null;   // null: try alert, then background, then none (plan 4.4); record the one that delivers
  apnsHost: string;              // production APNs only (plan 4.4)
  googleMode: GoogleMode;
  googleIssuerId: string | null;
  googleClassCard: string;
  googleClassMember: string;
  trustTestCa: boolean;
}

interface ProjectDefaults {
  label: "" | "test";
  passTypeId?: string;
  teamId?: string;
  siteUrl?: string;
  googleClassCard?: string;
  googleClassMember?: string;
  trustTestCa?: boolean;
}

const PROJECTS: Record<string, ProjectDefaults> = {
  // Alchemist Test (practice bookings).
  wlmostaetntbpmfgyjst: {
    label: "test",
    passTypeId: "pass.test.invalid.card",    // plan section 9: a throwaway pass type, no Apple account yet
    teamId: "PHASEATEST",                    // the throwaway certificate's OU
    siteUrl: "https://alchemist-detailing-test.vercel.app",
    googleClassCard: "alchemist_card_test_v1",
    googleClassMember: "alchemist_member_test_v1",
    trustTestCa: true,
  },
};

function env(name: string): string | null {
  const v = Deno.env.get(name);
  return v && v.trim() !== "" ? v.trim() : null;
}

let cached: WalletConfig | null = null;

export function config(): WalletConfig {
  if (cached) return cached;
  const supabaseUrl = (env("SUPABASE_URL") ?? "").replace(/\/+$/, "");
  const ref = (/^https:\/\/([a-z0-9]+)\.supabase\.co$/.exec(supabaseUrl) ?? [])[1] ?? env("WALLET_PROJECT_REF") ?? "";
  const p: ProjectDefaults = PROJECTS[ref] ?? { label: "" };
  const label = (env("WALLET_LABEL") ?? p.label) === "test" ? "test" : "";
  const siteUrl = (env("SITE_URL") ?? p.siteUrl ?? null)?.replace(/\/+$/, "") ?? null;
  const apns = env("APNS_MODE");
  const google = env("GOOGLE_MODE");
  cached = {
    ref,
    supabaseUrl,
    label,
    passTypeId: env("APPLE_PASS_TYPE_ID") ?? p.passTypeId ?? null,
    teamId: env("APPLE_TEAM_ID") ?? p.teamId ?? null,
    siteUrl,
    artUrl: (env("WALLET_ART_URL") ?? (siteUrl ? siteUrl + "/img/wallet" : null))?.replace(/\/+$/, "") ?? null,
    apnsMode: apns === "cert" || apns === "token" ? apns : "dry-run",
    apnsPushType: env("APNS_PUSH_TYPE"),
    apnsHost: env("APNS_HOST") ?? "api.push.apple.com",
    // Live Google needs the service account; without it Google is always a dry run.
    googleMode: google === "live" && env("GOOGLE_WALLET_SA") ? "live" : "dry-run",
    googleIssuerId: env("GOOGLE_ISSUER_ID"),
    googleClassCard: env("GOOGLE_CLASS_CARD") ?? p.googleClassCard ?? "alchemist_card_v1",
    googleClassMember: env("GOOGLE_CLASS_MEMBER") ?? p.googleClassMember ?? "alchemist_member_v1",
    trustTestCa: p.trustTestCa === true && label === "test",
  };
  return cached;
}

// For tests: forget the cached settings (after changing Deno.env).
export function resetConfig(): void {
  cached = null;
}
