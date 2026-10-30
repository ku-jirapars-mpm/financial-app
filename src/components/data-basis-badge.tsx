import { Badge } from "@/components/ui/card";

export function DataBasisBadge({ basis }: { basis: "recorded" | "reconstructed_estimate" }) {
  return basis === "recorded" ? <Badge tone="positive">recorded</Badge> : <Badge tone="warning">reconstructed estimate</Badge>;
}
