import Link from "next/link";

export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#e8590c" />
      <path d="M8 23V13l8-5 8 5v10" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M12 23v-6h8v6" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" />
      <circle cx="16" cy="13.5" r="1.6" fill="#fff" />
    </svg>
  );
}

export function Logo({ dark = false, href = "/" }: { dark?: boolean; href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2">
      <LogoMark />
      <span className={`font-display text-lg font-semibold ${dark ? "text-white" : "text-ink"}`}>BuildTrace</span>
    </Link>
  );
}
