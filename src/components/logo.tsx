import Link from "next/link";

export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/trussly-mark.png" alt="" aria-hidden="true" className={`${className} rounded-lg`} />;
}

export function Logo({ dark = false, href = "/", tagline = false }: { dark?: boolean; href?: string; tagline?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className={`font-display text-xl font-extrabold tracking-tight ${dark ? "text-white" : "text-ink"}`}>
          Trussl<span className={dark ? "text-brand" : "text-brand-text"}>y</span>
        </span>
        {tagline && (
          <span className={`mt-1 text-[10px] font-semibold tracking-[0.18em] uppercase ${dark ? "text-white/60" : "text-muted"}`}>
            Plan • Build • Manage
          </span>
        )}
      </span>
    </Link>
  );
}
