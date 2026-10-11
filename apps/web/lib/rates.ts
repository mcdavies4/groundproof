export const VISIT_TYPES = {
  standard: { name: "Standard visit", hint: "Nearby, routine check-in: photos, note, about 15 minutes on site." },
  distance: { name: "Distance visit", hint: "Further out or across heavy traffic." },
  first: { name: "First visit or plot visit", hint: "Takes longer: the anchor photos, or walking every beacon of a plot." },
} as const;
export type VisitType = keyof typeof VISIT_TYPES;
export const VISIT_ORDER: VisitType[] = ["standard", "distance", "first"];

export const naira = (n: number) => "₦" + n.toLocaleString("en-GB");

export const REPORTER_RULES = [
  "Charge within Groundproof's price range for your state. The agreed price is the full price.",
  "No extra charges (transport, data, \"logistics\") unless the owner agrees in writing first.",
  "Do every visit in the Groundproof app, at the property. Never send old photos or fake a visit.",
  "Turn up when you said you would, or tell the owner in good time.",
  "For 12 months after Groundproof introduces you to an owner, do all your visits for them through Groundproof, not around it.",
  "Breaking these rules gets you removed from Groundproof.",
];
