/** Sign-in lockout rules. Pure, so they can be unit tested. */

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

/** Whether the account is locked right now, and for how many more minutes. */
export function lockedFor(lockedUntil: Date | null, now = new Date()) {
  if (!lockedUntil || lockedUntil <= now) return 0;
  return Math.ceil((lockedUntil.getTime() - now.getTime()) / 60000);
}

/** The counters after a wrong password: the fifth miss in a row locks the account for 15 minutes. */
export function afterFailedLogin(failedLogins: number, now = new Date()) {
  const failed = failedLogins + 1;
  if (failed >= MAX_FAILED_LOGINS) return { failedLogins: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60000) };
  return { failedLogins: failed, lockedUntil: null };
}
