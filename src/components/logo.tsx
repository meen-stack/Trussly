import Link from "next/link";

export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/trussly-mark.png" alt="" aria-hidden="true" className={`${className} rounded-lg`} />;
}

export function Logo({ href = "/", tagline = false }: { dark?: boolean; href?: string; tagline?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className="font-display text-xl font-extrabold tracking-tight text-white">
          Trussl<span className="text-brand">y</span>
        </span>
        {tagline && <span className="mt-1 text-[10px] font-medium tracking-[0.18em] text-white/60 uppercase">Plan • Build • Manage</span>}
      </span>
    </Link>
  );
}
