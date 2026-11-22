"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { chatKind, chatName } from "@/lib/messages";
import { chatScope } from "@/lib/scope";
import type { CurrentUser } from "@/lib/auth";
import { notifyUsers } from "@/lib/notify";
import type { FormState } from "./auth";

async function memberChat(user: CurrentUser, conversationId: string) {
  return db.conversation.findFirst({
    where: { id: conversationId, ...chatScope(user) },
    include: { project: { select: { name: true } }, members: { include: { user: { select: { id: true, name: true } } } } },
  });
}

/** Opens (or creates) the direct chat with one colleague. */
export async function startDirect(form: FormData) {
  const user = await requireUser();
  const otherId = String(form.get("userId") ?? "");
  const other = await db.user.findFirst({ where: { id: otherId, companyId: user.companyId, NOT: { id: user.id } } });
  if (!other) return;
  const existing = await db.conversation.findFirst({
    where: { companyId: user.companyId, projectId: null, companyWide: false, title: null, AND: [{ members: { some: { userId: user.id } } }, { members: { some: { userId: other.id } } }] },
  });
  const chat = existing ?? (await db.conversation.create({ data: { companyId: user.companyId, createdById: user.id, members: { create: [{ userId: user.id }, { userId: other.id }] } } }));
  redirect(`/messages/${chat.id}`);
}

export async function createGroup(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const title = String(form.get("title") ?? "").trim();
  if (title.length < 2) return { error: "Name the group." };
  const picked = [...new Set(form.getAll("members").map(String))].filter((id) => id !== user.id);
  if (picked.length < 1) return { error: "Pick at least one person." };
  const people = await db.user.findMany({ where: { id: { in: picked }, companyId: user.companyId }, select: { id: true } });
  if (people.length !== picked.length) return { error: "Pick people from your company." };
  const chat = await db.conversation.create({
    data: { companyId: user.companyId, title, createdById: user.id, members: { create: [{ userId: user.id }, ...people.map((p) => ({ userId: p.id, lastReadAt: new Date(0) }))] } },
  });
  await db.message.create({ data: { conversationId: chat.id, authorId: user.id, body: `${user.name} created the group "${title}".` } });
  await notifyUsers(people.map((p) => p.id), { title: `Added to "${title}"`, body: `${user.name} added you to a group chat.`, href: `/messages/${chat.id}` });
  redirect(`/messages/${chat.id}`);
}

/** Adds people to a named group. */
export async function addToGroup(conversationId: string, form: FormData) {
  const user = await requireUser();
  const chat = await memberChat(user, conversationId);
  if (!chat || chatKind(chat) !== "group") return;
  const ids = form.getAll("members").map(String);
  const people = await db.user.findMany({ where: { id: { in: ids }, companyId: user.companyId }, select: { id: true, name: true } });
  if (!people.length) return;
  await db.conversationMember.createMany({ data: people.map((p) => ({ conversationId: chat.id, userId: p.id, lastReadAt: new Date(0) })), skipDuplicates: true });
  await db.message.create({ data: { conversationId: chat.id, authorId: user.id, body: `${user.name} added ${people.map((p) => p.name).join(", ")}.` } });
  await notifyUsers(people.map((p) => p.id), { title: `Added to "${chat.title}"`, body: `${user.name} added you to a group chat.`, href: `/messages/${chat.id}` });
  revalidatePath(`/messages/${chat.id}`);
}

export async function leaveGroup(conversationId: string) {
  const user = await requireUser();
  const chat = await memberChat(user, conversationId);
  if (!chat || chatKind(chat) !== "group") return;
  await db.conversationMember.deleteMany({ where: { conversationId: chat.id, userId: user.id } });
  await db.message.create({ data: { conversationId: chat.id, authorId: user.id, body: `${user.name} left the group.` } });
  redirect("/messages");
}

export async function sendMessage(conversationId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const chat = await memberChat(user, conversationId);
  if (!chat) return { error: "Chat not found." };
  const body = String(form.get("body") ?? "").trim();
  if (!body) return { error: "Write a message." };
  if (body.length > 4000) return { error: "Keep messages under 4,000 characters." };
  const now = new Date();
  await db.$transaction([
    db.message.create({ data: { conversationId: chat.id, authorId: user.id, body, createdAt: now } }),
    db.conversation.update({ where: { id: chat.id }, data: { lastMessageAt: now } }),
    db.conversationMember.update({ where: { conversationId_userId: { conversationId: chat.id, userId: user.id } }, data: { lastReadAt: now } }),
  ]);
  // Direct and group chats notify (and email) the others. Busy company and project threads only show as unread.
  const kind = chatKind(chat);
  if (kind === "direct" || kind === "group") {
    const others = chat.members.map((m) => m.user.id).filter((id) => id !== user.id);
    const name = chatName(chat, user.id);
    await notifyUsers(others, { title: kind === "direct" ? `Message from ${user.name}` : `${user.name} in ${name}`, body: body.slice(0, 200), href: `/messages/${chat.id}` });
  }
  revalidatePath("/messages", "layout");
  return undefined;
}
