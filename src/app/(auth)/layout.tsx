import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Logo />
        <div className="flex flex-1 items-center">
          <div className="mx-auto w-full max-w-sm py-10">{children}</div>
        </div>
      </div>
      <div className="blueprint relative hidden flex-col justify-end overflow-hidden bg-steel p-12 text-white lg:flex">
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-brand/30 blur-3xl" />
        <p className="font-display relative max-w-md text-3xl leading-tight font-semibold">
          85% of construction projects run over budget. See yours before it does.
        </p>
        <p className="relative mt-4 max-w-md text-white/70">
          Daily site reports, photo evidence and milestone sign-off, with spend tracked against budget in real time.
        </p>
      </div>
    </div>
  );
}
