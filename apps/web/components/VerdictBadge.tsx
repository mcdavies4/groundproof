import type { Verdict } from "@/lib/types";

const LABEL: Record<Verdict, string> = {
  verified: "Verified at the building",
  review: "Needs a look",
  flagged: "Flagged",
  pending: "Checking with NIPOST",
};

export function VerdictBadge({ verdict, matchType }: { verdict: Verdict; matchType?: "postcode" | "coordinates" | null }) {
  const label = verdict === "verified" && matchType === "coordinates" ? "Location match" : LABEL[verdict];
  return <span className={`verdict ${verdict}`}>{label}</span>;
}
