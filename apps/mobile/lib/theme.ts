import { StyleSheet } from "react-native";

export const c = {
  paper: "#f3f5f2",
  ink: "#10251f",
  inkSoft: "#3d5149",
  concrete: "#c9cec6",
  plate: "#f4c531",
  verified: "#1e7a4e",
  review: "#a86a12",
  flagged: "#b3261e",
  white: "#ffffff",
};

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.paper },
  pad: { padding: 20 },
  h1: { fontSize: 28, fontWeight: "800", color: c.ink, marginBottom: 8 },
  h2: { fontSize: 20, fontWeight: "700", color: c.ink, marginBottom: 6 },
  body: { fontSize: 16, color: c.ink, lineHeight: 23 },
  muted: { fontSize: 15, color: c.inkSoft, lineHeight: 21 },
  input: {
    minHeight: 48, borderWidth: 1, borderColor: "#9aa39a", borderRadius: 4,
    backgroundColor: c.white, paddingHorizontal: 12, fontSize: 17, color: c.ink,
  },
  btn: { minHeight: 50, borderRadius: 4, backgroundColor: c.ink, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  btnText: { color: c.paper, fontSize: 17, fontWeight: "700" },
  btnSecondary: { backgroundColor: "transparent", borderWidth: 2, borderColor: c.ink },
  btnSecondaryText: { color: c.ink },
  error: { color: c.flagged, fontSize: 15, marginTop: 8 },
  plate: {
    alignSelf: "flex-start", backgroundColor: c.plate, borderWidth: 3, borderColor: c.ink,
    borderRadius: 6, paddingVertical: 6, paddingHorizontal: 14,
  },
  plateText: { fontSize: 20, fontWeight: "800", letterSpacing: 1.5, color: c.ink, fontVariant: ["tabular-nums"] },
});
