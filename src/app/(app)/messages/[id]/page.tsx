import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { format, isSameDay } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/permissions";
import { chatKind, chatList, chatName, ensureDefaultChats } from "@/lib/messages";
import { Button, Card, cn } from "@/components/ui";
import { ChatComposer, LiveRefresh, ScrollToEnd } from "@/components/chat";
import { Attachments } from "@/components/media";
import { directUploads } from "@/lib/storage";
import { addToGroup, leaveGroup, sendMessage } from "@/app/actions/messages";
import { ChatList } from "../chat-list";
import { chatScope } from "@/lib/scope";

export const metadata: Metadata = { title: "Messages" };

export default async function ChatPage({ params }: PageProps<"/messages/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  await ensureDefaultChats(user);
  const chat = await db.conversation.findFirst({
    where: { id, ...chatScope(user) },
    include: {
      project: { select: { id: true, name: true } },
      members: {
        include: {
          user: { select: { id: true, name: true, role: true, title: true } },
        },
      },
      messages: {
        include: { author: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: "desc" },
        take: 200,
      },
    },
  });
  if (!chat) notFound();
  // Opening the chat marks it read.
  await db.conversationMember.update({
    where: {
      conversationId_userId: { conversationId: chat.id, userId: user.id },
    },
    data: { lastReadAt: new Date() },
  });
  const kind = chatKind(chat);
  const [chats, others] = await Promise.all([
    chatList(user),
    kind === "group"
      ? db.user.findMany({
          where: {
            companyId: user.companyId,
            id: { notIn: chat.members.map((m) => m.userId) },
          },
          orderBy: { name: "asc" },
        })
      : [],
  ]);
  const messages = [...chat.messages].reverse();
  const name = chatName(chat, user.id);
  const other = kind === "direct" ? chat.members.find((m) => m.userId !== user.id)?.user : null;
  const subtitle =
    kind === "direct" && other
      ? `${ROLE_LABEL[other.role]}${other.title ? ` · ${other.title}` : ""}`
      : kind === "project"
        ? "Project thread · everyone on the project"
        : kind === "company"
          ? `Everyone at ${user.company.name}`
          : `${chat.members.length} members: ${chat.members.map((m) => m.user.name.split(" ")[0]).join(", ")}`;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <LiveRefresh />
      <Card className="hidden self-start overflow-hidden lg:block">
        <ChatList chats={chats} activeId={chat.id} me={user.id} />
      </Card>
      <Card className="flex h-[calc(100dvh-11rem)] min-h-96 flex-col lg:col-span-2 lg:h-[calc(100dvh-4rem)]">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Link href="/messages" className="rounded-lg p-1.5 text-muted hover:bg-bg lg:hidden" aria-label="All chats">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="font-display truncate font-semibold">{name}</h1>
            <p className="truncate text-xs text-muted">{subtitle}</p>
          </div>
          {chat.project && (
            <Link href={`/projects/${chat.project.id}`} className="text-xs font-medium text-brand-text hover:underline">
              Open project
            </Link>
          )}
          {kind === "group" && (
            <details className="relative text-sm">
              <summary className="cursor-pointer list-none rounded-lg border border-line px-2.5 py-1 text-xs">Members</summary>
              <div className="absolute right-0 z-10 mt-2 w-64 space-y-3 rounded-xl border border-line bg-surface p-3 shadow-lg">
                <ul className="space-y-1 text-xs">
                  {chat.members.map((m) => (
                    <li key={m.id}>
                      {m.user.name} <span className="text-muted">· {ROLE_LABEL[m.user.role]}</span>
                    </li>
                  ))}
                </ul>
                {others.length > 0 && (
                  <form action={addToGroup.bind(null, chat.id)} className="space-y-1.5 border-t border-line pt-2">
                    <p className="text-xs font-medium">Add people</p>
                    {others.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-xs">
                        <input type="checkbox" name="members" value={p.id} className="accent-[#ffc107]" /> {p.name}
                      </label>
                    ))}
                    <Button variant="secondary" className="w-full py-1 text-xs">
                      Add
                    </Button>
                  </form>
                )}
                <form action={leaveGroup.bind(null, chat.id)}>
                  <button className="text-xs text-bad hover:underline">Leave group</button>
                </form>
              </div>
            </details>
          )}
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 && <p className="py-12 text-center text-sm text-muted">No messages yet. Say hello.</p>}
          {messages.map((m, i) => {
            const mine = m.authorId === user.id;
            const prev = messages[i - 1];
            const newDay = !prev || !isSameDay(prev.createdAt, m.createdAt);
            const showName = !mine && kind !== "direct" && (newDay || prev.authorId !== m.authorId);
            return (
              <div key={m.id}>
                {newDay && <p className="py-2 text-center text-[11px] font-medium text-muted">{format(m.createdAt, "EEEE, MMM d")}</p>}
                <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2 text-sm", mine ? "rounded-br-md bg-brand text-brand-ink" : "rounded-bl-md bg-bg")}>
                    {showName && (
                      <p className="mb-0.5 text-[11px] font-semibold text-brand-text">
                        {m.author.name} <span className="font-normal text-muted">· {ROLE_LABEL[m.author.role]}</span>
                      </p>
                    )}
                    <Attachments urls={m.attachments} className={m.body ? "mb-1.5" : ""} />
                    {m.body && <p className="break-words whitespace-pre-line">{m.body}</p>}
                    <p className={cn("mt-0.5 text-right text-[10px]", mine ? "text-brand-ink/60" : "text-muted")}>{format(m.createdAt, "h:mm a")}</p>
                  </div>
                </div>
              </div>
            );
          })}
          <ScrollToEnd marker={messages.at(-1)?.id ?? ""} />
        </div>
        <ChatComposer action={sendMessage.bind(null, chat.id)} folder={`chats/${chat.id}`} direct={directUploads} />
      </Card>
    </div>
  );
}
