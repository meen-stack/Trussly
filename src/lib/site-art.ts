/**
 * Draws a simple, deterministic "site photo" illustration as SVG.
 * The building rises with progress, so the demo photo timeline shows the build moving forward.
 */
export function siteArt(opts: { progress: number; seed: number; floors: number; weather: string; variant?: "frame" | "detail" }) {
  const { progress, seed, floors, weather } = opts;
  const rnd = mulberry32(seed);
  const W = 800;
  const H = 600;
  const ground = 470;
  const sky =
    weather.includes("rain") ? ["#8d99a6", "#c5ccd3"] : weather === "Cloudy" ? ["#9fb3c8", "#dde5ec"] : ["#5fa8e8", "#cfe6f7"];
  const builtFloors = Math.max(0, Math.min(floors, Math.round((progress / 100) * floors * 1.15)));
  const floorH = 42;
  const bx = 220 + Math.round(rnd() * 60);
  const bw = 330;
  const parts: string[] = [];

  parts.push(`<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient></defs>`);
  parts.push(`<rect width="${W}" height="${H}" fill="url(#s)"/>`);
  // distant city
  for (let i = 0; i < 9; i++) {
    const w = 50 + rnd() * 60;
    const h = 60 + rnd() * 120;
    parts.push(`<rect x="${i * 95 - 20}" y="${ground - h}" width="${w}" height="${h}" fill="#b8c2cc" opacity="0.55"/>`);
  }
  if (weather !== "Sunny" && weather !== "Hot") {
    for (let i = 0; i < 4; i++) parts.push(`<ellipse cx="${100 + rnd() * 600}" cy="${60 + rnd() * 80}" rx="${70 + rnd() * 60}" ry="22" fill="#fff" opacity="0.7"/>`);
  } else {
    parts.push(`<circle cx="680" cy="90" r="38" fill="#ffe08a" opacity="0.9"/>`);
  }
  // ground and site fence
  parts.push(`<rect y="${ground}" width="${W}" height="${H - ground}" fill="#a68a64"/>`);
  parts.push(`<rect y="${ground}" width="${W}" height="8" fill="#8a7050"/>`);
  // foundation slab
  if (progress > 3) parts.push(`<rect x="${bx - 10}" y="${ground - 12}" width="${bw + 20}" height="14" fill="#9ca3ab"/>`);
  // floors: concrete slabs + columns, top floor shows rebar
  for (let f = 0; f < builtFloors; f++) {
    const y = ground - 12 - (f + 1) * floorH;
    const top = f === builtFloors - 1;
    for (let c = 0; c <= 5; c++) parts.push(`<rect x="${bx + c * (bw / 5) - 5}" y="${y}" width="10" height="${floorH}" fill="#b5bcc4"/>`);
    parts.push(`<rect x="${bx - 6}" y="${y}" width="${bw + 12}" height="8" fill="#c9ced4"/>`);
    const walled = f < builtFloors - 2;
    if (walled) {
      parts.push(`<rect x="${bx}" y="${y + 8}" width="${bw}" height="${floorH - 8}" fill="#d9c7a7"/>`);
      for (let k = 0; k < 5; k++) parts.push(`<rect x="${bx + 20 + k * 64}" y="${y + 16}" width="34" height="${floorH - 22}" fill="#46637d"/>`);
    }
    if (top) for (let r = 0; r < 14; r++) parts.push(`<line x1="${bx + r * 24}" y1="${y}" x2="${bx + r * 24}" y2="${y - 16}" stroke="#7a4a2a" stroke-width="2"/>`);
  }
  // scaffolding on the right side
  const sh = builtFloors * floorH + 20;
  if (builtFloors > 0) {
    for (let i = 0; i <= Math.ceil(sh / 30); i++) parts.push(`<line x1="${bx + bw + 10}" y1="${ground - i * 30}" x2="${bx + bw + 46}" y2="${ground - i * 30}" stroke="#d97706" stroke-width="3"/>`);
    parts.push(`<line x1="${bx + bw + 10}" y1="${ground}" x2="${bx + bw + 10}" y2="${ground - sh}" stroke="#d97706" stroke-width="3"/>`);
    parts.push(`<line x1="${bx + bw + 46}" y1="${ground}" x2="${bx + bw + 46}" y2="${ground - sh}" stroke="#d97706" stroke-width="3"/>`);
  }
  // tower crane
  const cx = 120;
  const ct = 90;
  parts.push(`<rect x="${cx}" y="${ct}" width="14" height="${ground - ct}" fill="#f59f00"/>`);
  for (let y = ct; y < ground; y += 18) parts.push(`<line x1="${cx}" y1="${y}" x2="${cx + 14}" y2="${y + 18}" stroke="#b8860b" stroke-width="2"/>`);
  parts.push(`<rect x="${cx - 70}" y="${ct - 10}" width="420" height="12" fill="#f59f00"/>`);
  parts.push(`<rect x="${cx - 70}" y="${ct + 2}" width="40" height="24" fill="#495057"/>`);
  const hook = cx + 120 + Math.round(rnd() * 200);
  parts.push(`<line x1="${hook}" y1="${ct + 2}" x2="${hook}" y2="${ct + 120 + rnd() * 80}" stroke="#343a40" stroke-width="2"/>`);
  // workers
  for (let i = 0; i < 4; i++) {
    const x = 80 + rnd() * 640;
    parts.push(`<rect x="${x}" y="${ground + 18}" width="10" height="22" fill="#1f2a37"/><circle cx="${x + 5}" cy="${ground + 12}" r="6" fill="#f59f00"/>`);
  }
  if (weather.includes("rain")) {
    for (let i = 0; i < 80; i++) {
      const x = rnd() * W;
      const y = rnd() * ground;
      parts.push(`<line x1="${x}" y1="${y}" x2="${x - 6}" y2="${y + 18}" stroke="#ffffff" stroke-width="1.2" opacity="0.6"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${parts.join("")}</svg>`;
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
