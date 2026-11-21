import type { Metadata } from "next";
import type { DocumentCategory } from "@prisma/client";
import { format } from "date-fns";
import { FileText, PenLine } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getProjectForUser } from "@/lib/access";
import { db } from "@/lib/db";
import { ROLE_LABEL, can } from "@/lib/permissions";
import { fullySigned, missingSigners } from "@/lib/commercial";
import { shortPrint } from "@/lib/signature";
import { Badge, Card, CardHeader, EmptyState, Field, Input, Select } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { InlineForm } from "@/components/decision-form";
import { signDocument, uploadDocument } from "@/app/actions/records";

export const metadata: Metadata = { title: "Documents" };

const CATEGORY: Record<DocumentCategory, string> = { DRAWING: "Drawings", CONTRACT: "Contracts", PERMIT: "Permits", SPECIFICATION: "Specifications", REPORT: "Reports", OTHER: "Other" };

export default async function DocumentsPage({ params, searchParams }: PageProps<"/projects/[id]/documents">) {
  const { id } = await params;
  const { category } = (await searchParams) as { category?: DocumentCategory };
  const user = await requireUser();
  const project = await getProjectForUser(user, id);
  const docs = await db.document.findMany({
    where: { projectId: project.id },
    include: { uploadedBy: true, signatures: { include: { user: true }, orderBy: { signedAt: "asc" } } },
    orderBy: [{ title: "asc" }, { version: "desc" }],
  });
  // Latest version of each title, with its earlier versions.
  const groups = new Map<string, typeof docs>();
  for (const d of docs) {
    const k = d.title.toLowerCase();
    groups.set(k, [...(groups.get(k) ?? []), d]);
  }
  const latest = [...groups.values()].map((g) => ({ doc: g[0], older: g.slice(1) })).filter((g) => !category || g.doc.category === category);
  const toSign = latest.filter((g) => missingSigners(g.doc.signerRoles, g.doc.signatures).includes(user.role));

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div className="flex flex-wrap gap-2 text-sm">
          <a href="?" className={!category ? "rounded-full bg-steel px-3 py-1 text-white" : "rounded-full border border-line px-3 py-1 text-muted hover:text-ink"}>All</a>
          {(Object.keys(CATEGORY) as DocumentCategory[]).map((c) => (
            <a key={c} href={`?category=${c}`} className={category === c ? "rounded-full bg-steel px-3 py-1 text-white" : "rounded-full border border-line px-3 py-1 text-muted hover:text-ink"}>
              {CATEGORY[c]}
            </a>
          ))}
        </div>
        {toSign.length > 0 && <p className="rounded-lg border border-brand/30 bg-brand-soft px-4 py-2 text-sm text-brand-text">{toSign.length} document{toSign.length === 1 ? " needs" : "s need"} your signature.</p>}
        {latest.length === 0 && <Card><EmptyState title="No documents" body="Upload drawings, contracts and permits. Contracts can be signed here by each party." /></Card>}
        {latest.map(({ doc, older }) => {
          const missing = missingSigners(doc.signerRoles, doc.signatures);
          const signed = fullySigned(doc.signerRoles, doc.signatures);
          return (
            <Card key={doc.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <a href={doc.url} target="_blank" rel="noreferrer" className="flex min-w-0 items-start gap-3 hover:underline">
                  <FileText className="mt-0.5 h-5 w-5 shrink-0 text-brand-text" />
                  <span className="min-w-0">
                    <span className="block font-semibold">{doc.title}</span>
                    <span className="block text-xs text-muted">{CATEGORY[doc.category]} · v{doc.version} · {doc.fileName} · {doc.uploadedBy.name}, {format(doc.createdAt, "MMM d, yyyy")}</span>
                  </span>
                </a>
                {doc.signerRoles.length > 0 && (signed ? <Badge tone="ok">Fully signed</Badge> : <Badge tone="warn">Awaiting {missing.map((r) => ROLE_LABEL[r]).join(", ")}</Badge>)}
              </div>
              {doc.signatures.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {doc.signatures.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 text-xs">
                      <PenLine className="h-3.5 w-3.5 text-ok" />
                      <span className="font-display text-sm italic">{s.signedName}</span>
                      <span className="text-muted">{ROLE_LABEL[s.role]} · {format(s.signedAt, "MMM d, h:mm a")} · <span className="font-mono">{shortPrint(s.fingerprint)}</span></span>
                    </li>
                  ))}
                </ul>
              )}
              {missing.includes(user.role) && (
                <div className="mt-3 rounded-lg border border-line bg-bg p-3">
                  <InlineForm action={signDocument.bind(null, project.id, doc.id)} submitLabel="Sign document" variant="success">
                    <Input name="signature" placeholder={`Type your full name: ${user.name}`} autoComplete="off" className="font-display italic" />
                    <label className="flex items-start gap-2 text-xs">
                      <input type="checkbox" name="agree" className="mt-0.5 accent-[#ffc107]" />I have read version {doc.version} and agree to sign it electronically as {ROLE_LABEL[user.role]}.
                    </label>
                  </InlineForm>
                </div>
              )}
              {older.length > 0 && (
                <details className="mt-3 text-xs text-muted">
                  <summary className="cursor-pointer">Earlier versions ({older.length})</summary>
                  <ul className="mt-1 space-y-1">
                    {older.map((o) => (
                      <li key={o.id}>
                        <a href={o.url} target="_blank" rel="noreferrer" className="hover:underline">v{o.version} · {o.fileName} · {format(o.createdAt, "MMM d, yyyy")}</a>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </Card>
          );
        })}
      </div>

      {can.uploadDocument(user.role) && (
        <Card className="self-start">
          <CardHeader title="Upload a document" subtitle="Same title as an existing document makes a new version." />
          <div className="p-5">
            <ActionForm action={uploadDocument.bind(null, project.id)} submitLabel="Upload">
              <Field label="Title"><Input name="title" placeholder="Structural drawings" required /></Field>
              <Field label="Category">
                <Select name="category" defaultValue="DRAWING">
                  {(Object.keys(CATEGORY) as DocumentCategory[]).map((c) => <option key={c} value={c}>{CATEGORY[c].replace(/s$/, "")}</option>)}
                </Select>
              </Field>
              <Field label="File" hint="PDF or image, up to 8 MB."><Input name="file" type="file" accept="application/pdf,image/*" required /></Field>
              <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium">Needs signatures from</legend>
                {(["OWNER", "MANAGER", "CONTRACTOR", "SUPERVISOR"] as const).map((r) => (
                  <label key={r} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="signers" value={r} className="accent-[#ffc107]" /> {ROLE_LABEL[r]}
                  </label>
                ))}
              </fieldset>
            </ActionForm>
          </div>
        </Card>
      )}
    </div>
  );
}
