import Link from "next/link";
import { MapPin } from "lucide-react";
import { Badge, Card, Progress } from "./ui";
import { formatMoney } from "@/lib/money";
import { health, type ProjectSummary } from "@/lib/project-data";

export function ProjectCard({ s, currency }: { s: ProjectSummary; currency: string }) {
  const h = health(s);
  const spentPct = Math.round(s.budget.ratio * 100);
  return (
    <Link href={`/projects/${s.project.id}`} className="group block">
      <Card className="h-full overflow-hidden transition group-hover:border-brand/50 group-hover:shadow-sm">
        <div className="relative h-32 bg-steel">
          {s.project.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.project.coverUrl} alt="" className="h-full w-full object-cover opacity-90" />
          ) : (
            <div className="blueprint h-full w-full" />
          )}
          <div className="absolute top-3 right-3">
            <Badge tone={h.tone}>{h.label}</Badge>
          </div>
        </div>
        <div className="p-5">
          <h3 className="font-display font-semibold group-hover:text-brand">{s.project.name}</h3>
          <p className="mt-1 flex items-center gap-1 text-sm text-muted">
            <MapPin className="h-3.5 w-3.5" /> {s.project.location}
          </p>
          <div className="mt-4 space-y-3 text-sm">
            <div>
              <div className="mb-1 flex justify-between">
                <span className="text-muted">Progress</span>
                <span className="font-medium">
                  {s.progress}% <span className="font-normal text-muted">vs {s.planned}% planned</span>
                </span>
              </div>
              <Progress value={s.progress} tone={s.behindBy > 15 ? "bad" : s.behindBy > 5 ? "warn" : "brand"} />
            </div>
            <div>
              <div className="mb-1 flex justify-between">
                <span className="text-muted">Spent</span>
                <span className="font-medium">
                  {formatMoney(s.budget.spent, currency, true)} <span className="font-normal text-muted">of {formatMoney(s.budget.budgeted, currency, true)}</span>
                </span>
              </div>
              <Progress value={spentPct} tone={spentPct > 100 ? "bad" : spentPct >= 90 ? "warn" : "ok"} />
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
