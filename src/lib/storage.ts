import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];

/** Stores an uploaded file in Vercel Blob when configured, otherwise under public/uploads. Returns its URL. */
export async function storeFile(file: File, folder: string): Promise<string> {
  if (file.size === 0) throw new Error("Empty file");
  if (file.size > MAX_BYTES) throw new Error("Files must be 8 MB or smaller");
  if (!ALLOWED.includes(file.type)) throw new Error("Only images and PDFs can be uploaded");
  const ext = path.extname(file.name).toLowerCase().replace(/[^.a-z0-9]/g, "") || "";
  const name = `${folder}/${randomUUID()}${ext}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(name, file, { access: "public", contentType: file.type });
    return blob.url;
  }
  const dir = path.join(process.cwd(), "public", "uploads", folder);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(process.cwd(), "public", "uploads", name), Buffer.from(await file.arrayBuffer()));
  return `/uploads/${name}`;
}

export function filesFrom(form: FormData, field: string) {
  return form.getAll(field).filter((f): f is File => f instanceof File && f.size > 0);
}
