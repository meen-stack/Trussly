import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { IMAGE_TYPES, MAX_MEDIA_FILES, VIDEO_TYPES, mediaProblem } from "./media";

const MAX_DOC_BYTES = 50 * 1024 * 1024;
const ALLOWED = [...IMAGE_TYPES, ...VIDEO_TYPES, "application/pdf"];

/** Whether uploads go straight from the browser to Vercel Blob. */
export const directUploads = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

/** Stores a file sent through the server: in Vercel Blob when configured, otherwise under public/uploads. Returns its URL. */
export async function storeFile(file: File, folder: string): Promise<string> {
  if (file.size === 0) throw new Error("Empty file");
  if (!ALLOWED.includes(file.type)) throw new Error("Only photos, videos and PDFs can be uploaded");
  const problem = file.type === "application/pdf" ? (file.size > MAX_DOC_BYTES ? `${file.name} is over 50 MB` : null) : mediaProblem(file);
  if (problem) throw new Error(problem);
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

/** A URL the browser uploaded straight to our Blob store, inside the folder this form is for. */
function ownBlobUrl(value: string, folder: string) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname.endsWith(".public.blob.vercel-storage.com") && u.pathname.startsWith(`/${folder}/`);
  } catch {
    return false;
  }
}

/**
 * Photos and videos from a MediaPicker field: files already uploaded from the browser arrive as URLs
 * in `<field>Url`, and any sent with the form are stored here. Throws with a readable message.
 */
export async function mediaFrom(form: FormData, field: string, folder: string): Promise<string[]> {
  const urls = form.getAll(`${field}Url`).map(String).filter((u) => ownBlobUrl(u, folder));
  const files = filesFrom(form, field);
  if (urls.length + files.length > MAX_MEDIA_FILES) throw new Error(`Attach up to ${MAX_MEDIA_FILES} photos or videos.`);
  const stored = await Promise.all(files.map((f) => storeFile(f, folder)));
  return [...urls, ...stored];
}
