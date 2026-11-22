/** Shared by the browser and the server: what can be uploaded as evidence, and how big. */
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"];
export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/3gpp", "video/x-m4v"];
export const MAX_IMAGE_MB = 50;
export const MAX_VIDEO_MB = 500;
export const MAX_MEDIA_FILES = 20;

export function isVideo(url: string) {
  return /\.(mp4|mov|m4v|webm|3gp)(\?|#|$)/i.test(url);
}

/** Why a file can't be uploaded, or null when it's fine. */
export function mediaProblem(file: { name: string; type: string; size: number }) {
  const video = file.type.startsWith("video/");
  if (!video && !file.type.startsWith("image/")) return `${file.name} isn't a photo or video`;
  const max = video ? MAX_VIDEO_MB : MAX_IMAGE_MB;
  if (file.size > max * 1024 * 1024) return `${file.name} is over ${max} MB`;
  return null;
}
