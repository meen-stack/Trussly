import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/permissions";
import { chatList, ensureDefaultChats } from "@/lib/messages";
import { Button, Card, CardHeader, Field, Input, PageHeader, Select } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { LiveRefresh } from "@/components/chat";
import { createGroup, startDirect } from "@/app/actions/messages";
import { ChatList } from "./chat-list";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  const user = await requireUser();
  await ensureDefaultChats(user);
  const [chats, people] = await Promise.all([
    chatList(user),
    db.user.findMany({
      where: { companyId: user.companyId, NOT: { id: user.id } },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
  ]);
  return (
    <>
      <PageHeader title="Messages" />
      <LiveRefresh every={10000} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <ChatList chats={chats} me={user.id} />
        </Card>
        <div className="space-y-6 self-start">
          <Card>
            <CardHeader title="Message someone" />
            <form action={startDirect} className="flex gap-2 p-5">
              <Select name="userId" required defaultValue="" aria-label="Person">
                <option value="" disabled>
                  Choose a person…
                </option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({ROLE_LABEL[p.role]})
                  </option>
                ))}
              </Select>
              <Button>Open</Button>
            </form>
          </Card>
          <Card>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 font-display font-semibold [&::-webkit-details-marker]:hidden">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-lg leading-none text-brand-ink transition-transform group-open:rotate-45">
                  +
                </span>
                New group chat
              </summary>
              <div className="border-t border-line p-5">
                <ActionForm action={createGroup} submitLabel="Create group">
                  <Field label="Group name">
                    <Input name="title" placeholder="Roofing coordination" required />
                  </Field>
                  <fieldset className="max-h-56 space-y-1.5 overflow-y-auto">
                    <legend className="mb-1.5 text-sm font-medium">Members</legend>
                    {people.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="members" value={p.id} className="accent-[#ffc107]" />
                        {p.name} <span className="text-xs text-muted">{ROLE_LABEL[p.role]}</span>
                      </label>
                    ))}
                  </fieldset>
                </ActionForm>
              </div>
            </details>
          </Card>
        </div>
      </div>
    </>
  );
}
