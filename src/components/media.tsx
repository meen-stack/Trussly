"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Camera, Play, X } from "lucide-react";
import { MAX_IMAGE_MB, MAX_MEDIA_FILES, MAX_VIDEO_MB, isVideo, mediaProblem } from "@/lib/media";

type Item = { key: string; preview: string; video: boolean; url?: string; percent: number; error?: string; file: File };

/**
 * Photo and video picker. With Vercel Blob set up, files upload straight from the phone at full quality
 * while the form is filled in, and the form only sends their URLs. Otherwise the files go with the form.
 */
export function MediaPicker({
  name,
  folder,
  direct,
  required,
  label = "Add photos or videos",
  compact,
  onBusyChange,
}: {
  name: string;
  folder: string;
  direct: boolean;
  required?: boolean;
  label?: string;
  compact?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const busy = items.some((i) => direct && !i.url && !i.error);
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);

  const [waitNote, setWaitNote] = useState(false);
  const busyRef = useRef(false);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  // Clear after the form is reset by a successful submit, and hold the submit until uploads finish.
  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    const clear = () => setItems([]);
    const hold = (e: SubmitEvent) => {
      if (!busyRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      setWaitNote(true);
    };
    form.addEventListener("reset", clear);
    form.addEventListener("submit", hold, true);
    return () => {
      form.removeEventListener("reset", clear);
      form.removeEventListener("submit", hold, true);
    };
  }, []);

  const update = (key: string, patch: Partial<Item>) => setItems((all) => all.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const pick = (files: FileList | null) => {
    const picked = Array.from(files ?? []).slice(0, MAX_MEDIA_FILES - items.length);
    const added = picked.map((file) => {
      const problem = mediaProblem(file);
      return { key: `${file.name}-${file.size}-${Math.random()}`, preview: URL.createObjectURL(file), video: file.type.startsWith("video/"), percent: 0, error: problem ?? undefined, file };
    });
    setItems((all) => [...all, ...added]);
    if (!direct) return;
    for (const item of added) {
      if (item.error) continue;
      const safe = item.file.name.replace(/[^\w.-]+/g, "-").slice(-80) || "upload";
      upload(`${folder}/${safe}`, item.file, {
        access: "public",
        handleUploadUrl: "/api/upload",
        multipart: item.file.size > 20 * 1024 * 1024,
        contentType: item.file.type,
        onUploadProgress: ({ percentage }) => update(item.key, { percent: Math.round(percentage) }),
      })
        .then((blob) => update(item.key, { url: blob.url, percent: 100 }))
        .catch((e: Error) => update(item.key, { error: e.message || "Upload failed" }));
    }
  };

  // Without direct uploads the files travel with the form, so keep the input's file list in step.
  useEffect(() => {
    if (direct || !input.current) return;
    const dt = new DataTransfer();
    items.filter((i) => !i.error).forEach((i) => dt.items.add(i.file));
    input.current.files = dt.files;
  }, [items, direct]);

  const good = items.filter((i) => !i.error);
  return (
    <div className={compact ? "" : "space-y-2"}>
      <label
        className={
          compact
            ? "flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-line text-muted hover:bg-bg hover:text-ink"
            : "flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-bg px-4 py-4 text-sm font-medium text-muted hover:border-brand hover:text-ink"
        }
        title={label}
      >
        <Camera className="h-4 w-4" />
        {!compact && label}
        <input
          ref={input}
          type="file"
          accept="image/*,video/*"
          multiple
          // The file input itself only carries files when they aren't uploaded directly.
          name={direct ? undefined : name}
          aria-label={label}
          // Required is enforced on a hidden field below, since a picked file list is cleared after upload.
          className="sr-only"
          onChange={(e) => {
            pick(e.target.files);
            if (direct) e.target.value = "";
          }}
        />
      </label>
      {required && good.length === 0 && (
        <input tabIndex={-1} aria-hidden required value="" onChange={() => {}} className="pointer-events-none absolute h-0 w-0 opacity-0" onInvalid={(e) => e.currentTarget.setCustomValidity("Add at least one photo or video")} />
      )}
      {items.length > 0 && (
        <ul
          className={
            compact
              ? "absolute right-3 bottom-full left-3 mb-1 flex flex-wrap gap-2 rounded-lg border border-line bg-surface p-2 shadow-lg"
              : "grid grid-cols-3 gap-2 sm:grid-cols-4"
          }
        >
          {items.map((i) => (
            <li key={i.key} className={`relative overflow-hidden rounded-md bg-ink/5 ${compact ? "h-16 w-16" : "aspect-square"}`}>
              {i.video ? (
                <video src={`${i.preview}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={i.preview} alt="" className="h-full w-full object-cover" />
              )}
              {i.video && !i.error && <Play className="absolute top-1 left-1 h-4 w-4 fill-white text-white drop-shadow" />}
              {i.url && <input type="hidden" name={`${name}Url`} value={i.url} />}
              {direct && !i.url && !i.error && (
                <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/30">
                  <div className="h-full bg-brand transition-all" style={{ width: `${i.percent}%` }} />
                </div>
              )}
              {i.error && <p className="absolute inset-0 flex items-center bg-bad/85 p-1 text-center text-[10px] leading-tight text-white">{i.error}</p>}
              <button
                type="button"
                aria-label="Remove"
                onClick={() => setItems((all) => all.filter((x) => x.key !== i.key))}
                className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {waitNote && busy && <p className="text-xs font-medium text-warn">Wait for uploads to finish, then send.</p>}
      {!compact && (
        <p className="text-xs text-muted">
          Photos up to {MAX_IMAGE_MB} MB, videos up to {MAX_VIDEO_MB} MB.
        </p>
      )}
    </div>
  );
}

/** Shows an uploaded photo or video. Thumbnails open the file full size; full items play inline. */
export function Media({ url, alt = "", className = "", thumb }: { url: string; alt?: string; className?: string; thumb?: boolean }) {
  if (isVideo(url)) {
    if (thumb) {
      return (
        <a href={url} target="_blank" rel="noreferrer" className={`relative block overflow-hidden bg-ink ${className}`} aria-label="Play video">
          <video src={`${url}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55">
              <Play className="h-4 w-4 fill-white text-white" />
            </span>
          </span>
        </a>
      );
    }
    return <video src={url} controls playsInline preload="metadata" className={`bg-ink ${className}`} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} loading="lazy" className={className} />
  );
}

/** Photos and videos attached to a message. Videos play in place; photos open full size. */
export function Attachments({ urls, className = "" }: { urls: string[]; className?: string }) {
  if (!urls.length) return null;
  return (
    <div className={`grid gap-1.5 ${urls.length > 1 ? "grid-cols-2" : "grid-cols-1"} ${className}`}>
      {urls.map((url) =>
        isVideo(url) ? (
          <Media key={url} url={url} className="max-h-72 w-full rounded-lg object-cover" />
        ) : (
          <a key={url} href={url} target="_blank" rel="noreferrer">
            <Media url={url} alt="Attached photo" className="max-h-72 w-full rounded-lg object-cover" />
          </a>
        ),
      )}
    </div>
  );
}
