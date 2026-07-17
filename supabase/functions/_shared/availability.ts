export type LarkPerson = {
  staff_name?: string | null;
  display_name?: string | null;
  lark_open_id?: string | null;
};

export type AvailabilitySubmission = {
  id?: number;
  staff_name?: string | null;
  lark_open_id?: string | null;
  week_start?: string | null;
  availability_text?: string | null;
  created_at?: string | null;
};

const STAFF_ALIASES: Record<string, string> = {
  "gabby": "gabriela",
  "gabriela": "gabriela",
  "stephanie": "stephenie",
  "stephanie comeaux": "stephenie",
  "stephenie": "stephenie",
  "vivian gutierrez": "vivian",
  "vivian": "vivian",
  "orchid ramos pena": "orchid",
  "orchid": "orchid",
  "sherron wong": "sherron",
  "sherron": "sherron",
};

export function normalizeAvailabilityName(name: string) {
  return String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function canonicalStaffKey(name: string) {
  const normalized = normalizeAvailabilityName(name);
  return STAFF_ALIASES[normalized] || normalized;
}

export function personStaffKeys(person: LarkPerson) {
  return new Set(
    [person.staff_name, person.display_name]
      .map((name) => canonicalStaffKey(String(name || "")))
      .filter(Boolean),
  );
}

export function submissionIdentity(submission: AvailabilitySubmission) {
  const openId = String(submission.lark_open_id || "").trim();
  if (openId) return `open:${openId}`;
  const nameKey = canonicalStaffKey(String(submission.staff_name || ""));
  return nameKey ? `name:${nameKey}` : "";
}

export function hasSubmittedAvailability(person: LarkPerson, submissions: AvailabilitySubmission[]) {
  const openId = String(person.lark_open_id || "").trim();
  const keys = personStaffKeys(person);
  return submissions.some((submission) => {
    if (openId && String(submission.lark_open_id || "").trim() === openId) return true;
    return keys.has(canonicalStaffKey(String(submission.staff_name || "")));
  });
}

export function latestSubmissionsOnly(submissions: AvailabilitySubmission[]) {
  const byIdentity = new Map<string, AvailabilitySubmission>();
  for (const submission of submissions) {
    const identity = submissionIdentity(submission);
    if (!identity) continue;
    const existing = byIdentity.get(identity);
    if (!existing || String(submission.created_at || "") > String(existing.created_at || "")) {
      byIdentity.set(identity, submission);
    }
  }
  return Array.from(byIdentity.values()).sort((a, b) =>
    canonicalStaffKey(String(a.staff_name || "")).localeCompare(canonicalStaffKey(String(b.staff_name || ""))) ||
    String(b.created_at || "").localeCompare(String(a.created_at || ""))
  );
}
