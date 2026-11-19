import { Building2, ClipboardCheck, HardHat, Wrench } from "lucide-react";
import { demoLogin } from "@/app/actions/auth";

const ROLES = [
  { role: "OWNER", name: "Olivia", label: "Owner", body: "Funds the build. Signs off milestones and big spend.", Icon: Building2 },
  { role: "MANAGER", name: "Marcus", label: "Project manager", body: "Reviews reports, inspects work, approves invoices.", Icon: ClipboardCheck },
  { role: "SUPERVISOR", name: "Sam", label: "Site supervisor", body: "Files the daily report with photos from site.", Icon: HardHat },
  { role: "CONTRACTOR", name: "Carla", label: "Contractor", body: "Submits finished work and invoices.", Icon: Wrench },
];

export function DemoPicker({ compact = false, dark = false }: { compact?: boolean; dark?: boolean }) {
  return (
    <div className={compact ? "grid grid-cols-2 gap-2" : "grid gap-3 sm:grid-cols-2 lg:grid-cols-4"}>
      {ROLES.map(({ role, name, label, body, Icon }) => (
        <form key={role} action={demoLogin}>
          <input type="hidden" name="role" value={role} />
          <button
            type="submit"
            className={`group h-full w-full rounded-xl border text-left transition ${
              dark ? "border-white/15 bg-white/5 hover:border-brand hover:bg-white/10" : "border-line bg-surface hover:border-brand"
            } ${compact ? "p-3" : "p-5"}`}
          >
            <Icon className={`text-brand ${compact ? "h-4 w-4" : "h-6 w-6"}`} />
            <p className={`mt-2 font-semibold ${compact ? "text-sm" : ""}`}>
              {label}
              {!compact && <span className={dark ? "font-normal text-white/60" : "font-normal text-muted"}> · {name}</span>}
            </p>
            {!compact && <p className={`mt-1 text-sm ${dark ? "text-white/60" : "text-muted"}`}>{body}</p>}
          </button>
        </form>
      ))}
    </div>
  );
}
