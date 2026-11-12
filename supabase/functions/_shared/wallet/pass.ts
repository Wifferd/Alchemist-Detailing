// pass.json for the Apple wash card (plan 2.4), built on request from wallet_pass_data and never stored.
//
// Content rule: nothing about a reward, perk, discount or "free", no price, no hours, nothing personal. Facts come from
// the database (count, last wash, the issuer lines) or CLAUDE.md (the name). The number is offered as "Call", never
// "Text". Wording marked PROPOSED waits for the owner's approval (wording rules, plan 6.4).
import type { WalletConfig } from "./config.ts";
import { shortDay } from "./util.ts";

export interface PassData {
  card_id: string;
  code: string;
  code_words: string;
  platform: "apple" | "google";
  card_name: string;
  stamps: number;
  slots: number;
  count_words: string;
  member: boolean;
  member_since: string | null;
  last_wash_day: string | null;
  last_change: string;
  notify: boolean;
  reminder_text: string | null;
  voided: boolean;
  changed_at: string;
  changed_at_ms: number;
  add_token: string;
  apple_token: string;
  google_object_id: string | null;
  google_saved: boolean;
  issuer: { area: string | null; phone: string | null; address: string | null; email: string | null };
  site_url: string | null;
}

export const ORG = "Alchemist Detailing";

// PROPOSED wording (plan 2.4, 6.4): the owner approves every sentence before launch.
export const WORDS = {
  collecting: "Collecting",
  member: "Loyalty member",
  stampMessage: "Wash stamped: %@",
  howItWorks: (slots: number) =>
    `Each wash fills one slot. At ${slots} washes the card turns gold: Loyalty member.`,
  cardPageLink: "Card page and reminders",
  bookLink: "Book a wash",
};

const COLORS = {
  collecting: { backgroundColor: "rgb(0, 0, 0)", foregroundColor: "rgb(244, 244, 244)", labelColor: "rgb(245, 186, 76)" },
  test: { backgroundColor: "rgb(28, 28, 28)", foregroundColor: "rgb(244, 244, 244)", labelColor: "rgb(245, 186, 76)" },
  member: { backgroundColor: "rgb(218, 156, 48)", foregroundColor: "rgb(13, 9, 3)", labelColor: "rgb(13, 9, 3)" },
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function siteOf(d: PassData, cfg: WalletConfig): string {
  return (cfg.siteUrl ?? d.site_url ?? "").replace(/\/+$/, "");
}

export function passJson(d: PassData, cfg: WalletConfig): Record<string, unknown> {
  if (!cfg.passTypeId || !cfg.teamId) throw new Error("Apple pass type or team not set");
  const test = cfg.label === "test";
  const site = siteOf(d, cfg);
  const colors = d.member ? COLORS.member : test ? COLORS.test : COLORS.collecting;
  const notifyStamp = d.notify && d.last_change === "stamp";
  const notifyMember = d.notify && d.last_change === "member";
  const notifyReminder = d.notify && d.last_change === "reminder" && !!d.reminder_text;

  const secondary: Record<string, unknown>[] = [
    { key: "washes", label: "WASHES", value: d.count_words, ...(notifyStamp ? { changeMessage: WORDS.stampMessage } : {}) },
    { key: "status", label: "STATUS", value: d.member ? WORDS.member : WORDS.collecting,
      ...(notifyMember ? { changeMessage: "%@" } : {}) },
  ];
  const auxiliary: Record<string, unknown>[] = [];
  const last = shortDay(d.last_wash_day);
  if (last) auxiliary.push({ key: "last", label: "LAST WASH", value: last });

  const issuerLines = [ORG, d.issuer.address, d.issuer.area, d.issuer.phone, d.issuer.email]
    .filter((x): x is string => !!x && x.trim() !== "");
  const back: Record<string, unknown>[] = [];
  if (d.reminder_text) {
    // PROPOSED (plan 6.1): a reminder rides in a back field with its own change message; UNVERIFIED that back fields
    // notify on iOS 26/27 (fallback: a front field).
    back.push({ key: "reminder", label: "Reminder", value: d.reminder_text, ...(notifyReminder ? { changeMessage: "%@" } : {}) });
  }
  back.push({ key: "how", label: "How it works", value: WORDS.howItWorks(d.slots) });
  if (site) {
    back.push({ key: "book", label: "Book", value: `${site}/#book`,
      attributedValue: `<a href="${esc(site)}/#book">${WORDS.bookLink}</a>` });
  }
  if (d.issuer.phone) {
    back.push({ key: "call", label: "Call", value: d.issuer.phone, dataDetectorTypes: ["PKDataDetectorTypePhoneNumber"] });
  }
  if (site) {
    back.push({ key: "page", label: "Your card", value: `${site}/#card-${d.add_token}`,
      attributedValue: `<a href="${esc(site)}/#card-${d.add_token}">${WORDS.cardPageLink}</a>` });
  }
  back.push({ key: "number", label: "Card number", value: d.code_words });
  back.push({ key: "issuer", label: "Issued by", value: issuerLines.join("\n") });

  const pass: Record<string, unknown> = {
    formatVersion: 1,
    passTypeIdentifier: cfg.passTypeId,
    teamIdentifier: cfg.teamId,
    serialNumber: d.code,
    authenticationToken: d.apple_token,
    webServiceURL: `${cfg.supabaseUrl}/functions/v1/wallet/apple`,
    organizationName: test ? `${ORG} (test)` : ORG,
    description: test ? `TEST ${d.card_name.toLowerCase()}, not a real card` : `${ORG} ${d.card_name.toLowerCase()}`,
    logoText: test ? `${ORG} (test)` : ORG,
    ...colors,
    sharingProhibited: true,
    barcodes: [{
      format: "PKBarcodeFormatQR",
      message: site ? `${site}/#admin-cards-${d.code}` : d.code,
      messageEncoding: "iso-8859-1",
      altText: d.code_words,
    }],
    storeCard: {
      ...(test ? { headerFields: [{ key: "test", label: "TEST", value: "Not real" }] } : {}),
      secondaryFields: secondary,
      ...(auxiliary.length ? { auxiliaryFields: auxiliary } : {}),
      backFields: back,
    },
  };
  if (d.voided) pass.voided = true;
  return pass;
}
