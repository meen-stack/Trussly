/** Name changes: at most two in any 20 days, for a person or the company. Pure, so it can be unit tested. */
export const NAME_CHANGES_ALLOWED = 2;
export const NAME_WINDOW_DAYS = 20;
const DAY = 864e5;

/** Whether a name can change now, given earlier change times, and if not, when it next can. */
export function nameChangeAllowed(previous: Date[], now = new Date()): { ok: true; left: number } | { ok: false; nextAt: Date } {
  const since = now.getTime() - NAME_WINDOW_DAYS * DAY;
  const recent = previous.filter((d) => d.getTime() > since).sort((a, b) => a.getTime() - b.getTime());
  if (recent.length < NAME_CHANGES_ALLOWED) return { ok: true, left: NAME_CHANGES_ALLOWED - recent.length };
  // The oldest change in the window has to fall out of it first.
  const oldest = recent[recent.length - NAME_CHANGES_ALLOWED];
  return { ok: false, nextAt: new Date(oldest.getTime() + NAME_WINDOW_DAYS * DAY) };
}
