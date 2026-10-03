import type { Verdict } from "@/lib/types";

const LABEL: Record<Verdict, string> = {
  verified: "Verified at the building",
  review: "Needs a look",
  flagged: "Flagged",
  pending: "Checking with NIPOST",
};

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return <span className={`verdict ${verdict}`}>{LABEL[verdict]}</span>;
}
