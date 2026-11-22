import "server-only";
import { db } from "./db";
import { NAME_WINDOW_DAYS, nameChangeAllowed } from "./names";

/** Whether this person and their company can change name now. */
export async function renameStatus(userId: string, companyId: string) {
  const now = new Date();
  const since = new Date(now.getTime() - NAME_WINDOW_DAYS * 864e5);
  const changes = await db.nameChange.findMany({ where: { createdAt: { gt: since }, OR: [{ subjectType: "USER", subjectId: userId }, { subjectType: "COMPANY", subjectId: companyId }] } });
  const times = (type: string) => changes.filter((x) => x.subjectType === type).map((x) => x.createdAt);
  return { me: nameChangeAllowed(times("USER"), now), company: nameChangeAllowed(times("COMPANY"), now) };
}
