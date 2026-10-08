// Store links for the reporter app. Paste the real URL when each store listing goes live.
export const APP_LINKS: {
  android: { status: "in-review" | "live"; url: string | null };
  ios: { status: "later" | "in-review" | "live"; url: string | null };
} = {
  android: { status: "live", url: "https://play.google.com/store/apps/details?id=ng.the36th.groundproof" },
  ios: { status: "later", url: null },
};
