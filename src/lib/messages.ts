import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { visibleProjectsWhere } from "./access";
import type { CurrentUser } from "./auth";

export type ChatKind = "direct" | "group" | "company" | "project";

export function chatKind(c: { projectId: string | null; companyWide: boolean; title: string | null }): ChatKind {
  if (c.projectId) return "project";
  if (c.companyWide) return "company";
  return c.title ? "group" : "direct";
}

/** Everyone is in the company-wide chat and the thread of every project they can see. Created on first visit. */
export async function ensureDefaultChats(user: CurrentUser) {
  let company = await db.conversation.findFirst({ where: { companyId: user.companyId, companyWide: true } });
  if (!company) company = await db.conversation.create({ data: { companyId: user.companyId, companyWide: true, title: `${user.company.name} (everyone)` } });
  const projects = await db.project.findMany({ where: visibleProjectsWhere(user), select: { id: true, name: true, conversation: { select: { id: true } } } });
  const ids = [company.id];
  for (const p of projects) {
    const c = p.conversation ?? (await db.conversation.upsert({ where: { projectId: p.id }, create: { companyId: user.companyId, projectId: p.id }, update: {} }));
    ids.push(c.id);
  }
  await db.conversationMember.createMany({ data: ids.map((conversationId) => ({ conversationId, userId: user.id, lastReadAt: new Date(0) })), skipDuplicates: true });
}

/** Messages from others that arrived after this person last read each chat. */
export async function unreadMessages(userId: string) {
  const rows = await db.$queryRaw<{ n: bigint }[]>(Prisma.sql`
    SELECT count(*) AS n FROM "Message" m
    JOIN "ConversationMember" cm ON cm."conversationId" = m."conversationId" AND cm."userId" = ${userId}
    WHERE m."authorId" <> ${userId} AND m."createdAt" > cm."lastReadAt"`);
  return Number(rows[0]?.n ?? 0);
}

export async function unreadByConversation(userId: string) {
  const rows = await db.$queryRaw<{ id: string; n: bigint }[]>(Prisma.sql`
    SELECT m."conversationId" AS id, count(*) AS n FROM "Message" m
    JOIN "ConversationMember" cm ON cm."conversationId" = m."conversationId" AND cm."userId" = ${userId}
    WHERE m."authorId" <> ${userId} AND m."createdAt" > cm."lastReadAt"
    GROUP BY m."conversationId"`);
  return new Map(rows.map((r) => [r.id, Number(r.n)]));
}

/** The person's chats, newest activity first, with a display name and the last message. */
export async function chatList(user: CurrentUser) {
  const [chats, unread] = await Promise.all([
    db.conversation.findMany({
      where: { companyId: user.companyId, members: { some: { userId: user.id } } },
      include: {
        project: { select: { name: true } },
        members: { include: { user: { select: { id: true, name: true, role: true, title: true } } } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, include: { author: { select: { name: true } } } },
      },
      orderBy: { lastMessageAt: "desc" },
    }),
    unreadByConversation(user.id),
  ]);
  return chats.map((c) => ({ ...c, kind: chatKind(c), name: chatName(c, user.id), unread: unread.get(c.id) ?? 0, last: c.messages[0] ?? null }));
}

export function chatName(c: { projectId: string | null; companyWide: boolean; title: string | null; project?: { name: string } | null; members: { user: { id: string; name: string } }[] }, me: string) {
  if (c.project) return c.project.name;
  if (c.title) return c.title;
  return c.members.find((m) => m.user.id !== me)?.user.name ?? "Just you";
}
