import { siteArt } from "@/lib/site-art";

/** Illustrated site photos for the seeded demo company. */
export function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const num = (k: string, d: number, max: number) => Math.min(Math.max(Number(q.get(k)) || d, 0), max);
  const svg = siteArt({
    progress: num("progress", 30, 100),
    seed: num("seed", 1, 1e6),
    floors: num("floors", 6, 12),
    weather: (q.get("weather") ?? "Sunny").slice(0, 20),
  });
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=31536000, immutable" } });
}
