// Store links for the reporter app. Paste the real URL when each store listing goes live.
export const APP_LINKS: {
  android: { status: "in-review" | "live"; url: string | null };
  ios: { status: "later" | "in-review" | "live"; url: string | null };
} = {
  android: { status: "in-review", url: null },
  ios: { status: "later", url: null },
};
