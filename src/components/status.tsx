import { Badge, type Tone } from "./ui";

const MAP: Record<string, [string, Tone]> = {
  // milestones
  OPEN: ["Open", "neutral"],
  SUBMITTED: ["Awaiting review", "brand"],
  PASSED: ["Awaiting sign-off", "warn"],
  SIGNED_OFF: ["Signed off", "ok"],
  REJECTED: ["Rejected", "bad"],
  // reports
  ACCEPTED: ["Accepted", "ok"],
  RETURNED: ["Returned", "bad"],
  // expenses
  PENDING: ["Pending manager", "brand"],
  MANAGER_APPROVED: ["Pending owner", "warn"],
  APPROVED: ["Approved", "ok"],
  // projects
  PLANNING: ["Planning", "neutral"],
  ACTIVE: ["Active", "ok"],
  ON_HOLD: ["On hold", "warn"],
  COMPLETED: ["Completed", "steel"],
};

export function StatusBadge({ status }: { status: string }) {
  const [label, tone] = MAP[status] ?? [status, "neutral"];
  return <Badge tone={tone}>{label}</Badge>;
}
